// ---------------------------------------------------------------------------
// HandDetector — LiteRT.js hand-landmark model on pose-derived ROIs.
//
// Uses MediaPipe Hand Landmark (full) .tflite. Palm detection is skipped:
// each hand crop comes from BlazePose wrist + index/pinky tips (Holistic-style).
// Up to two inferences per frame; low-visibility / offscreen wrists are skipped.
// On CPU: at most one hand per infer frame, and every-other-frame inference.
// ---------------------------------------------------------------------------

import { loadAndCompile, Tensor } from '@litertjs/core';
import { LM } from '../pose/landmarks.js';
import { NUM_HAND_LANDMARKS } from './landmarks.js';
import { HANDS } from '../gestures/thresholds.js';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export class HandDetector {
  constructor({ modelUrl = '/models/hand_landmark_full.tflite' } = {}) {
    this.modelUrl = modelUrl;
    this.model = null;
    this.backend = null;
    this.modelBytes = null;
    this.inputW = 224;
    this.inputH = 224;
    this.outputMap = null;
    this.lastInferMs = 0;
    /** On CPU, alternate which hand runs when both wrists are visible. */
    this._cpuHandToggle = 0;
    this._frame = 0;
    /** @type {Map<string, object>} */
    this._lastBySide = new Map();

    this.cropCanvas = document.createElement('canvas');
    this.cropCtx = this.cropCanvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Compile (or recompile) the hand model for an accelerator.
   * Call after PoseDetector.init() so the LiteRT runtime is already loaded.
   */
  async compile(accelerator, onProgress = () => {}) {
    if (!this.modelBytes) {
      this.modelBytes = await this.#fetchWithProgress(this.modelUrl, (f) =>
        onProgress(f * 0.7, 'Downloading hand model')
      );
    }
    onProgress(0.75, `Compiling hands for ${accelerator === 'webgpu' ? 'WebGPU' : 'CPU'}`);

    const compiled = await loadAndCompile(this.modelBytes, { accelerator });
    const inputDetails = compiled.getInputDetails();
    const [, h, w] = inputDetails[0].shape;
    this.inputH = h;
    this.inputW = w;
    this.cropCanvas.width = w;
    this.cropCanvas.height = h;

    const outs = compiled.getOutputDetails();
    const count = (d) => d.shape.reduce((a, b) => a * b, 1);
    const byCount = new Map();
    outs.forEach((d, i) => {
      const n = count(d);
      if (!byCount.has(n)) byCount.set(n, []);
      byCount.get(n).push(i);
    });

    // Typical hand_landmark_full outputs:
    //   63 → screen landmarks (21×3, pixel space of the crop)
    //   63 → world landmarks
    //   1  → hand presence
    //   1  → handedness (Right probability)
    const lmIdxs = byCount.get(63) || byCount.get(21 * 3) || [];
    const scalarIdxs = byCount.get(1) || [];
    this.outputMap = {
      landmarks: lmIdxs[0] ?? -1,
      world: lmIdxs[1] ?? -1,
      presence: scalarIdxs[0] ?? -1,
      handedness: scalarIdxs[1] ?? scalarIdxs[0] ?? -1,
    };
    if (this.outputMap.landmarks < 0 || this.outputMap.presence < 0) {
      compiled.delete();
      throw new Error('Hand model outputs not recognized — is this hand_landmark_full.tflite?');
    }

    const old = this.model;
    this.model = compiled;
    this.backend = accelerator;
    if (old) old.delete();

    onProgress(0.9, 'Warming up hands');
    const zeros = new Float32Array(this.inputW * this.inputH * 3);
    await this.#run(zeros);
    onProgress(1, 'Hands ready');
  }

  /**
   * Run hand landmark inference for wrists visible in the pose.
   * @param {HTMLVideoElement} video
   * @param {Array<{x,y,z,visibility}>} poseScreen  unmirrored normalized pose
   * @returns {{ hands: Array<HandResult>, inferMs: number }}
   */
  async detect(video, poseScreen) {
    if (!this.model || !poseScreen) {
      this.lastInferMs = 0;
      return { hands: [], inferMs: 0 };
    }
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return { hands: [], inferMs: 0 };

    this._frame += 1;
    const candidates = this.#candidatesFromPose(poseScreen);

    // No on-screen wrists → clear cache and skip all hand work.
    if (!candidates.length) {
      this._lastBySide.clear();
      this.lastInferMs = 0;
      return { hands: [], inferMs: 0 };
    }

    // Spec risk: CPU hand infer is expensive — every-other-frame + ≤1 hand.
    if (this.backend === 'wasm') {
      if (this._frame % HANDS.cpuFrameStride !== 0) {
        this.lastInferMs = 0;
        return { hands: this.#cachedHands(candidates), inferMs: 0 };
      }
    }

    let toRun = candidates;
    if (this.backend === 'wasm' && candidates.length > 1) {
      toRun = [candidates[this._cpuHandToggle % candidates.length]];
      this._cpuHandToggle++;
    }

    const hands = [];
    let totalMs = 0;
    for (const c of toRun) {
      const roi = this.#roiFromPose(c, vw, vh);
      const pixels = this.#cropToInput(video, roi);
      const outputs = await this.#run(pixels);
      totalMs += this.lastInferMs;

      const rawPresence = outputs.presence[0];
      const presence = rawPresence >= 0 && rawPresence <= 1 ? rawPresence : sigmoid(rawPresence);
      if (presence < HANDS.scoreMin) {
        this._lastBySide.delete(c.side);
        continue;
      }

      const landmarks = this.#decodeLandmarks(outputs.landmarks, roi, vw, vh);
      let handednessScore = 0.5;
      if (outputs.handedness) {
        const h = outputs.handedness[0];
        handednessScore = h >= 0 && h <= 1 ? h : sigmoid(h);
      }

      const hand = {
        handedness: c.side,
        score: presence,
        handednessScore,
        landmarks,
        side: c.side,
      };
      hands.push(hand);
      this._lastBySide.set(c.side, hand);
    }

    // Drop cached sides that are no longer candidates.
    for (const side of [...this._lastBySide.keys()]) {
      if (!candidates.some((c) => c.side === side)) this._lastBySide.delete(side);
    }

    // On CPU single-hand frames, merge the other hand from cache if still visible.
    const merged = this.backend === 'wasm' ? this.#mergeWithCache(hands, candidates) : hands;

    this.lastInferMs = totalMs;
    return { hands: merged, inferMs: totalMs };
  }

  #cachedHands(candidates) {
    return candidates
      .map((c) => this._lastBySide.get(c.side))
      .filter(Boolean);
  }

  #mergeWithCache(fresh, candidates) {
    const bySide = new Map(fresh.map((h) => [h.side, h]));
    for (const c of candidates) {
      if (!bySide.has(c.side) && this._lastBySide.has(c.side)) {
        bySide.set(c.side, this._lastBySide.get(c.side));
      }
    }
    return [...bySide.values()];
  }

  #inFrame(p) {
    const m = HANDS.frameMargin;
    return p.x >= m && p.x <= 1 - m && p.y >= m && p.y <= 1 - m;
  }

  #candidatesFromPose(pose) {
    const sides = [
      {
        side: 'Left',
        wrist: pose[LM.LEFT_WRIST],
        index: pose[LM.LEFT_INDEX],
        pinky: pose[LM.LEFT_PINKY],
      },
      {
        side: 'Right',
        wrist: pose[LM.RIGHT_WRIST],
        index: pose[LM.RIGHT_INDEX],
        pinky: pose[LM.RIGHT_PINKY],
      },
    ];
    // Wrist-only fallback: when the hand is foreshortened toward the camera,
    // pose index/pinky tips often drop visibility even though the wrist is
    // solid — still run the hand model on a wrist-centered crop.
    return sides.filter((s) => {
      if (!s.wrist || s.wrist.visibility < HANDS.wristVisMin) return false;
      if (!this.#inFrame(s.wrist)) return false;
      const tipMin = HANDS.wristVisMin * 0.5;
      s.wristOnly =
        !(s.index?.visibility >= tipMin && s.pinky?.visibility >= tipMin);
      return true;
    }).sort((a, b) => b.wrist.visibility - a.wrist.visibility);
  }

  /** Axis-aligned-ish palm box with rotation from wrist → knuckle midline. */
  #roiFromPose(c, vw, vh) {
    const wx = c.wrist.x * vw, wy = c.wrist.y * vh;
    let cx = wx, cy = wy, angle = 0, palm = 0;
    if (!c.wristOnly && c.index && c.pinky) {
      const ix = c.index.x * vw, iy = c.index.y * vh;
      const px = c.pinky.x * vw, py = c.pinky.y * vh;
      const midX = (ix + px) / 2;
      const midY = (iy + py) / 2;
      cx = (wx + midX) / 2;
      cy = (wy + midY) / 2;
      const dx = midX - wx;
      const dy = midY - wy;
      angle = Math.atan2(dy, dx);
      palm = Math.hypot(dx, dy);
    }
    // Foreshortened / wrist-only: palm length collapses — use a larger
    // default crop so the hand model still sees the whole hand.
    const minFrac = c.wristOnly || palm < Math.min(vw, vh) * 0.04 ? 0.22 : 0.14;
    const size = Math.max(palm * 3.0, Math.min(vw, vh) * minFrac);
    return { cx, cy, size, angle };
  }

  #cropToInput(video, roi) {
    const ctx = this.cropCtx;
    const { inputW, inputH } = this;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, inputW, inputH);
    ctx.translate(inputW / 2, inputH / 2);
    ctx.rotate(-roi.angle);
    const scale = inputW / roi.size;
    ctx.scale(scale, scale);
    ctx.translate(-roi.cx, -roi.cy);
    ctx.drawImage(video, 0, 0);
    ctx.restore();

    const rgba = ctx.getImageData(0, 0, inputW, inputH).data;
    const floats = new Float32Array(inputW * inputH * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4) {
      floats[j++] = rgba[i] / 255;
      floats[j++] = rgba[i + 1] / 255;
      floats[j++] = rgba[i + 2] / 255;
    }
    return floats;
  }

  #decodeLandmarks(raw, roi, vw, vh) {
    const cos = Math.cos(roi.angle);
    const sin = Math.sin(roi.angle);
    const out = [];
    for (let i = 0; i < NUM_HAND_LANDMARKS; i++) {
      const px = raw[i * 3 + 0] / this.inputW;
      const py = raw[i * 3 + 1] / this.inputH;
      const pz = raw[i * 3 + 2] / this.inputW;
      const lx = (px - 0.5) * roi.size;
      const ly = (py - 0.5) * roi.size;
      const vx = roi.cx + lx * cos - ly * sin;
      const vy = roi.cy + lx * sin + ly * cos;
      out.push({
        x: vx / vw,
        y: vy / vh,
        z: pz * (roi.size / vw),
        visibility: 1,
      });
    }
    return out;
  }

  async #fetchWithProgress(url, onFraction) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download hand model (${res.status}) from ${url}`);
    }
    const total = Number(res.headers.get('Content-Length')) || 0;
    if (!res.body || !total) {
      return new Uint8Array(await res.arrayBuffer());
    }
    const reader = res.body.getReader();
    const bytes = new Uint8Array(total);
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.set(value, received);
      received += value.length;
      onFraction(received / total);
    }
    return bytes;
  }

  async #run(float32Pixels) {
    let input = new Tensor(float32Pixels, [1, this.inputH, this.inputW, 3]);
    try {
      if (this.backend === 'webgpu') {
        input = await input.moveTo('webgpu');
      }
      const t0 = performance.now();
      const results = await this.model.run([input]);
      const data = {};
      for (const key of ['landmarks', 'world', 'presence', 'handedness']) {
        const idx = this.outputMap[key];
        if (idx >= 0) data[key] = await this.#read(results[idx]);
      }
      this.lastInferMs = performance.now() - t0;
      for (const t of results) t.delete();
      return data;
    } finally {
      input.delete();
    }
  }

  async #read(tensor) {
    try {
      return await tensor.data();
    } catch {
      const cpu = await tensor.copyTo('wasm');
      const arr = cpu.toTypedArray().slice();
      cpu.delete();
      return arr;
    }
  }

  dispose() {
    if (this.model) { this.model.delete(); this.model = null; }
  }
}
