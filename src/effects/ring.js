// Sparking orange portal ring — custom shader + torus, world-anchored.

import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vPos;

  // Cheap hash noise for spark flecks along the ring.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float along = vUv.x;
    float across = abs(vUv.y - 0.5) * 2.0;

    float core = smoothstep(1.0, 0.15, across);
    float glow = smoothstep(1.0, 0.0, across) * 0.55;

    float spark = step(0.92, hash(vec2(along * 40.0, floor(uTime * 18.0))));
    spark *= smoothstep(0.7, 0.0, across);

    vec3 orange = vec3(1.0, 0.45, 0.08);
    vec3 hot = vec3(1.0, 0.85, 0.35);
    vec3 col = mix(orange, hot, core * 0.65 + spark);
    float alpha = (core * 0.95 + glow * 0.5 + spark * 0.8) * uOpacity;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createRingMesh(radius = 0.35) {
  const tube = Math.max(0.018, radius * 0.08);
  const geom = new THREE.TorusGeometry(radius, tube, 16, 96);
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  // TorusGeometry lies in XY — faces the stage camera (+Z).
  return mesh;
}

export class StrangeRing {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Vector3} center
   * @param {number} radius stage units
   * @param {() => THREE.Points} makeEmbers
   */
  constructor(parent, center, radius, makeEmbers) {
    this.alive = true;
    this.age = 0;
    this.life = 4.2;
    this.group = new THREE.Group();
    this.group.position.copy(center);
    parent.add(this.group);

    this.ring = createRingMesh(radius);
    this.group.add(this.ring);

    // Soft outer glow disc
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6a1a,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.RingGeometry(radius * 0.85, radius * 1.25, 64), glowMat);
    this.group.add(this.glow);

    this.embers = makeEmbers(radius);
    this.group.add(this.embers);
  }

  update(dt) {
    this.age += dt;
    const t = this.age / this.life;
    if (t >= 1) {
      this.dispose();
      return;
    }

    const mat = this.ring.material;
    mat.uniforms.uTime.value = this.age;
    // Fade in fast, hold, fade out.
    let opacity = 1;
    if (t < 0.08) opacity = t / 0.08;
    else if (t > 0.65) opacity = 1 - (t - 0.65) / 0.35;
    mat.uniforms.uOpacity.value = opacity;
    this.glow.material.opacity = 0.22 * opacity;
    this.ring.rotation.z += dt * 0.9;

    // Embers drift outward / up.
    const pos = this.embers.geometry.attributes.position;
    const vel = this.embers.userData.velocities;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + vel[i * 3] * dt,
        pos.getY(i) + vel[i * 3 + 1] * dt,
        pos.getZ(i) + vel[i * 3 + 2] * dt,
      );
      vel[i * 3 + 1] += 0.08 * dt;
    }
    pos.needsUpdate = true;
    this.embers.material.opacity = opacity * 0.9;
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.glow.geometry.dispose();
    this.glow.material.dispose();
    this.embers.geometry.dispose();
    this.embers.material.dispose();
    this.group.parent?.remove(this.group);
  }
}
