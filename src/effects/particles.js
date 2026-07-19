// Ember / spark particle bursts for the Strange circle ring (XY plane).

import * as THREE from 'three';

export function createEmberBurst(radius = 0.35, count = 48) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const r = radius * (0.9 + Math.random() * 0.15);
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.sin(a) * r;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    velocities[i * 3] = Math.cos(a) * (0.12 + Math.random() * 0.3);
    velocities[i * 3 + 1] = Math.sin(a) * (0.12 + Math.random() * 0.3) + 0.15 + Math.random() * 0.35;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xff8c2a,
    size: 0.035,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geom, mat);
  points.userData.velocities = velocities;
  return points;
}
