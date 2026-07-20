// Effects engine: heart bursts, Strange ring + embers, UnrealBloomPass.
// Spawn is driven by GESTURE_BINDINGS — add a factory here + a binding row
// to wire a new spell without touching main.js.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeHeartMaterials } from './sprites.js';
import { StrangeRing } from './ring.js';
import { createEmberBurst } from './particles.js';
import { ConfettiBurst, GoldenRain, FingerGunShot } from './celebrations.js';
import { GESTURE_BINDINGS } from '../gestures/bindings.js';
import { LM } from '../pose/landmarks.js';

/**
 * Map normalized camera-space hand coords into the Three.js stage.
 * Mirror flips x so effects line up with the mirrored character.
 */
export function screenToStage(pos, mirror = true) {
  const xNorm = mirror ? 1 - pos.x : pos.x;
  return new THREE.Vector3(
    (xNorm - 0.5) * 2.2,
    (1 - pos.y) * 1.7 + 0.25,
    0.55,
  );
}

/** Map a normalized screen radius into stage units. */
export function screenRadiusToStage(r) {
  return Math.max(0.12, Math.min(0.85, r * 2.4));
}

class HeartBurst {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.SpriteMaterial[]} materials
   * @param {THREE.Vector3} origin
   * @param {{ follow?: boolean, hand?: string }} [opts]
   */
  constructor(parent, materials, origin, { follow = false, hand = null } = {}) {
    this.alive = true;
    this.age = 0;
    this.life = 1.8;
    this.follow = follow;
    this.hand = hand; // 'Left' | 'Right' | null
    this.group = new THREE.Group();
    parent.add(this.group);

    const count = 10 + Math.floor(Math.random() * 6);
    this.sprites = [];
    for (let i = 0; i < count; i++) {
      const mat = materials[i % materials.length].clone();
      mat.opacity = 1;
      const sprite = new THREE.Sprite(mat);
      const s = 0.12 + Math.random() * 0.14;
      sprite.scale.set(s, s, 1);
      sprite.userData.baseScale = s;
      sprite.position.copy(origin);
      sprite.position.x += (Math.random() - 0.5) * 0.18;
      sprite.position.y += (Math.random() - 0.5) * 0.08;
      sprite.userData.ox = sprite.position.x - origin.x;
      sprite.userData.oy = sprite.position.y - origin.y;
      sprite.userData.oz = sprite.position.z - origin.z;
      sprite.userData.vx = (Math.random() - 0.5) * 0.55;
      sprite.userData.vy = 0.55 + Math.random() * 0.75;
      sprite.userData.vz = (Math.random() - 0.5) * 0.2;
      this.group.add(sprite);
      this.sprites.push(sprite);
    }
    this._anchor = origin.clone();
  }

  /**
   * @param {number} dt
   * @param {{ screen?: Array, hands?: Array, mirror?: boolean } | null} [frame]
   */
  update(dt, frame = null) {
    this.age += dt;
    const t = this.age / this.life;
    if (t >= 1) {
      this.dispose();
      return;
    }

    if (this.follow && frame) {
      const pos = resolveHandScreen(frame, this.hand);
      if (pos) this._anchor.copy(screenToStage(pos, frame.mirror !== false));
    }

    for (const s of this.sprites) {
      if (this.follow) {
        // Drift relative to the tracked hand, not a frozen spawn point.
        s.position.set(
          this._anchor.x + s.userData.ox,
          this._anchor.y + s.userData.oy,
          this._anchor.z + s.userData.oz,
        );
        s.userData.ox += s.userData.vx * dt;
        s.userData.oy += s.userData.vy * dt;
        s.userData.oz += s.userData.vz * dt;
      } else {
        s.position.x += s.userData.vx * dt;
        s.position.y += s.userData.vy * dt;
        s.position.z += s.userData.vz * dt;
      }
      s.userData.vy += 0.12 * dt;
      s.material.opacity = Math.max(0, 1 - t * t);
      s.scale.setScalar(s.userData.baseScale * (1 + t * 0.4));
    }
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    for (const s of this.sprites) {
      s.material.dispose();
      this.group.remove(s);
    }
    this.group.parent?.remove(this.group);
    this.sprites = [];
  }
}

/** Prefer the named hand from the hand model; fall back to pose wrist. */
function resolveHandScreen(frame, hand) {
  const hands = frame.hands || [];
  if (hand) {
    const hit = hands.find((h) => (h.handedness || h.side) === hand);
    if (hit?.landmarks?.[0]) {
      // Wrist is landmark 0 in MediaPipe hands.
      return hit.landmarks[0];
    }
  }
  if (hands[0]?.landmarks?.[0]) return hands[0].landmarks[0];
  const screen = frame.screen;
  if (!screen) return null;
  const lw = screen[LM.LEFT_WRIST];
  const rw = screen[LM.RIGHT_WRIST];
  if (hand === 'Left' && lw?.visibility > 0.4) return lw;
  if (hand === 'Right' && rw?.visibility > 0.4) return rw;
  if (lw?.visibility > 0.4) return lw;
  if (rw?.visibility > 0.4) return rw;
  return null;
}

export class EffectsEngine {
  constructor(stage) {
    this.stage = stage;
    this.root = new THREE.Group();
    this.root.name = 'spellcast-effects';
    stage.scene.add(this.root);
    this.heartMats = makeHeartMaterials();
    this.active = [];
    this.mirror = true;
    this._frame = null;
    this.flash = document.createElement('div');
    this.flash.className = 'effect-flash';
    stage.container.appendChild(this.flash);

    const size = new THREE.Vector2();
    stage.renderer.getSize(size);
    this.composer = new EffectComposer(stage.renderer);
    this.composer.addPass(new RenderPass(stage.scene, stage.camera));
    this.bloomPass = new UnrealBloomPass(size.clone(), 0.65, 0.35, 0.82);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this._lastW = size.x;
    this._lastH = size.y;
  }

  setMirror(mirror) {
    this.mirror = mirror;
  }

  /** Latest pose/hands frame — used by follow-anchored effects. */
  setFrame(frame) {
    this._frame = frame ? { ...frame, mirror: this.mirror } : null;
  }

  #syncComposerSize() {
    const size = new THREE.Vector2();
    this.stage.renderer.getSize(size);
    if (size.x === this._lastW && size.y === this._lastH) return;
    this._lastW = size.x;
    this._lastH = size.y;
    this.composer.setSize(size.x, size.y);
    this.bloomPass.resolution.set(size.x, size.y);
  }

  spawn(event) {
    const binding = GESTURE_BINDINGS[event?.gesture];
    if (!binding) return;

    if (binding.flash) {
      this.flash.classList.remove('active');
      requestAnimationFrame(() => this.flash.classList.add('active'));
    }

    const origin = event.position
      ? screenToStage(event.position, this.mirror)
      : new THREE.Vector3(0, 1.2, 0.55);

    switch (binding.effect) {
      case 'heartBurst':
        this.active.push(new HeartBurst(this.root, this.heartMats, origin, {
          follow: !!binding.follow,
          hand: event.hand || null,
        }));
        break;
      case 'strangeRing': {
        const radius = screenRadiusToStage(event.radius ?? 0.12);
        this.active.push(new StrangeRing(this.root, origin, radius, createEmberBurst));
        break;
      }
      case 'confetti':
        this.active.push(new ConfettiBurst(this.root, origin));
        break;
      case 'goldenRain':
        this.active.push(new GoldenRain(this.root));
        break;
      case 'fingerGun': {
        const dir = event.direction || { x: 1, y: 0 };
        this.active.push(new FingerGunShot(this.root, origin, {
          x: this.mirror ? -dir.x : dir.x,
          y: -dir.y,
        }));
        break;
      }
      default:
        break;
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.update(dt, this._frame);
      if (!fx.alive) this.active.splice(i, 1);
    }
  }

  /** Bloom-composited frame (replaces bare stage.render). */
  render() {
    this.#syncComposerSize();
    this.composer.render();
  }

  dispose() {
    for (const fx of this.active) fx.dispose();
    this.active = [];
    for (const m of this.heartMats) {
      m.map?.dispose();
      m.dispose();
    }
    this.stage.scene.remove(this.root);
    this.composer?.dispose();
  }
}
