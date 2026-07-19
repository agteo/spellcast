// Effects engine: spawn / update / dispose. Phase 2 ships heart bursts;
// ring + bloom land with Strange circle (Phase 3).

import * as THREE from 'three';
import { makeHeartMaterials } from './sprites.js';

/**
 * Map normalized camera-space hand coords into the Three.js stage.
 * Mirror flips x so hearts line up with the mirrored character.
 */
export function screenToStage(pos, mirror = true) {
  const xNorm = mirror ? 1 - pos.x : pos.x;
  return new THREE.Vector3(
    (xNorm - 0.5) * 2.2,
    (1 - pos.y) * 1.7 + 0.25,
    0.55,
  );
}

class HeartBurst {
  constructor(parent, materials, origin) {
    this.alive = true;
    this.age = 0;
    this.life = 1.8;
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
      sprite.userData.vx = (Math.random() - 0.5) * 0.55;
      sprite.userData.vy = 0.55 + Math.random() * 0.75;
      sprite.userData.vz = (Math.random() - 0.5) * 0.2;
      sprite.userData.spin = (Math.random() - 0.5) * 2;
      this.group.add(sprite);
      this.sprites.push(sprite);
    }
  }

  update(dt) {
    this.age += dt;
    const t = this.age / this.life;
    if (t >= 1) {
      this.dispose();
      return;
    }
    for (const s of this.sprites) {
      s.position.x += s.userData.vx * dt;
      s.position.y += s.userData.vy * dt;
      s.position.z += s.userData.vz * dt;
      s.userData.vy += 0.12 * dt;
      s.material.opacity = Math.max(0, 1 - t * t);
      const base = s.userData.baseScale;
      s.scale.setScalar(base * (1 + t * 0.4));
    }
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    for (const s of this.sprites) {
      // Materials are clones; textures stay owned by EffectsEngine.heartMats.
      s.material.dispose();
      this.group.remove(s);
    }
    this.group.parent?.remove(this.group);
    this.sprites = [];
  }
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
  }

  setMirror(mirror) {
    this.mirror = mirror;
  }

  spawn(event) {
    if (!event?.position) return;
    if (event.gesture === 'fingerHeart') {
      const origin = screenToStage(event.position, this.mirror);
      this.active.push(new HeartBurst(this.root, this.heartMats, origin));
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.update(dt);
      if (!fx.alive) this.active.splice(i, 1);
    }
  }

  dispose() {
    for (const fx of this.active) fx.dispose();
    this.active = [];
    for (const m of this.heartMats) {
      m.map?.dispose();
      m.dispose();
    }
    this.stage.scene.remove(this.root);
  }
}
