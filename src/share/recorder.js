// Local clip capture — MediaRecorder on a side-by-side composite of the
// camera+overlay and the Three.js stage (effects already in the WebGL buffer).
// No backend: finished clips download as .webm.

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export class ClipRecorder {
  /**
   * @param {{
   *   video: HTMLVideoElement,
   *   overlay: HTMLCanvasElement,
   *   getStageCanvas: () => HTMLCanvasElement,
   * }} sources
   */
  constructor(sources) {
    this.sources = sources;
    this.recording = false;
    this.chunks = [];
    this.recorder = null;
    this.composite = document.createElement('canvas');
    this.ctx = this.composite.getContext('2d');
    this._raf = 0;
    this.startedAt = 0;
  }

  get elapsedSec() {
    if (!this.recording) return 0;
    return (performance.now() - this.startedAt) / 1000;
  }

  start() {
    if (this.recording) return;
    const mimeType = pickMimeType();
    if (!mimeType || typeof MediaRecorder === 'undefined') {
      throw new Error('WebM recording is not supported in this browser');
    }

    this.#resizeComposite();
    const stream = this.composite.captureStream(30);
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data?.size) this.chunks.push(e.data);
    };
    this.recorder.start(250);
    this.recording = true;
    this.startedAt = performance.now();
    this.#pump();
  }

  /**
   * @returns {Promise<Blob|null>}
   */
  stop() {
    if (!this.recording || !this.recorder) return Promise.resolve(null);
    this.recording = false;
    cancelAnimationFrame(this._raf);
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        const type = this.recorder.mimeType || 'video/webm';
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        this.chunks = [];
        this.recorder = null;
        resolve(blob);
      };
      try {
        this.recorder.stop();
      } catch {
        resolve(null);
      }
    });
  }

  #pump = () => {
    if (!this.recording) return;
    this.#drawFrame();
    this._raf = requestAnimationFrame(this.#pump);
  };

  #resizeComposite() {
    const stage = this.sources.getStageCanvas();
    const vw = this.sources.video.videoWidth || 640;
    const vh = this.sources.video.videoHeight || 480;
    const sw = stage?.width || 640;
    const sh = stage?.height || 480;
    const leftH = 720;
    const leftW = Math.round(leftH * (vw / vh));
    const rightH = 720;
    const rightW = Math.round(rightH * (sw / Math.max(sh, 1)));
    this.composite.width = leftW + rightW;
    this.composite.height = 720;
    this._layout = { leftW, leftH, rightW, rightH };
  }

  #drawFrame() {
    const { video, overlay, getStageCanvas } = this.sources;
    const stage = getStageCanvas();
    if (!this._layout) this.#resizeComposite();
    const { leftW, leftH, rightW, rightH } = this._layout;
    const ctx = this.ctx;

    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, this.composite.width, this.composite.height);

    // Left: camera (object-fit cover into left panel)
    if (video.videoWidth) {
      const scale = Math.max(leftW / video.videoWidth, leftH / video.videoHeight);
      const dw = video.videoWidth * scale;
      const dh = video.videoHeight * scale;
      const ox = (leftW - dw) / 2;
      const oy = (leftH - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, leftW, leftH);
      ctx.clip();
      if (video.classList.contains('mirrored')) {
        ctx.translate(leftW, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, ox, oy, dw, dh);
      if (overlay.width) ctx.drawImage(overlay, ox, oy, dw, dh);
      ctx.restore();
    }

    // Right: Three.js stage with effects
    if (stage?.width) {
      ctx.drawImage(stage, leftW, 0, rightW, rightH);
    }

    ctx.fillStyle = 'rgba(11,14,19,0.65)';
    ctx.fillRect(12, 12, 120, 28);
    ctx.fillStyle = '#e6edf3';
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    ctx.fillText('SPELLCAST', 22, 31);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
export const clipFilename = () => `spellcast-clip-${stamp()}.webm`;
export const cardFilename = () => `spellcast-card-${stamp()}.png`;
