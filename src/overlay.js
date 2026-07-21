// 2D skeleton overlay drawn on top of the webcam video.
// Coordinates arrive normalized to the video frame; the canvas is CSS-mirrored
// together with the <video>, so no coordinate flipping happens here.

import { CONNECTIONS, NUM_LANDMARKS } from './pose/landmarks.js';
import { HAND_CONNECTIONS, NUM_HAND_LANDMARKS } from './hands/landmarks.js';

export class Overlay {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.ctx = canvas.getContext('2d');
  }

  // The video uses object-fit: contain so the preview shows the entire camera
  // frame. Match its letterboxed transform exactly.
  #videoTransform() {
    const cw = this.canvas.width, ch = this.canvas.height;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const scale = Math.min(cw / vw, ch / vh);
    return {
      sx: vw * scale,
      sy: vh * scale,
      ox: (cw - vw * scale) / 2,
      oy: (ch - vh * scale) / 2,
    };
  }

  /**
   * @param {Array|{x,y,visibility}|null} screenLandmarks pose landmarks
   * @param {Array<{landmarks: Array}>|null} hands hand results (unmirrored screen space)
   */
  draw(screenLandmarks, hands = null) {
    const { canvas, ctx } = this;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!screenLandmarks && (!hands || !hands.length)) return;

    const t = this.#videoTransform();
    const px = (p) => ({ x: t.ox + p.x * t.sx, y: t.oy + p.y * t.sy });

    if (screenLandmarks) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const [a, b] of CONNECTIONS) {
        const pa = screenLandmarks[a], pb = screenLandmarks[b];
        if (pa.visibility < 0.5 || pb.visibility < 0.5) continue;
        const A = px(pa), B = px(pb);
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.85)';
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }

      for (let i = 0; i < NUM_LANDMARKS; i++) {
        const p = screenLandmarks[i];
        if (p.visibility < 0.5) continue;
        const P = px(p);
        ctx.fillStyle = '#e6edf3';
        ctx.beginPath();
        ctx.arc(P.x, P.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (hands?.length) {
      for (const hand of hands) {
        this.#drawHand(hand.landmarks, px, hand.handedness);
      }
    }
  }

  #drawHand(landmarks, px, handedness) {
    const { ctx } = this;
    const color = handedness === 'Left' ? 'rgba(251, 146, 60, 0.9)' : 'rgba(167, 139, 250, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = landmarks[a], pb = landmarks[b];
      if (!pa || !pb) continue;
      const A = px(pa), B = px(pb);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    for (let i = 0; i < NUM_HAND_LANDMARKS; i++) {
      const p = landmarks[i];
      if (!p) continue;
      const P = px(p);
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.arc(P.x, P.y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
