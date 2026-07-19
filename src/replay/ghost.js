// Ghost replay — play a saved take onto a second, translucent character
// while the live performer keeps moving. Uses the same frame schema as the
// JSON exporter (litert-mocap/1): per-frame bone local quaternions + root pos.

import * as THREE from 'three';

const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

/**
 * @typedef {{
 *   format: string,
 *   character: string,
 *   bones: string[],
 *   frames: Array<{
 *     t: number,
 *     rotations: number[][],
 *     rootPosition: number[],
 *   }>,
 * }} Take
 */

export class GhostPlayer {
  /**
   * @param {THREE.Object3D} root ghost character root
   * @param {Take} take
   */
  constructor(root, take) {
    this.root = root;
    this.take = take;
    this.playing = false;
    this.loop = true;
    this.t = 0;
    this.bones = this.#mapBones(root, take.bones);
    this._q = new THREE.Quaternion();
  }

  #mapBones(root, names) {
    const byName = new Map();
    root.traverse((n) => {
      if (n.isBone) byName.set(sanitize(n.name), n);
    });
    return names.map((name) => byName.get(sanitize(name)) || null);
  }

  setTake(take) {
    this.take = take;
    this.bones = this.#mapBones(this.root, take.bones);
    this.t = 0;
  }

  play() {
    if (!this.take?.frames?.length) return;
    this.playing = true;
    this.t = 0;
  }

  stop() {
    this.playing = false;
  }

  get duration() {
    const frames = this.take?.frames;
    if (!frames?.length) return 0;
    return frames[frames.length - 1].t;
  }

  update(dt) {
    if (!this.playing || !this.take?.frames?.length) return;
    this.t += dt;
    const duration = this.duration;
    if (duration <= 0) return;
    if (this.loop) {
      this.t %= duration;
    } else if (this.t >= duration) {
      this.t = duration;
      this.playing = false;
    }
    this.#apply(this.#sample(this.t));
  }

  /** Nearest-previous frame sample (recorder already runs at infer rate). */
  #sample(t) {
    const frames = this.take.frames;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return frames[lo];
  }

  #apply(frame) {
    if (!frame) return;
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      const rot = frame.rotations[i];
      if (!bone || !rot) continue;
      this._q.fromArray(rot);
      bone.quaternion.copy(this._q);
    }
    const rootBone = this.bones[0];
    if (rootBone && frame.rootPosition) {
      rootBone.position.fromArray(frame.rootPosition);
    }
  }
}
