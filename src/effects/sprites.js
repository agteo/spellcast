// Canvas-generated emoji-style heart textures for sprite particles.

import * as THREE from 'three';

const COLORS = ['#ff4d6d', '#ff8fab', '#ff6b6b', '#f72585', '#ff85a1'];

export function makeHeartTexture(color = '#ff4d6d', size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.font = `${size * 0.72}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♥', size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeHeartMaterials() {
  return COLORS.map((c) => new THREE.SpriteMaterial({
    map: makeHeartTexture(c),
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  }));
}
