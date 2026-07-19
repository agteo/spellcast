// Phase 4 effects: dab flash/confetti, arms-V golden rain, finger-gun shot.

import * as THREE from 'three';

class ParticleEffect {
  constructor(parent, { count, origin, color, life }) {
    this.alive = true;
    this.age = 0;
    this.life = life;
    this.velocities = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = Array.isArray(color) ? color : [color];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
      const c = new THREE.Color(palette[i % palette.length]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    parent.add(this.points);
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.points.parent?.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class ConfettiBurst extends ParticleEffect {
  constructor(parent, origin) {
    super(parent, {
      count: 90,
      origin,
      color: [0xff4d6d, 0x2dd4bf, 0xfacc15, 0x8b5cf6, 0xffffff],
      life: 2.2,
    });
    for (let i = 0; i < this.velocities.length; i += 3) {
      this.velocities[i] = (Math.random() - 0.5) * 2.2;
      this.velocities[i + 1] = 0.7 + Math.random() * 1.8;
      this.velocities[i + 2] = (Math.random() - 0.5) * 0.8;
    }
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.life) return this.dispose();
    const p = this.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(
        i,
        p.getX(i) + this.velocities[i * 3] * dt,
        p.getY(i) + this.velocities[i * 3 + 1] * dt,
        p.getZ(i) + this.velocities[i * 3 + 2] * dt,
      );
      this.velocities[i * 3 + 1] -= 1.9 * dt;
    }
    p.needsUpdate = true;
    this.material.opacity = Math.max(0, 1 - this.age / this.life);
  }
}

export class GoldenRain extends ParticleEffect {
  constructor(parent) {
    super(parent, {
      count: 120,
      origin: new THREE.Vector3(),
      color: [0xffd166, 0xfacc15, 0xfff3b0, 0xf59e0b],
      life: 3.5,
    });
    const p = this.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, (Math.random() - 0.5) * 2.8, 2.2 + Math.random() * 1.5, 0.15 + Math.random() * 0.8);
      this.velocities[i * 3] = (Math.random() - 0.5) * 0.12;
      this.velocities[i * 3 + 1] = -(0.7 + Math.random() * 1.1);
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    }
    p.needsUpdate = true;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.life) return this.dispose();
    const p = this.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + this.velocities[i * 3 + 1] * dt;
      if (y < 0) y = 2.4 + Math.random();
      p.setXYZ(i, p.getX(i) + this.velocities[i * 3] * dt, y, p.getZ(i));
    }
    p.needsUpdate = true;
    if (this.age > this.life - 0.8) this.material.opacity = (this.life - this.age) / 0.8;
  }
}

export class FingerGunShot {
  constructor(parent, origin, direction) {
    this.alive = true;
    this.age = 0;
    this.life = 1.15;
    this.velocity = new THREE.Vector3(direction.x, direction.y, 0.08).normalize().multiplyScalar(3.2);
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, toneMapped: false }),
    );
    this.mesh.position.copy(origin);
    parent.add(this.mesh);

    this.trailPositions = new Float32Array(18 * 3);
    for (let i = 0; i < 18; i++) this.trailPositions.set(origin.toArray(), i * 3);
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trail = new THREE.Line(
      this.trailGeometry,
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 }),
    );
    parent.add(this.trail);
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.life) return this.dispose();
    this.mesh.position.addScaledVector(this.velocity, dt);
    this.trailPositions.copyWithin(0, 3);
    this.trailPositions.set(this.mesh.position.toArray(), this.trailPositions.length - 3);
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trail.material.opacity = 1 - this.age / this.life;
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.mesh.parent?.remove(this.mesh);
    this.trail.parent?.remove(this.trail);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.trailGeometry.dispose();
    this.trail.material.dispose();
  }
}
