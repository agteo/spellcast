// Korean finger heart: thumb tip meets index tip; other fingers curled.

import { HAND_LM } from '../hands/landmarks.js';
import { dist2, mid, fingerCurled, fingerExtended } from './geometry.js';

export const GESTURE_ID = 'fingerHeart';

/** Tip distance relative to palm size (wrist→middle MCP). */
const ENTER_RATIO = 0.28;
const EXIT_RATIO = 0.42;

/**
 * @returns {null | { gesture, confidence, hand, position }}
 */
export function update(_pose, hands) {
  if (!hands?.length) return null;

  let best = null;
  for (const hand of hands) {
    const lms = hand.landmarks;
    if (!lms?.length) continue;

    const wrist = lms[HAND_LM.WRIST];
    const midMcp = lms[HAND_LM.MIDDLE_MCP];
    const thumbTip = lms[HAND_LM.THUMB_TIP];
    const indexTip = lms[HAND_LM.INDEX_TIP];
    if (!wrist || !midMcp || !thumbTip || !indexTip) continue;

    const palm = dist2(wrist, midMcp) || 1e-6;
    const tipDist = dist2(thumbTip, indexTip);
    const ratio = tipDist / palm;

    const othersCurled =
      fingerCurled(lms, HAND_LM.MIDDLE_TIP, HAND_LM.MIDDLE_PIP, HAND_LM.MIDDLE_MCP) &&
      fingerCurled(lms, HAND_LM.RING_TIP, HAND_LM.RING_PIP, HAND_LM.RING_MCP) &&
      fingerCurled(lms, HAND_LM.PINKY_TIP, HAND_LM.PINKY_PIP, HAND_LM.PINKY_MCP);

    // Index should be bent toward the thumb (not a full point); thumb not fully extended away.
    const indexNotPointing = !fingerExtended(
      lms, HAND_LM.INDEX_TIP, HAND_LM.INDEX_PIP, HAND_LM.INDEX_MCP,
    );

    if (!othersCurled || !indexNotPointing) continue;

    // Soft confidence from tip proximity.
    const proximity = Math.max(0, 1 - ratio / EXIT_RATIO);
    const confidence = proximity * (othersCurled ? 1 : 0.5);
    if (ratio > EXIT_RATIO) continue;

    const candidate = {
      gesture: GESTURE_ID,
      confidence,
      hand: hand.handedness || hand.side || 'Unknown',
      position: mid(thumbTip, indexTip),
      _ratio: ratio,
      _enter: ratio <= ENTER_RATIO,
    };
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }

  return best;
}
