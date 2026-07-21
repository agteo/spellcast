// ---------------------------------------------------------------------------
// One Euro filter — the de-facto standard smoothing filter for interactive
// motion input (https://gery.casiez.net/1euro/).
//
// Why not a plain moving average? A fixed low-pass filter forces a trade-off:
// smooth-but-laggy or responsive-but-jittery. The One Euro filter adapts its
// cutoff to the signal's speed: when the joint is nearly still it filters
// hard (killing jitter), and when it moves fast it opens up (killing lag).
// That adaptive behavior is exactly what makes a mocap demo look convincing.
// ---------------------------------------------------------------------------

class LowPass {
  constructor() { this.initialized = false; this.value = 0; }
  filter(x, alpha) {
    if (!this.initialized) { this.initialized = true; this.value = x; return x; }
    this.value = alpha * x + (1 - alpha) * this.value;
    return this.value;
  }
}

class OneEuro {
  /**
   * @param minCutoff Hz — baseline smoothing when still (lower = smoother)
   * @param beta      speed coefficient (higher = less lag when moving fast)
   * @param dCutoff   Hz — cutoff for the derivative estimate
   * @param deadzone  |deriv| below this holds the last filtered value (kills
   *                  residual BlazePose jitter when the person is still)
   */
  constructor(minCutoff = 1.2, beta = 0.05, dCutoff = 1.0, deadzone = 0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.deadzone = deadzone;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastValue = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, dt) {
    if (dt <= 0) dt = 1 / 60;
    // Estimate signal speed (filtered derivative)...
    const rawDeriv = this.lastValue === null ? 0 : (value - this.lastValue) / dt;
    this.lastValue = value;
    const deriv = this.dx.filter(rawDeriv, OneEuro.alpha(this.dCutoff, dt));
    // Hold still: ignore micro-jitter below the noise floor so a seated /
    // motionless person doesn't keep twitching the avatar.
    if (this.deadzone > 0 && this.x.initialized && Math.abs(deriv) < this.deadzone) {
      return this.x.value;
    }
    // ...and open the cutoff proportionally to how fast the joint moves.
    const cutoff = this.minCutoff + this.beta * Math.abs(deriv);
    return this.x.filter(value, OneEuro.alpha(cutoff, dt));
  }
}

/**
 * Smooths a whole array of {x, y, z, visibility} landmarks —
 * one independent One Euro filter per landmark per axis.
 *
 * @param {number} count
 * @param {{
 *   minCutoff?: number,
 *   beta?: number,
 *   deadzone?: number,
 *   byIndex?: Record<number, { minCutoff?: number, beta?: number, deadzone?: number }>
 * }} [opts]  `byIndex` overrides the defaults for specific landmark indices
 *            (e.g. snappy wrists, heavy hips).
 */
export class LandmarkSmoother {
  constructor(count, opts = {}) {
    this.count = count;
    this.opts = opts;
    this.#buildFilters();
  }

  #buildFilters() {
    const opts = this.opts;
    const minCutoff = opts.minCutoff ?? 1.2;
    const beta = opts.beta ?? 0.05;
    const deadzone = opts.deadzone ?? 0;
    const byIndex = opts.byIndex || {};
    this.filters = Array.from({ length: this.count }, (_, i) => {
      const o = byIndex[i] || {};
      const mc = o.minCutoff ?? minCutoff;
      const b = o.beta ?? beta;
      const dz = o.deadzone ?? deadzone;
      return {
        x: new OneEuro(mc, b, 1.0, dz),
        y: new OneEuro(mc, b, 1.0, dz),
        z: new OneEuro(mc, b, 1.0, dz),
      };
    });
  }

  /** Forget prior coordinates after a real tracking gap / subject change. */
  reset() {
    this.#buildFilters();
  }

  apply(landmarks, dt) {
    return landmarks.map((p, i) => {
      const f = this.filters[i];
      if (!f) return p;
      return {
        ...p,
        x: f.x.filter(p.x, dt),
        y: f.y.filter(p.y, dt),
        z: f.z.filter(p.z, dt),
        visibility: p.visibility,
      };
    });
  }
}
