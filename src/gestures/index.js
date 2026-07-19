// Gesture registry: hysteresis + per-gesture cooldown, characters.js-style.
// Each recognizer: update(pose, hands, dt) → event|null
// Events: { gesture, confidence, hand, position }

import * as fingerHeart from './fingerHeart.js';

const RECOGNIZERS = [fingerHeart];

/**
 * Tracks enter/exit with hysteresis and enforces cooldowns so a held pose
 * doesn't spam the effects engine.
 */
export class GestureEngine {
  /**
   * @param {object} [opts]
   * @param {number} [opts.enterFrames=4] consecutive hits to fire
   * @param {number} [opts.exitFrames=3] consecutive misses to clear active
   * @param {number} [opts.cooldownSec=1.6] silence after a fire
   */
  constructor(opts = {}) {
    this.enterFrames = opts.enterFrames ?? 4;
    this.exitFrames = opts.exitFrames ?? 3;
    this.cooldownSec = opts.cooldownSec ?? 1.6;
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
   * @returns {Array<{ gesture, confidence, hand, position }>}
   */
  update(pose, hands, dt = 1 / 60) {
    this.time += dt;
    const events = [];
    const seen = new Set();

    for (const rec of RECOGNIZERS) {
      const raw = rec.update(pose, hands, dt);
      if (!raw) continue;

      const key = this.#key(raw.gesture, raw.hand);
      seen.add(key);
      const slot = this.#slot(key);

      if (this.time < slot.coolUntil) {
        slot.hits = 0;
        continue;
      }

      // Prefer recognizer's enter hint when present (fingerHeart tip threshold).
      const entering = raw._enter !== undefined ? raw._enter : raw.confidence >= 0.55;
      if (entering) {
        slot.hits += 1;
        slot.misses = 0;
      } else {
        slot.misses += 1;
        slot.hits = 0;
      }

      if (!slot.active && slot.hits >= this.enterFrames) {
        slot.active = true;
        slot.coolUntil = this.time + this.cooldownSec;
        slot.hits = 0;
        events.push({
          gesture: raw.gesture,
          confidence: raw.confidence,
          hand: raw.hand,
          position: raw.position,
        });
      }
    }

    // Decay slots that didn't fire this frame.
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
