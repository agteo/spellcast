// Gesture registry: hysteresis + per-gesture cooldown, characters.js-style.
// Each recognizer: update(pose, hands, dt) → event|null
// Events: { gesture, confidence, hand, position, ... }

import * as fingerHeart from './fingerHeart.js';
import * as strangeCircle from './strangeCircle.js';
import * as dab from './dab.js';
import * as armsV from './armsV.js';
import * as fingerGun from './fingerGun.js';
import { GESTURE } from './thresholds.js';

const RECOGNIZERS = [fingerHeart, strangeCircle, dab, armsV, fingerGun];
export const STOCK_RECOGNIZERS = RECOGNIZERS;

/**
 * Tracks enter/exit with hysteresis and enforces cooldowns so a held pose
 * doesn't spam the effects engine. Instant gestures (trail completions)
 * fire on the first confident frame via `_instant`.
 */
export class GestureEngine {
  /**
   * @param {object} [opts]
   * @param {number} [opts.enterFrames] consecutive hits to fire
   * @param {number} [opts.exitFrames] consecutive misses to clear active
   * @param {number} [opts.cooldownSec] default silence after a fire
   */
  constructor(opts = {}) {
    this.enterFrames = opts.enterFrames ?? GESTURE.enterFrames;
    this.exitFrames = opts.exitFrames ?? GESTURE.exitFrames;
    this.cooldownSec = opts.cooldownSec ?? GESTURE.cooldownSec;
    this.recognizers = opts.recognizers ?? RECOGNIZERS;
    /** @type {Map<string, { hits: number, misses: number, active: boolean, coolUntil: number }>} */
    this.state = new Map();
    this.time = 0;
  }

  #key(gesture, hand) {
    return `${gesture}:${hand || '*'}`;
  }

  #slot(key) {
    let s = this.state.get(key);
    if (!s) {
      s = { hits: 0, misses: 0, active: false, coolUntil: 0 };
      this.state.set(key, s);
    }
    return s;
  }

  /**
   * @returns {Array<{ gesture, confidence, hand, position, radius?: number }>}
   */
  update(pose, hands, dt = 1 / 60) {
    this.time += dt;
    const events = [];
    const seen = new Set();

    for (const rec of this.recognizers) {
      const raw = rec.update(pose, hands, dt);
      if (!raw) continue;

      const key = this.#key(raw.gesture, raw.hand);
      seen.add(key);
      const slot = this.#slot(key);

      const entering = raw._enter !== undefined ? raw._enter : raw.confidence >= 0.55;
      if (entering) {
        slot.misses = 0;
        if (this.time < slot.coolUntil) {
          slot.hits = 0;
          continue;
        }
        slot.hits += 1;
      } else {
        slot.misses += 1;
        slot.hits = 0;
        // A recognizer can remain present inside its looser exit band while no
        // longer satisfying the enter threshold. Such frames must be allowed
        // to rearm the slot; previously `seen` prevented the pass below from
        // ever clearing `active`.
        if (slot.active && slot.misses >= this.exitFrames) slot.active = false;
      }

      const needHits = raw._instant ? 1 : this.enterFrames;
      if (!slot.active && slot.hits >= needHits) {
        slot.active = true;
        const cool = raw._cooldown ?? this.cooldownSec;
        slot.coolUntil = this.time + cool;
        slot.hits = 0;
        const { _enter, _instant, _cooldown, _ratio, _binding, ...event } = raw;
        // Keep `_binding` for custom spells (EffectsEngine / SpellAnimator).
        events.push(_binding ? { ...event, _binding } : event);
      }
    }

    for (const [key, slot] of this.state) {
      if (seen.has(key)) continue;
      slot.misses += 1;
      slot.hits = 0;
      if (slot.active && slot.misses >= this.exitFrames) {
        slot.active = false;
      }
    }

    return events;
  }
}
