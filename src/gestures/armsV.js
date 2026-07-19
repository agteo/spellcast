// Arms raised in a V: both wrists above the head, elbows nearly straight,
// and wrists spread wider than shoulders.

import { LM } from '../pose/landmarks.js';
import { dist2, mid } from './geometry.js';

export const GESTURE_ID = 'armsV';

function armStraightness(pose, shoulder, elbow, wrist) {
  const path = dist2(pose[shoulder], pose[elbow]) + dist2(pose[elbow], pose[wrist]);
  return dist2(pose[shoulder], pose[wrist]) / Math.max(path, 1e-6);
}

export function update(pose) {
  if (!pose?.length) return null;
  const required = [
    LM.NOSE,
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
    LM.LEFT_WRIST, LM.RIGHT_WRIST,
  ];
  if (required.some((i) => !pose[i] || pose[i].visibility < 0.55)) return null;

  const leftStraight = armStraightness(pose, LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST);
  const rightStraight = armStraightness(pose, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
  const shoulderWidth = dist2(pose[LM.LEFT_SHOULDER], pose[LM.RIGHT_SHOULDER]) || 1e-6;
  const wristsAboveHead =
    pose[LM.LEFT_WRIST].y < pose[LM.NOSE].y &&
    pose[LM.RIGHT_WRIST].y < pose[LM.NOSE].y;
  const spread = Math.abs(pose[LM.LEFT_WRIST].x - pose[LM.RIGHT_WRIST].x) / shoulderWidth;
  // Use screen-space bounds rather than anatomical left/right: raw webcam
  // coordinates put the person's left on the image's right.
  const shoulderMinX = Math.min(pose[LM.LEFT_SHOULDER].x, pose[LM.RIGHT_SHOULDER].x);
  const shoulderMaxX = Math.max(pose[LM.LEFT_SHOULDER].x, pose[LM.RIGHT_SHOULDER].x);
  const wristMinX = Math.min(pose[LM.LEFT_WRIST].x, pose[LM.RIGHT_WRIST].x);
  const wristMaxX = Math.max(pose[LM.LEFT_WRIST].x, pose[LM.RIGHT_WRIST].x);
  const opensOutward = wristMinX < shoulderMinX && wristMaxX > shoulderMaxX;

  if (!wristsAboveHead || !opensOutward || spread < 1.45) return null;
  const confidence = Math.min(1, ((leftStraight + rightStraight) / 2) * 0.75 + Math.min(spread / 2.5, 1) * 0.25);
  return {
    gesture: GESTURE_ID,
    confidence,
    hand: 'Both',
    position: mid(pose[LM.LEFT_WRIST], pose[LM.RIGHT_WRIST]),
    _enter: leftStraight > 0.86 && rightStraight > 0.86 && confidence >= 0.72,
    _cooldown: 2.5,
  };
}
