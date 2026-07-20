// Data-driven gesture → effect (+ optional follow anchor / special anim).
// Adding a new spell: register a recognizer in gestures/index.js AND add a
// row here — EffectsEngine.spawn no longer needs a hard-coded switch.

export const GESTURE_BINDINGS = {
  fingerHeart: {
    effect: 'heartBurst',
    anchor: 'hand',   // follow the firing hand while alive
    follow: true,
    anim: true,       // play character clip from config.anims[gesture]
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
