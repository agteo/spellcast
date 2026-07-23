// Records short pose templates for custom spells, and matches them live.

import { LM } from '../pose/landmarks.js';
import {
  normalizePoseFrame,
  matchTemplate,
  bindingFromSpell,
} from './catalog.js';

const SAMPLE_HZ = 18;
const MAX_BUFFER_SEC = 3.5;
const DEFAULT_RECORD_SEC = 2.2;
const MATCH_THRESHOLD = 0.62;

/**
 * Rolling pose buffer + one recognizer factory per saved spell.
 */
export class SpellLibrary {
  constructor() {
    /** @type {Array<{t:number, frame: object}>} */
    this.live = [];
    this.time = 0;
    this._sampleAcc = 0;
    /** @type {null | { until: number, frames: object[], label: string, durationSec: number }} */
    this.recording = null;
    /** @type {Map<string, object>} */
    this.spells = new Map();
  }

  /** Push the latest pose into the live buffer (and active recording). */
  observe(pose, dt = 1 / 60) {
    this.time += dt;
    this._sampleAcc += dt;
    const step = 1 / SAMPLE_HZ;
    if (this._sampleAcc < step) return;
    this._sampleAcc -= step;

    const frame = normalizePoseFrame(pose);
    if (!frame) return;
    this.live.push({ t: this.time, frame });
    const keepAfter = this.time - MAX_BUFFER_SEC;
    while (this.live.length && this.live[0].t < keepAfter) this.live.shift();

    if (this.recording) this.recording.frames.push(frame);
  }

  startRecording({ durationSec = DEFAULT_RECORD_SEC, label = 'Custom spell' } = {}) {
    this.recording = {
      until: this.time + durationSec,
      frames: [],
      label,
      durationSec,
    };
  }

  get isRecording() {
    return !!this.recording;
  }

  get recordProgress() {
    if (!this.recording) return null;
    const { until, durationSec } = this.recording;
    const left = Math.max(0, until - this.time);
    return Math.min(1, Math.max(0, 1 - left / durationSec));
  }

  finishRecording() {
    if (!this.recording) return null;
    if (this.time < this.recording.until) return null;
    const done = this.recording;
    this.recording = null;
    return {
      frames: done.frames,
      durationSec: done.durationSec,
      label: done.label,
      tooShort: done.frames.length < 6,
    };
  }

  cancelRecording() {
    this.recording = null;
  }

  registerSpell(spell) {
    this.spells.set(spell.id, spell);
  }

  unregisterSpell(id) {
    this.spells.delete(id);
  }

  clearSpells() {
    this.spells.clear();
  }

  makeRecognizers() {
    return [...this.spells.values()].map((spell) => this.#recognizerFor(spell));
  }

  #recognizerFor(spell) {
    const template = spell.frames;
    const threshold = spell.matchThreshold ?? MATCH_THRESHOLD;
    const cooldown = spell.cooldown ?? 2.2;
    const binding = bindingFromSpell(spell);
    const need = template.length;
    const windowExtra = Math.max(3, Math.floor(need * 0.25));

    return {
      update: (pose) => {
        if (this.live.length < need) return null;
        const liveFrames = this.live.slice(-(need + windowExtra)).map((s) => s.frame);
        const confidence = matchTemplate(template, liveFrames);
        if (confidence < threshold * 0.85) return null;

        const poseLw = pose?.[LM.LEFT_WRIST];
        const poseRw = pose?.[LM.RIGHT_WRIST];
        let position = { x: 0.5, y: 0.45 };
        let hand = 'Right';
        if (poseLw?.visibility > 0.4 || poseRw?.visibility > 0.4) {
          const leftOk = (poseLw?.visibility || 0) >= (poseRw?.visibility || 0);
          const pick = leftOk ? poseLw : poseRw;
          hand = leftOk ? 'Left' : 'Right';
          if (poseLw?.visibility > 0.4 && poseRw?.visibility > 0.4) {
            position = { x: (poseLw.x + poseRw.x) / 2, y: (poseLw.y + poseRw.y) / 2 };
          } else {
            position = { x: pick.x, y: pick.y };
          }
        } else if (pose?.[LM.NOSE]?.visibility > 0.4) {
          position = { x: pose[LM.NOSE].x, y: pose[LM.NOSE].y };
        }

        return {
          gesture: spell.id,
          confidence,
          hand,
          position,
          label: spell.label,
          _enter: confidence >= threshold,
          _instant: true,
          _cooldown: cooldown,
          _binding: binding,
        };
      },
    };
  }
}
