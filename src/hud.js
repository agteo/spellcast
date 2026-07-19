// Performance HUD: render FPS + model inference latency, smoothed with an
// exponential moving average so the numbers are readable on camera instead
// of flickering every frame.

export class Hud {
  constructor() {
    this.fpsEl = document.getElementById('hud-fps');
    this.inferEl = document.getElementById('hud-infer');
    this.inferHandsEl = document.getElementById('hud-infer-hands');
    this.backendEl = document.getElementById('hud-backend');
    this.trackEl = document.getElementById('hud-track');
    this.hintEl = document.getElementById('framing-hint');
    this.fps = 0;
    this.inferMs = 0;
    this.inferHandsMs = 0;
    this.lastDraw = 0;
    this.trackMode = '–';
    this.hint = null;
  }

  tickFrame(dt) {
    if (dt > 0) {
      const fps = 1 / dt;
      this.fps = this.fps ? this.fps * 0.92 + fps * 0.08 : fps;
    }
  }

  tickInference(ms) {
    this.inferMs = this.inferMs ? this.inferMs * 0.85 + ms * 0.15 : ms;
  }

  tickHandsInference(ms) {
    this.inferHandsMs = this.inferHandsMs ? this.inferHandsMs * 0.85 + ms * 0.15 : ms;
  }

  setBackend(label) {
    this.backendEl.textContent = label;
  }

  /** FULL BODY / PARTIAL / UPPER BODY (or '–' when no one is tracked). */
  setTracking(mode) {
    if (mode === this.trackMode) return;
    this.trackMode = mode;
    this.trackEl.textContent = mode;
  }

  /** Framing coaching hint over the camera view (null hides it). */
  setHint(text) {
    if (text === this.hint || !this.hintEl) return;
    this.hint = text;
    this.hintEl.textContent = text || '';
    this.hintEl.classList.toggle('hidden', !text);
  }

  /** Refresh the DOM at ~5 Hz — enough to feel live, stable enough to read. */
  draw(now) {
    if (now - this.lastDraw < 200) return;
    this.lastDraw = now;
    this.fpsEl.textContent = this.fps ? this.fps.toFixed(0) : '–';
    this.inferEl.textContent = this.inferMs ? `${this.inferMs.toFixed(1)} ms` : '–';
    if (this.inferHandsEl) {
      this.inferHandsEl.textContent = this.inferHandsMs ? `${this.inferHandsMs.toFixed(1)} ms` : '–';
    }
  }
}
