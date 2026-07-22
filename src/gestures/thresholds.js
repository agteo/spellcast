// Tunable gesture / tracking thresholds (Phase 8 polish).
// Keep recognizers readable by importing named constants from here.

export const GESTURE = {
  // Registry hysteresis / cooldown defaults
  enterFrames: 3,
  exitFrames: 3,
  cooldownSec: 1.5,

  fingerHeart: {
    enterRatio: 0.30, // tip distance / palm size
    exitRatio: 0.45,
  },

  strangeCircle: {
    tipTogetherEnter: 0.38,
    tipTogetherExit: 0.52,
    minPoints: 16,
    maxPoints: 90,
    minDuration: 0.4,
    minRadius: 0.035,
    maxRadius: 0.38,
    maxRms: 0.045,
    minSweepDeg: 300,
    cooldown: 2.6,
  },

  dab: {
    faceElbowMax: 0.72,   // nose→elbow / shoulder width
    armStraightMin: 0.84,
    reachOutMin: 0.6,     // far wrist lateral reach / shoulder width
    cooldown: 2.0,
  },

  armsV: {
    spreadMin: 1.35,
    armStraightMin: 0.84,
    cooldown: 2.2,
  },

  fingerGun: {
    thumbArmMin: 0.88,    // thumb spread / palm to arm
    thumbFireMax: 0.64,   // thumb drop to fire
    cooldown: 0.75,
  },
};

export const HANDS = {
  // Candidate gate only — the hand model's own presence score (scoreMin) is
  // the real filter, so this can sit below the 0.5 overlay/retarget bar:
  // pose wrist visibility dips during fast motion and a missed candidate
  // means the hand model never even gets to look.
  wristVisMin: 0.4,
  scoreMin: 0.55,
  /** Presence floor when the crop was enlarged for a near-camera hand. */
  scoreMinNear: 0.45,
  /** Normalized margin — wrists outside this band skip hand infer. */
  frameMargin: 0.03,
  /**
   * Soft outer band: wrists here still get a clamped ROI (close hands often
   * clip the frame edge without actually leaving the camera).
   */
  frameSoftMargin: -0.02,
  /** On CPU, run one hand per pose cycle; two hands alternate. */
  cpuFrameStride: 1,
};
