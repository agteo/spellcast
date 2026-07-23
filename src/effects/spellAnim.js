// One-shot special-move clips over the live retargeted character.
// While a clip plays, retargeting is paused so the authored animation wins;
// after it ends, the Retargeter takes over again.

import * as THREE from 'three';

export class SpellAnimator {
  /**
   * @param {THREE.Object3D} root character root
   * @param {THREE.AnimationClip[]} clips from the GLB
   * @param {Record<string, string>} [animMap] gesture id → clip name
   */
  constructor(root, clips = [], animMap = {}) {
    this.root = root;
    this.mixer = clips.length ? new THREE.AnimationMixer(root) : null;
    this.byName = new Map((clips || []).map((c) => [c.name, c]));
    this.animMap = animMap || {};
    this.action = null;
    this.busyUntil = 0;
    this._finished = (e) => {
      if (e.action === this.action) {
        this.action.fadeOut(0.25);
        this.action = null;
        this.busyUntil = 0;
      }
    };
    this.mixer?.addEventListener('finished', this._finished);
  }

  /** True while a spell clip is driving the rig (retargeter should skip). */
  get blocking() {
    return !!this.action && performance.now() < this.busyUntil;
  }

  /**
   * Play the clip mapped to a gesture id, if present.
   * @param {string} gestureId
   * @param {{ durationSec?: number, clip?: string|null }} [opts]
   */
  play(gestureId, { durationSec = 1.6, clip = null } = {}) {
    if (!this.mixer) return false;
    const clipName = clip || this.animMap[gestureId];
    if (!clipName) return false;
    const animClip = this.byName.get(clipName);
    if (!animClip) {
      console.warn(`SpellAnimator: clip "${clipName}" not found for ${gestureId}`);
      return false;
    }
    if (this.action) {
      this.action.fadeOut(0.15);
      this.action = null;
    }
    const action = this.mixer.clipAction(animClip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(0.12);
    action.play();
    this.action = action;
    this.busyUntil = performance.now() + Math.min(durationSec, animClip.duration || durationSec) * 1000;
    return true;
  }

  update(dt) {
    this.mixer?.update(dt);
    if (this.action && performance.now() >= this.busyUntil) {
      this.action.fadeOut(0.25);
      this.action = null;
    }
  }

  dispose() {
    if (this.mixer) {
      this.mixer.removeEventListener('finished', this._finished);
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.root);
    }
    this.mixer = null;
    this.action = null;
  }
}
