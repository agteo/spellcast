// Data-driven gesture → effect (+ optional follow anchor / special anim).
// Adding a new stock spell: register a recognizer AND add a row here.
// Custom (user-saved) spells resolve through getBinding() / catalog.

import { loadCatalog, bindingFromSpell } from './catalog.js';

export const GESTURE_BINDINGS = {
  fingerHeart: {
    effect: 'heartBurst',
    anchor: 'hand',
    follow: true,
    anim: true,
  },
  strangeCircle: {
    effect: 'strangeRing',
    anchor: 'world',
    follow: false,
    anim: true,
  },
  dab: {
    effect: 'confetti',
    anchor: 'world',
    follow: false,
    flash: true,
    anim: true,
  },
  armsV: {
    effect: 'goldenRain',
    anchor: 'world',
    follow: false,
    anim: true,
  },
  fingerGun: {
    effect: 'fingerGun',
    anchor: 'hand',
    follow: false,
    anim: true,
  },
};

/** Stock binding, custom catalog binding, or event-embedded `_binding`. */
export function getBinding(gestureId, event = null) {
  if (event?._binding) return event._binding;
  if (GESTURE_BINDINGS[gestureId]) return GESTURE_BINDINGS[gestureId];
  const custom = loadCatalog().find((s) => s.id === gestureId);
  return custom ? bindingFromSpell(custom) : null;
}
