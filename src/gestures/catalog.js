// Custom spell catalog — localStorage only, no backend.
// Each entry stores a short pose template + effect/anim binding.

import { LM } from '../pose/landmarks.js';

const STORAGE_KEY = 'spellcast.customSpells.v1';

/** Joints used for template matching (screen-space, shoulder-normalized). */
export const SPELL_JOINTS = [
  'NOSE',
  'LEFT_SHOULDER', 'RIGHT_SHOULDER',
  'LEFT_ELBOW', 'RIGHT_ELBOW',
  'LEFT_WRIST', 'RIGHT_WRIST',
  'LEFT_INDEX', 'RIGHT_INDEX',
];

export const SPELL_EFFECTS = [
  { id: 'heartBurst', label: 'Hearts', follow: true },
  { id: 'strangeRing', label: 'Strange ring', follow: false },
  { id: 'confetti', label: 'Confetti', follow: false, flash: true },
  { id: 'goldenRain', label: 'Golden rain', follow: false },
  { id: 'fingerGun', label: 'Finger gun', follow: false },
];

export const SPELL_ANIMS = [
  { id: '', label: 'None' },
  { id: 'Wave', label: 'Wave' },
  { id: 'Yes', label: 'Yes' },
  { id: 'Dance', label: 'Dance' },
  { id: 'ThumbsUp', label: 'Thumbs up' },
  { id: 'Punch', label: 'Punch' },
  { id: 'Jump', label: 'Jump' },
];

/**
 * Shoulder-normalized joint snapshot from a pose landmark array.
 * @param {Array<{x,y,visibility}>} pose
 * @returns {Record<string, {x:number,y:number}|null>}
 */
export function normalizePoseFrame(pose) {
  const ls = pose?.[LM.LEFT_SHOULDER];
  const rs = pose?.[LM.RIGHT_SHOULDER];
  if (!ls || !rs || ls.visibility < 0.35 || rs.visibility < 0.35) return null;
  const mx = (ls.x + rs.x) * 0.5;
  const my = (ls.y + rs.y) * 0.5;
  const scale = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 1e-3;
  const out = {};
  for (const name of SPELL_JOINTS) {
    const p = pose[LM[name]];
    if (!p || p.visibility < 0.3) {
      out[name] = null;
      continue;
    }
    out[name] = {
      x: (p.x - mx) / scale,
      y: (p.y - my) / scale,
    };
  }
  return out;
}

/** Mean Euclidean distance between two normalized frames (missing joints ignored). */
export function frameDistance(a, b) {
  let sum = 0;
  let n = 0;
  for (const name of SPELL_JOINTS) {
    const pa = a?.[name];
    const pb = b?.[name];
    if (!pa || !pb) continue;
    sum += Math.hypot(pa.x - pb.x, pa.y - pb.y);
    n += 1;
  }
  return n ? sum / n : 9;
}

/**
 * Best-alignment score in [0,1] of a live window against a template.
 * Higher is better. Tries small temporal offsets.
 */
export function matchTemplate(templateFrames, liveFrames) {
  const T = templateFrames?.length || 0;
  const L = liveFrames?.length || 0;
  if (T < 4 || L < T) return 0;
  let bestDist = Infinity;
  const maxOff = L - T;
  for (let off = 0; off <= maxOff; off++) {
    let d = 0;
    for (let i = 0; i < T; i++) {
      d += frameDistance(templateFrames[i], liveFrames[off + i]);
    }
    bestDist = Math.min(bestDist, d / T);
  }
  // ~0.35 mean joint error (in shoulder-widths) → ~0.6 confidence
  return Math.max(0, Math.min(1, 1 - bestDist / 0.9));
}

export function loadCatalog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s?.id && s?.frames?.length) : [];
  } catch {
    return [];
  }
}

export function saveCatalog(spells) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spells));
}

export function upsertSpell(spell) {
  const all = loadCatalog().filter((s) => s.id !== spell.id);
  all.push(spell);
  saveCatalog(all);
  return all;
}

export function deleteSpell(id) {
  const all = loadCatalog().filter((s) => s.id !== id);
  saveCatalog(all);
  return all;
}

export function makeSpellId(label) {
  const slug = String(label || 'spell')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'spell';
  return `custom_${slug}_${Date.now().toString(36)}`;
}

/**
 * Binding object compatible with EffectsEngine / SpellAnimator.
 * @param {object} spell
 */
export function bindingFromSpell(spell) {
  const effectMeta = SPELL_EFFECTS.find((e) => e.id === spell.effect) || SPELL_EFFECTS[0];
  return {
    effect: effectMeta.id,
    anchor: effectMeta.follow ? 'hand' : 'world',
    follow: !!effectMeta.follow,
    flash: !!effectMeta.flash,
    anim: !!spell.animClip,
    animClip: spell.animClip || null,
  };
}
