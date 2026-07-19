// ---------------------------------------------------------------------------
// MediaPipe Hand Landmark constants (21 keypoints) and helpers.
// ---------------------------------------------------------------------------

export const HAND_LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

export const NUM_HAND_LANDMARKS = 21;

/** Skeleton edges for the 2D hand overlay. */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

/**
 * Mirror hand landmarks in normalized screen space (x-flip around centerX).
 * Handedness label is swapped (left ↔ right) to match the mirrored image.
 */
export function mirrorHand(hand, centerX = 0.5) {
  if (!hand) return null;
  return {
    ...hand,
    handedness: hand.handedness === 'Left' ? 'Right' : hand.handedness === 'Right' ? 'Left' : hand.handedness,
    landmarks: hand.landmarks.map((p) => ({ ...p, x: 2 * centerX - p.x })),
  };
}
