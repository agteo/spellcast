// Share card — offline PNG of unlocked gestures + best combo. No backend.

import { GESTURE_CATALOG } from '../gestures/unlocks.js';
import { cardFilename, downloadBlob } from './recorder.js';

/**
 * @param {{
 *   unlocked: Set<string>|string[],
 *   bestCombo: number,
 *   unlockedCount: number,
 * }} snapshot
 */
export function renderShareCard(snapshot) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const unlocked = snapshot.unlocked instanceof Set
    ? snapshot.unlocked
    : new Set(snapshot.unlocked);

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(0.55, '#11151c');
  bg.addColorStop(1, '#1a1030');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Accent glow
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.2, 40, W * 0.5, H * 0.25, 420);
  glow.addColorStop(0, 'rgba(139,92,246,0.35)');
  glow.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#e6edf3';
  ctx.font = '700 72px "SF Pro Display", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Spellcast', W / 2, 140);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillText('gesture unlocks · this session', W / 2, 190);

  // Stats
  ctx.fillStyle = '#a78bfa';
  ctx.font = '600 36px ui-monospace, Menlo, monospace';
  ctx.fillText(
    `${snapshot.unlockedCount}/${GESTURE_CATALOG.length} unlocked`,
    W / 2,
    280,
  );
  ctx.fillStyle = '#2dd4bf';
  ctx.fillText(`Best combo  ×${snapshot.bestCombo || 0}`, W / 2, 335);

  // Gesture grid
  const cardW = 820;
  const cardH = 110;
  const startX = (W - cardW) / 2;
  let y = 420;

  for (const g of GESTURE_CATALOG) {
    const lit = unlocked.has(g.id);
    roundRect(ctx, startX, y, cardW, cardH, 18);
    ctx.fillStyle = lit ? 'rgba(124,58,237,0.28)' : 'rgba(30,41,59,0.55)';
    ctx.fill();
    ctx.strokeStyle = lit ? '#8b5cf6' : '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = lit ? '#f5d0fe' : '#64748b';
    ctx.font = '48px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(g.icon, startX + 36, y + 72);

    ctx.fillStyle = lit ? '#f8fafc' : '#64748b';
    ctx.font = lit ? '600 34px system-ui, sans-serif' : '500 34px system-ui, sans-serif';
    ctx.fillText(g.label, startX + 110, y + 68);

    ctx.fillStyle = lit ? '#2dd4bf' : '#475569';
    ctx.font = '600 22px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(lit ? 'UNLOCKED' : 'LOCKED', startX + cardW - 36, y + 68);

    y += cardH + 24;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = '400 22px system-ui, sans-serif';
  ctx.fillText('No backend · downloaded locally', W / 2, H - 60);

  return canvas;
}

export function downloadShareCard(snapshot) {
  const canvas = renderShareCard(snapshot);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode share card PNG'));
        return;
      }
      downloadBlob(blob, cardFilename());
      resolve(blob);
    }, 'image/png');
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
