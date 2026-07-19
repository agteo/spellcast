// Dab: nose close to one elbow while the opposite arm is extended.

import { LM } from '../pose/landmarks.js';
import { dist2, mid } from './geometry.js';
import { GESTURE } from './thresholds.js';

export const GESTURE_ID = 'dab';

const T = GESTURE.dab;

function armLength(pose, shoulder, elbow, wrist) {
  return dist2(pose[shoulder], pose[elbow]) + dist2(pose[elbow], pose[wrist]);
}

function straightness(pose, shoulder, elbow, wrist) {
  const direct = dist2(pose[shoulder], pose[wrist]);
  return direct / Math.max(armLength(pose, shoulder, elbow, wrist), 1e-6);
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

  const shoulderWidth = dist2(pose[LM.LEFT_SHOULDER], pose[LM.RIGHT_SHOULDER]) || 1e-6;
  const sides = [
    {
      faceElbow: LM.LEFT_ELBOW,
      farShoulder: LM.RIGHT_SHOULDER,
      farElbow: LM.RIGHT_ELBOW,
      farWrist: LM.RIGHT_WRIST,
      hand: 'Left',
    },
    {
      faceElbow: LM.RIGHT_ELBOW,
      farShoulder: LM.LEFT_SHOULDER,
      farElbow: LM.LEFT_ELBOW,
      farWrist: LM.LEFT_WRIST,
      hand: 'Right',
    },
  ];

  let best = null;
  for (const side of sides) {
    const faceDistance = dist2(pose[LM.NOSE], pose[side.faceElbow]) / shoulderWidth;
    const extension = straightness(pose, side.farShoulder, side.farElbow, side.farWrist);
    const farWrist = pose[side.farWrist];
    const farShoulder = pose[side.farShoulder];
    const reachesOut = Math.abs(farWrist.x - farShoulder.x) > shoulderWidth * T.reachOutMin;
    if (faceDistance > T.faceElbowMax || extension < T.armStraightMin || !reachesOut) continue;

    const confidence = Math.min(1, (1 - faceDistance / 0.9) * 0.6 + extension * 0.4);
    const candidate = {
      gesture: GESTURE_ID,
      confidence,
      hand: side.hand,
      position: mid(pose[LM.LEFT_SHOULDER], pose[LM.RIGHT_SHOULDER]),
      _enter: confidence >= 0.62,
      _cooldown: T.cooldown,
    };
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  return best;
}
