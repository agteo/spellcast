// Finger gun: index extended, middle/ring/pinky curled. Arm by holding the
// thumb away from the palm, then fire when the thumb drops.

import { HAND_LM } from '../hands/landmarks.js';
import { dist2, fingerCurled, fingerExtended } from './geometry.js';
import { GESTURE } from './thresholds.js';

export const GESTURE_ID = 'fingerGun';

const T = GESTURE.fingerGun;
const armed = new Map();

function gunPose(lms) {
  return (
    fingerExtended(lms, HAND_LM.INDEX_TIP, HAND_LM.INDEX_PIP, HAND_LM.INDEX_MCP) &&
    fingerCurled(lms, HAND_LM.MIDDLE_TIP, HAND_LM.MIDDLE_PIP, HAND_LM.MIDDLE_MCP) &&
    fingerCurled(lms, HAND_LM.RING_TIP, HAND_LM.RING_PIP, HAND_LM.RING_MCP) &&
    fingerCurled(lms, HAND_LM.PINKY_TIP, HAND_LM.PINKY_PIP, HAND_LM.PINKY_MCP)
  );
}

// Frames the gun pose may be lost (hand dropout, one misread finger) before
// the armed state is abandoned — the thumb-drop "fire" is fast, and a single
// bad frame in the middle of it used to disarm the gun.
const DROPOUT_GRACE_FRAMES = 6;

export function update(_pose, hands) {
  hands = hands || [];
  const held = new Set();
  let fired = null;

  for (const hand of hands) {
    const key = hand.handedness || hand.side || 'Unknown';
    const lms = hand.landmarks;
    if (!lms?.length || !gunPose(lms)) continue; // grace pass below decides
    held.add(key);

    const palm = dist2(lms[HAND_LM.WRIST], lms[HAND_LM.MIDDLE_MCP]) || 1e-6;
    const thumbSpread = dist2(lms[HAND_LM.THUMB_TIP], lms[HAND_LM.INDEX_MCP]) / palm;
    const state = armed.get(key) || { ready: false, miss: 0 };
    state.miss = 0;

    if (thumbSpread > T.thumbArmMin) {
      state.ready = true;
      armed.set(key, state);
      continue;
    }

    if (state.ready && thumbSpread < T.thumbFireMax && !fired) {
      armed.delete(key);
      const indexMcp = lms[HAND_LM.INDEX_MCP];
      const indexTip = lms[HAND_LM.INDEX_TIP];
      const length = dist2(indexMcp, indexTip) || 1e-6;
      fired = {
        gesture: GESTURE_ID,
        confidence: Math.min(1, (0.75 - thumbSpread) / 0.3 + 0.55),
        hand: key,
        position: { ...indexTip },
        direction: {
          x: (indexTip.x - indexMcp.x) / length,
          y: (indexTip.y - indexMcp.y) / length,
        },
        _enter: true,
        _instant: true,
        _cooldown: T.cooldown,
      };
      continue;
    }
    armed.set(key, state);
  }

  // Keep armed state through short dropouts instead of disarming instantly.
  for (const [key, state] of armed) {
    if (held.has(key)) continue;
    state.miss = (state.miss || 0) + 1;
    if (state.miss > DROPOUT_GRACE_FRAMES) armed.delete(key);
  }

  return fired;
}
