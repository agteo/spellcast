// Strange circle: index+middle tips together & extended; fingertip trail
// must fit a circle (least-squares) with low residual and >300° sweep.
// Spec risk mitigation: require the two-finger pose for the whole trail,
// plus minimum radius and duration.

import { HAND_LM } from '../hands/landmarks.js';
import { dist2, mid, fingerCurled, fingerExtended } from './geometry.js';
import { GESTURE } from './thresholds.js';

export const GESTURE_ID = 'strangeCircle';

const T = GESTURE.strangeCircle;
const TIP_TOGETHER_ENTER = T.tipTogetherEnter;
const TIP_TOGETHER_EXIT = T.tipTogetherExit;
const MIN_POINTS = T.minPoints;
const MAX_POINTS = T.maxPoints;
const MIN_DURATION = T.minDuration;
const MIN_RADIUS = T.minRadius;
const MAX_RADIUS = T.maxRadius;
const MAX_RMS = T.maxRms;
const MIN_SWEEP_DEG = T.minSweepDeg;

/** @type {Map<string, { points: Array<{x,y,t}>, t: number }>} */
const trails = new Map();

function twoFingerPose(lms) {
  const wrist = lms[HAND_LM.WRIST];
  const midMcp = lms[HAND_LM.MIDDLE_MCP];
  const iTip = lms[HAND_LM.INDEX_TIP];
  const mTip = lms[HAND_LM.MIDDLE_TIP];
  if (!wrist || !midMcp || !iTip || !mTip) return null;

  const palm = dist2(wrist, midMcp) || 1e-6;
  const tipRatio = dist2(iTip, mTip) / palm;
  if (tipRatio > TIP_TOGETHER_EXIT) return null;

  const indexOut = fingerExtended(lms, HAND_LM.INDEX_TIP, HAND_LM.INDEX_PIP, HAND_LM.INDEX_MCP);
  const middleOut = fingerExtended(lms, HAND_LM.MIDDLE_TIP, HAND_LM.MIDDLE_PIP, HAND_LM.MIDDLE_MCP);
  const ringIn = fingerCurled(lms, HAND_LM.RING_TIP, HAND_LM.RING_PIP, HAND_LM.RING_MCP);
  const pinkyIn = fingerCurled(lms, HAND_LM.PINKY_TIP, HAND_LM.PINKY_PIP, HAND_LM.PINKY_MCP);
  if (!indexOut || !middleOut || !ringIn || !pinkyIn) return null;

  return {
    tip: mid(iTip, mTip),
    tipRatio,
    tight: tipRatio <= TIP_TOGETHER_ENTER,
  };
}

/** Algebraic circle fit via mean-centered Kåsa method. */
function fitCircle(points) {
  const n = points.length;
  if (n < 3) return null;

  let mx = 0, my = 0;
  for (const p of points) { mx += p.x; my += p.y; }
  mx /= n; my /= n;

  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suuv = 0, suvv = 0;
  for (const p of points) {
    const u = p.x - mx;
    const v = p.y - my;
    const uu = u * u;
    const vv = v * v;
    suu += uu; svv += vv; suv += u * v;
    suuu += uu * u; svvv += vv * v;
    suuv += uu * v; suvv += u * vv;
  }

  const denom = 2 * (suu * svv - suv * suv);
  if (Math.abs(denom) < 1e-12) return null;

  const uc = (svv * (suuu + suvv) - suv * (svvv + suuv)) / denom;
  const vc = (suu * (svvv + suuv) - suv * (suuu + suvv)) / denom;
  const cx = mx + uc;
  const cy = my + vc;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  if (!(r > 0) || !Number.isFinite(r)) return null;

  let err = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - cx, p.y - cy) - r;
    err += d * d;
  }
  return { cx, cy, r, rms: Math.sqrt(err / n) };
}

/** Unwrapped angular sweep around the fitted center. */
function sweepDegrees(points, cx, cy) {
  if (points.length < 2) return 0;
  let prev = Math.atan2(points[0].y - cy, points[0].x - cx);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const ang = Math.atan2(points[i].y - cy, points[i].x - cx);
    let d = ang - prev;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    total += d;
    prev = ang;
  }
  return Math.abs(total) * (180 / Math.PI);
}

/**
 * @returns {null | { gesture, confidence, hand, position, radius, _enter, _instant, _cooldown }}
 */
// Frames a tracked hand may briefly drop out (CPU frame stride, ROI flicker)
// before its trail is abandoned.
const DROPOUT_GRACE_FRAMES = 4;

export function update(_pose, hands, dt = 1 / 60) {
  hands = hands || [];
  const activeHands = new Set();
  let fired = null;

  for (const hand of hands) {
    const key = hand.handedness || hand.side || 'Unknown';
    activeHands.add(key);
    const pose = twoFingerPose(hand.landmarks);
    // Hysteresis: a trail STARTS only when the tips are tight (enter
    // threshold) but CONTINUES as long as twoFingerPose passes the looser
    // exit threshold — natural finger wobble mid-circle must not kill it.
    if (!pose) {
      // A present hand can still have one finger misread for a frame. Treat it
      // like detector dropout instead of destroying an otherwise good trail.
      const trail = trails.get(key);
      if (trail) {
        trail.miss += 1;
        if (trail.miss > DROPOUT_GRACE_FRAMES) trails.delete(key);
      }
      continue;
    }
    let trail = trails.get(key);
    if (!trail) {
      if (!pose.tight) continue; // not started yet — wait for a tight pinch
      trail = { points: [], t: 0, miss: 0 };
      trails.set(key, trail);
    }
    trail.miss = 0;
    trail.t += dt;

    const last = trail.points[trail.points.length - 1];
    const p = { x: pose.tip.x, y: pose.tip.y, t: trail.t };
    if (!last || dist2(last, p) > 0.008) {
      trail.points.push(p);
      if (trail.points.length > MAX_POINTS) trail.points.shift();
    }

    if (trail.points.length < MIN_POINTS || trail.t < MIN_DURATION) continue;

    const fit = fitCircle(trail.points);
    if (!fit) continue;
    if (fit.r < MIN_RADIUS || fit.r > MAX_RADIUS) continue;
    if (fit.rms > MAX_RMS || fit.rms / fit.r > 0.35) continue;

    const sweep = sweepDegrees(trail.points, fit.cx, fit.cy);
    if (sweep < MIN_SWEEP_DEG) continue;

    const confidence = Math.min(1, (sweep / 360) * (1 - fit.rms / (MAX_RMS * 2)));
    fired = {
      gesture: GESTURE_ID,
      confidence,
      hand: key,
      position: { x: fit.cx, y: fit.cy, z: 0 },
      radius: fit.r,
      _enter: true,
      _instant: true,
      _cooldown: T.cooldown,
    };
    trails.delete(key);
    break;
  }

  // A hand can vanish for a frame or two (CPU stride, ROI flicker) without
  // the person stopping their circle — keep the trail through short gaps.
  for (const [key, trail] of trails) {
    if (activeHands.has(key)) continue;
    trail.miss += 1;
    if (trail.miss > DROPOUT_GRACE_FRAMES) trails.delete(key);
  }

  return fired;
}
