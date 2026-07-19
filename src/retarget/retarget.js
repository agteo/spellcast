// ---------------------------------------------------------------------------
// Retargeter — turns BlazePose landmark POSITIONS into bone ROTATIONS.
//
// The core problem: the model gives us 33 3D points per frame, but a rigged
// character is driven by joint rotations. There is no rotation data in the
// model output at all — we have to derive it. The approach:
//
//   1. COORDINATE CONVERSION
//      BlazePose "world landmarks" are in meters, origin at the hip center,
//      x = image-right, y = image-DOWN, z = away from camera.
//      Three.js is y-UP with the character facing the viewer (+z).
//      So a landmark maps as:  three = ( mp.x, -mp.y, -mp.z )
//      (Mirroring for the webcam is done before this, in mirrorLandmarks():
//      negate x and swap every left/right landmark — a true reflection, so
//      the character moves on the same screen side as the mirrored video.)
//
//   2. SEGMENT DIRECTIONS
//      Landmarks are grouped into limb segments (shoulder→elbow,
//      elbow→wrist, hip→knee, knee→ankle, hipCenter→neck for the spine...).
//      Each frame we compute the unit direction vector of each segment.
//
//   3. DIRECTION → QUATERNION (the actual retargeting step)
//      For each mapped bone we know, from the bind pose, which way the bone
//      points in its own local space: the normalized offset of its child
//      bone, `restDir` (a bone "points at" its child). If the bone's local
//      quaternion is q, the segment direction expressed in the PARENT's
//      space is  q * restDir.  We want that to equal the live direction
//      (transformed into parent space), so:
//
//        q = align ⊗ restQ,   where
//        align = shortest rotation from (restQ * restDir) to targetDir
//
//      Composing with the bind-pose rotation restQ (instead of solving from
//      scratch) preserves the rig's built-in twist, so meshes don't candy-
//      wrap around the bone axis.
//
//      Parent space matters: bones inherit their parents' rotations, so we
//      process the skeleton top-down (hips → spine → limbs) and express
//      every target direction in the CURRENT parent world rotation.
//
//   4. FULL-BASIS JOINTS (pelvis, chest & head)
//      A single direction can't capture twist. For the pelvis and chest we
//      have more information — the hip line and the shoulder line — so we
//      build a complete orthonormal basis (left, up, forward = left × up)
//      and derive a full 3D orientation. This is what makes the character
//      turn and lean with you instead of just waving limbs.
//      The HEAD gets the same treatment from the FACE: ear line + nose
//      direction. Face landmarks are real detections whenever a face is on
//      camera (unlike shoulders/hips, which the model extrapolates when out
//      of frame), so the head follows your actual head orientation even in
//      a face-only framing.
//
//   5. SMOOTHING
//      Landmarks are One-Euro filtered upstream; on top of that every bone
//      slerps toward its target with a dt-aware factor. Two stages =
//      steady limbs when you hold still, minimal lag when you move.
//
// Everything rig-SPECIFIC (bone names, which landmark drives what) lives in
// characters.js. This file never mentions a bone name.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { LM } from '../pose/landmarks.js';

// GLTFLoader sanitizes node names ("UpperArm.L" → "UpperArmL",
// "mixamorig:Hips" → "mixamorigHips"), so configs can use the original glTF
// names and we normalize both sides through the same function when looking up.
const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();

// How quickly bones chase their target rotation (1/seconds).
// Higher = snappier, lower = smoother. 12 ≈ reaches ~63% of the way in 83ms.
const ROTATION_SMOOTHING = 12;
const POSITION_SMOOTHING = 12;
const VISIBILITY_THRESHOLD = 0.55;

// Rest-return rates (1/seconds). Group relax is deliberate (legs settling
// into a stance); the per-bone rate is gentler so a landmark briefly dipping
// below the visibility threshold doesn't visibly tug the bone.
const GROUP_RELAX = 5;
const BONE_RELAX = 2;

// Limb-group hysteresis: a group engages when its smoothed visibility rises
// above ENGAGE and only disengages when it falls below DISENGAGE. The gap
// prevents flicker when e.g. knees hover at the bottom edge of the frame.
const GROUP_ENGAGE = 0.65;
const GROUP_DISENGAGE = 0.45;

// Frames of visible face averaged to learn the person's neutral head pitch
// (the eye-vs-ear-line offset varies per person; see the head basis in 4c).
const HEAD_PITCH_CALIB_FRAMES = 45;

// Limb groups: a whole limb engages/disengages together based on the probe
// landmarks' visibility (EMA + hysteresis). Combine modes:
//   'avg' — legs: knee and ankle leave the frame together, the average is a
//           stable signal.
//   'min' — arms: BlazePose routinely paints a PHANTOM elbow *inside* the
//           frame with a high visibility score while the real arm hangs out
//           of view (the wrist, predicted offscreen, gets its visibility
//           capped upstream). Averaging would let that phantom elbow hold
//           the arm engaged — the min can't be fooled by one confident guess.
const GROUP_DEFS = {
  leftLeg: { probe: [LM.LEFT_KNEE, LM.LEFT_ANKLE], combine: 'avg' },
  rightLeg: { probe: [LM.RIGHT_KNEE, LM.RIGHT_ANKLE], combine: 'avg' },
  leftArm: { probe: [LM.LEFT_ELBOW, LM.LEFT_WRIST], combine: 'min' },
  rightArm: { probe: [LM.RIGHT_ELBOW, LM.RIGHT_WRIST], combine: 'min' },
};
// Every landmark that belongs to a group: any driver reading one of these is
// gated by that group's engaged state.
const GROUP_LANDMARKS = {
  leftLeg: new Set([LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX]),
  rightLeg: new Set([LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX]),
  leftArm: new Set([LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_PINKY, LM.LEFT_INDEX, LM.LEFT_THUMB]),
  rightArm: new Set([LM.RIGHT_ELBOW, LM.RIGHT_WRIST, LM.RIGHT_PINKY, LM.RIGHT_INDEX, LM.RIGHT_THUMB]),
};

/** Which limb group (if any) a driver belongs to, from the landmarks it reads. */
function groupOf(...landmarkIndices) {
  for (const key of Object.keys(GROUP_LANDMARKS)) {
    if (landmarkIndices.some((i) => GROUP_LANDMARKS[key].has(i))) return key;
  }
  return null;
}

export class Retargeter {
  /**
   * @param {THREE.Object3D} characterRoot loaded (and already scaled) character
   * @param {object} config a CHARACTERS entry from characters.js
   * @param {{ framing?: 'full' | 'chest' }} [opts]
   */
  constructor(characterRoot, config, { framing = 'full' } = {}) {
    this.root = characterRoot;
    this.config = config;
    // 'full'  — torso needs hips AND shoulders in frame (most faithful).
    // 'chest' — torso driven from the shoulder line alone, assuming the
    //           spine is roughly vertical (gravity up). For chest-up webcam
    //           framing where the hips never score visible.
    this.framing = framing;
    this.bones = new Map();
    characterRoot.updateWorldMatrix(true, true);
    characterRoot.traverse((n) => this.bones.set(sanitize(n.name), n));

    this.#captureBindPose();
  }

  /** Look a bone up by its (original glTF) name. */
  #bone(name) {
    return this.bones.get(sanitize(name));
  }

  // -------------------------------------------------------------------------
  // Bind pose capture — everything below is measured ONCE, from the rig as
  // loaded, and referenced every frame afterwards.
  // -------------------------------------------------------------------------
  #captureBindPose() {
    const cfg = this.config;
    this.rootWorldQuatInv = this.root.getWorldQuaternion(Q()).invert();

    // --- Segment-driven bones
    this.segments = [];
    for (const seg of cfg.segments) {
      const bone = this.#bone(seg.bone);
      const child = this.#bone(seg.child);
      if (!bone || !child) {
        console.warn(`Retarget: missing bone "${seg.bone}" or "${seg.child}" — skipped`);
        continue;
      }
      const restDir = child.position.clone().normalize();
      if (restDir.lengthSq() < 1e-8) continue; // degenerate rig, skip
      this.segments.push({
        type: 'segment',
        bone,
        from: LM[seg.from],
        to: LM[seg.to],
        group: groupOf(LM[seg.from], LM[seg.to]),
        restDir,                              // which way the bone points, in bone space
        restQuat: bone.quaternion.clone(),    // bind-pose local rotation (keeps twist)
        depth: this.#depth(bone),
      });
    }

    // --- Basis-driven joints (pelvis, chest): store bind WORLD rotation.
    // At bind the live basis is identity (person upright facing the camera),
    // so:  liveWorldQuat = liveBasis ⊗ bindWorldQuat.
    this.basisJoints = [];
    for (const [key, lmA, lmB] of [
      ['pelvis', LM.LEFT_HIP, LM.RIGHT_HIP],
      ['chest', LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    ]) {
      const def = cfg[key];
      const bone = def && this.#bone(def.bone);
      if (!bone) continue;
      this.basisJoints.push({
        type: 'basis',
        key,
        bone,
        left: lmA,
        right: lmB,
        group: null, // pelvis/chest read hips & shoulders — never leg-gated
        restWorldQuat: bone.getWorldQuaternion(Q()),
        restQuat: bone.quaternion.clone(),
        depth: this.#depth(bone),
      });
    }

    // --- Head basis: full 3D head orientation from FACE landmarks (ear line
    // + ears→nose forward). Face points are real detections whenever a face
    // is on camera — unlike shoulders/hips, which the model extrapolates
    // (often with passing visibility scores) when they're out of frame. The
    // old NECK→HEAD_CENTER direction segments depended on those extrapolated
    // shoulders and couldn't see head pitch/yaw at all, so in a face-only
    // framing the head ended up aimed by garbage. The basis replaces any
    // direction segment configured on the same bone.
    const headBone = cfg.head && this.#bone(cfg.head.bone);
    if (headBone) {
      this.segments = this.segments.filter((s) => s.bone !== headBone);
      this.basisJoints.push({
        type: 'basis',
        key: 'head',
        bone: headBone,
        left: LM.LEFT_EAR,
        right: LM.RIGHT_EAR,
        group: null,
        restWorldQuat: headBone.getWorldQuaternion(Q()),
        restQuat: headBone.quaternion.clone(),
        depth: this.#depth(headBone),
        // Anatomical neutral-pitch calibration (see 4c): where the eye
        // landmarks sit relative to the ear line varies per person / model
        // output, so the level-head pitch is measured, not assumed.
        neutralPitch: 0,
        pitchSamples: 0,
      });
    }

    // One solve order for ALL rotation drivers: strictly parents before
    // children, regardless of driver type — the chest sits between the spine
    // and the arms, so interleaving matters.
    this.drivers = [...this.basisJoints, ...this.segments].sort((a, b) => a.depth - b.depth);

    // Limb-group tracking state. Groups start disengaged: a limb only starts
    // being driven once it's confidently in frame.
    this.groups = {};
    for (const [key, def] of Object.entries(GROUP_DEFS)) {
      this.groups[key] = { landmarks: def.probe, combine: def.combine, ema: 0, active: false };
    }

    // --- Position-driven bones (IK-style rigs, e.g. RobotExpressive's feet).
    //
    // These bones are moved, not rotated. Character proportions rarely match
    // human ones (the robot's legs are short and wide), so absolute human
    // positions can't be mapped directly. Instead each bone stays anchored at
    // its BIND position and moves by the *change* in its landmark since
    // calibration, scaled by (character leg length / human leg length):
    //
    //   target = bindWorldPos + (landmarkNow − landmarkAtCalibration) · scale
    //
    // Calibration happens on the first frame with a fully visible leg
    // (person assumed roughly standing). Demo-grade heuristic, documented
    // as such: world landmarks are hip-centered, so a deep squat reads as
    // "ankles moved up" — feet lift slightly instead of the body dropping.
    this.positionBones = [];
    this.mpToCharScale = null;
    if (cfg.positionBones?.length) {
      for (const pb of cfg.positionBones) {
        const bone = this.#bone(pb.bone);
        if (!bone) continue;
        this.positionBones.push({
          bone,
          landmark: LM[pb.landmark],
          group: groupOf(LM[pb.landmark]),
          restPos: bone.position.clone(),
          bindWorldPos: bone.getWorldPosition(V()),
          restLandmark: null, // captured at calibration
          // Parent of a root-level IK bone is static — cache its inverse once.
          parentInvMatrix: bone.parent.matrixWorld.clone().invert(),
        });
      }
      if (cfg.legChain) {
        const hip = this.#bone(cfg.legChain.hip);
        const knee = this.#bone(cfg.legChain.knee);
        const ankle = this.#bone(cfg.legChain.ankleEnd);
        if (hip && knee && ankle) {
          this.charLegLength =
            hip.getWorldPosition(V()).distanceTo(knee.getWorldPosition(V())) +
            knee.getWorldPosition(V()).distanceTo(ankle.getWorldPosition(V()));
        }
      }
    }
  }

  /** Switch framing mode: 'full' (hips required) or 'chest' (shoulders only). */
  setFraming(mode) {
    this.framing = mode;
  }

  /** Forget the position-bone calibration (call when mirroring flips). */
  resetCalibration() {
    this.mpToCharScale = null;
    for (const pb of this.positionBones) pb.restLandmark = null;
  }

  #depth(node) {
    let d = 0;
    for (let n = node; n.parent && n !== this.root; n = n.parent) d++;
    return d;
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  /**
   * Drive the rig from one frame of landmarks.
   * @param {Array<{x,y,z,visibility}>} worldLms EXTENDED (36-entry) world
   *   landmarks, already mirrored if mirroring is on. MediaPipe space.
   * @param {number} dt seconds since last update
   */
  update(worldLms, dt) {
    // MediaPipe space → Three.js space (see header, step 1).
    const pts = worldLms.map((p) => new THREE.Vector3(p.x, -p.y, -p.z));
    const vis = worldLms.map((p) => p.visibility);
    const alpha = 1 - Math.exp(-ROTATION_SMOOTHING * dt);

    // --- Limb-group visibility (partial-framing support).
    // A typical webcam shot is face-to-hips: the model still *predicts* leg
    // landmarks (extrapolated, low visibility), so we decide per LEG, from a
    // smoothed knee+ankle visibility with hysteresis, whether that leg is
    // really in frame. Engaged → limb tracks; disengaged → limb eases back
    // to its bind stance. Arms get the same treatment (min-combined, see
    // GROUP_DEFS) so a phantom in-frame elbow can't wave a missing arm.
    const gAlpha = 1 - Math.exp(-8 * dt);
    for (const g of Object.values(this.groups)) {
      const v =
        g.combine === 'min'
          ? Math.min(...g.landmarks.map((i) => vis[i]))
          : g.landmarks.reduce((sum, i) => sum + vis[i], 0) / g.landmarks.length;
      g.ema += (v - g.ema) * gAlpha;
      if (g.active) {
        if (g.ema < GROUP_DISENGAGE) g.active = false;
      } else if (g.ema > GROUP_ENGAGE) {
        g.active = true;
      }
    }
    const groupRelaxAlpha = 1 - Math.exp(-GROUP_RELAX * dt);
    const boneRelaxAlpha = 1 - Math.exp(-BONE_RELAX * dt);

    // Per-frame cache of current world rotations, filled top-down as we solve.
    const worldQuatCache = new Map();

    // Solve every rotation driver, strictly parents before children.
    for (const d of this.drivers) {
      // Out-of-frame limb → settle the whole limb into its bind stance.
      if (d.group && !this.groups[d.group].active) {
        d.bone.quaternion.slerp(d.restQuat, groupRelaxAlpha);
        continue;
      }
      if (d.type === 'basis') {
        const chestFraming = this.framing === 'chest';

        // Chest-up framing has no hip data at all — the pelvis stays in its
        // bind stance and the chest carries the whole torso orientation.
        if (chestFraming && d.key === 'pelvis') {
          d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
          continue;
        }

        let liveBasisQuat = null;
        if (d.key === 'head') {
          // --- 4c. Face basis (head bone) — framing-independent.
          // left = ear line, forward = ear-midpoint → EYE-midpoint (eyes sit
          // roughly level with the ear canals, so a level head gives a level
          // forward axis — the nose would bake in a permanent nod-down bias),
          // up = forward × left. All four landmarks are real detections
          // whenever the face is on camera, so this captures head yaw AND
          // pitch AND roll — the things the old shoulder-dependent direction
          // segment never could.
          if (
            vis[d.left] < VISIBILITY_THRESHOLD ||
            vis[d.right] < VISIBILITY_THRESHOLD ||
            vis[LM.LEFT_EYE] < VISIBILITY_THRESHOLD ||
            vis[LM.RIGHT_EYE] < VISIBILITY_THRESHOLD
          ) {
            d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
            continue;
          }
          const left = pts[d.left].clone().sub(pts[d.right]);
          const earMid = pts[d.left].clone().add(pts[d.right]).multiplyScalar(0.5);
          const eyeMid = pts[LM.LEFT_EYE].clone().add(pts[LM.RIGHT_EYE]).multiplyScalar(0.5);
          const forward = eyeMid.sub(earMid);
          if (left.lengthSq() < 1e-8) {
            d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
            continue;
          }
          left.normalize();
          // Make forward exactly perpendicular to the ear line.
          forward.addScaledVector(left, -forward.dot(left));
          if (forward.lengthSq() < 1e-6) {
            // Eyes collapsed onto the ear line (extreme profile) → unreadable.
            d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
            continue;
          }
          forward.normalize();
          // The eye landmarks do NOT sit exactly level with the ear canals —
          // how far above varies per person (and per model). Uncorrected,
          // that offset becomes a permanent head-up/down tilt. Measure the
          // neutral pitch over the first frames of face tracking (person
          // assumed to be looking at the screen) and subtract it.
          const pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
          if (d.pitchSamples < HEAD_PITCH_CALIB_FRAMES) {
            d.neutralPitch =
              (d.neutralPitch * d.pitchSamples + pitch) / (d.pitchSamples + 1);
            d.pitchSamples += 1;
          }
          if (d.neutralPitch) {
            // Positive rotation about the left axis lowers `forward`, so this
            // cancels an upward neutral bias (and vice versa). Rotating about
            // `left` keeps forward ⊥ left.
            forward.applyQuaternion(Q().setFromAxisAngle(left, d.neutralPitch));
          }
          const up = new THREE.Vector3().crossVectors(forward, left).normalize();
          const basis = new THREE.Matrix4().makeBasis(left, up, forward);
          liveBasisQuat = Q().setFromRotationMatrix(basis);
        } else if (chestFraming) {
          // --- 4b. Shoulder-only basis (chest-up framing).
          // Only the shoulder line is trustworthy; the up axis is assumed to
          // be gravity (person roughly upright — which is all a chest-up
          // webcam framing can see anyway). Captures yaw (turning) and roll
          // (leaning sideways); pitch (bowing) is invisible in this framing.
          if (vis[d.left] < VISIBILITY_THRESHOLD || vis[d.right] < VISIBILITY_THRESHOLD) {
            d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
            continue;
          }
          const left = pts[d.left].clone().sub(pts[d.right]).normalize();
          // Shoulders folded near-vertical → yaw/roll are unreadable noise.
          if (Math.abs(left.y) > 0.9) {
            d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
            continue;
          }
          // Orthogonalize world-up against the shoulder line.
          const up = new THREE.Vector3(0, 1, 0).addScaledVector(left, -left.y).normalize();
          const forward = new THREE.Vector3().crossVectors(left, up).normalize();
          const basis = new THREE.Matrix4().makeBasis(left, up, forward);
          liveBasisQuat = Q().setFromRotationMatrix(basis);
        } else {
          // --- 4. Full-basis joint (pelvis / chest).
          // The basis needs BOTH the hip line and the shoulder line to be
          // trustworthy: `up` is NECK−HIP_CENTER, so extrapolated out-of-frame
          // hips poison the pelvis AND chest even when shoulders are visible
          // (face-only framing pitched the whole character face-down). Gate on
          // all four torso landmarks and RELAX to bind pose instead of
          // freezing, so a bad frame can't lock the torso in a bent-over pose.
          const torsoVisible =
            vis[d.left] >= VISIBILITY_THRESHOLD &&
            vis[d.right] >= VISIBILITY_THRESHOLD &&
            vis[LM.LEFT_HIP] >= VISIBILITY_THRESHOLD &&
            vis[LM.RIGHT_HIP] >= VISIBILITY_THRESHOLD &&
            vis[LM.LEFT_SHOULDER] >= VISIBILITY_THRESHOLD &&
            vis[LM.RIGHT_SHOULDER] >= VISIBILITY_THRESHOLD;
          if (!torsoVisible) {
            d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
            continue;
          }

          // Build the live body basis: left axis from the hip/shoulder line,
          // up axis from the spine, forward = left × up (right-handed).
          const left = pts[d.left].clone().sub(pts[d.right]).normalize();
          const spine = pts[LM.NECK].clone().sub(pts[LM.HIP_CENTER]);
          // Degenerate spine (hips guessed right under the shoulders) → the up
          // axis is noise; ease back rather than aim the torso somewhere random.
          if (spine.length() < 0.18) {
            d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
            continue;
          }
          const up = spine.normalize();
          const forward = new THREE.Vector3().crossVectors(left, up).normalize();
          if (forward.lengthSq() < 1e-8) continue;
          // Re-orthogonalize left so the basis is exact.
          const orthoLeft = new THREE.Vector3().crossVectors(up, forward).normalize();

          const basis = new THREE.Matrix4().makeBasis(orthoLeft, up, forward);
          liveBasisQuat = Q().setFromRotationMatrix(basis);
        }

        // World target = live basis applied on top of the bind world rotation,
        // then converted into the bone's local space via its parent.
        const targetWorld = liveBasisQuat.clone().multiply(d.restWorldQuat);
        const parentWorld = this.#currentWorldQuat(d.bone.parent, worldQuatCache);
        const targetLocal = parentWorld.clone().invert().multiply(targetWorld);

        d.bone.quaternion.slerp(targetLocal, alpha);
        worldQuatCache.set(d.bone, parentWorld.multiply(d.bone.quaternion));
      } else {
        // --- 2 + 3. Segment bone.
        // Landmark momentarily unreliable → drift gently toward bind pose
        // (slow enough that a two-frame dip during fast motion is invisible,
        // but an elbow that leaves the frame doesn't stay frozen forever).
        // The spine segment reads the virtual HIP_CENTER, whose visibility is
        // the min of both hips — so face-only framing correctly relaxes it.
        //
        // In chest-up framing hips are DECLARED untrustworthy: the model
        // sometimes scores extrapolated out-of-frame hips above the
        // visibility threshold, and then the spine segments bend the torso
        // toward a guessed hip center. Relax them; the chest basis already
        // carries the torso in this mode.
        if (
          this.framing === 'chest' &&
          (d.from === LM.HIP_CENTER || d.to === LM.HIP_CENTER)
        ) {
          d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
          continue;
        }
        if (vis[d.from] < VISIBILITY_THRESHOLD || vis[d.to] < VISIBILITY_THRESHOLD) {
          d.bone.quaternion.slerp(d.restQuat, boneRelaxAlpha);
          continue;
        }

        // Live segment direction in world space...
        const targetDir = pts[d.to].clone().sub(pts[d.from]).normalize();
        if (targetDir.lengthSq() < 1e-8) continue;

        // ...expressed in the bone's PARENT space (bones live in parent space).
        const parentWorld = this.#currentWorldQuat(d.bone.parent, worldQuatCache);
        const dirInParent = targetDir.applyQuaternion(parentWorld.clone().invert());

        // Where the bone points now if left at bind pose, in parent space:
        const restPointing = d.restDir.clone().applyQuaternion(d.restQuat);
        // Shortest arc from bind direction to live direction...
        const align = Q().setFromUnitVectors(restPointing, dirInParent);
        // ...layered onto the bind rotation → preserves the rig's rest twist.
        const targetLocal = align.multiply(d.restQuat);

        d.bone.quaternion.slerp(targetLocal, alpha);
        worldQuatCache.set(d.bone, parentWorld.multiply(d.bone.quaternion));
      }
    }

    // --- Position-driven bones (IK feet): move, don't rotate.
    if (this.positionBones.length) {
      // Calibrate once we can see a full leg: capture the human→character
      // scale and each landmark's reference ("standing") position.
      // Requires the leg GROUP to be engaged, so extrapolated out-of-frame
      // landmarks can never produce a garbage scale.
      if (this.mpToCharScale === null && this.charLegLength) {
        const legOk =
          this.groups.leftLeg.active &&
          [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE].every(
            (i) => vis[i] > VISIBILITY_THRESHOLD
          );
        if (legOk) {
          const mpLeg =
            pts[LM.LEFT_HIP].distanceTo(pts[LM.LEFT_KNEE]) +
            pts[LM.LEFT_KNEE].distanceTo(pts[LM.LEFT_ANKLE]);
          if (mpLeg > 0.2) {
            this.mpToCharScale = this.charLegLength / mpLeg;
            for (const pb of this.positionBones) pb.restLandmark = pts[pb.landmark].clone();
          }
        }
      }
      const scale = this.mpToCharScale;
      if (scale) {
        const pAlpha = 1 - Math.exp(-POSITION_SMOOTHING * dt);
        for (const pb of this.positionBones) {
          // Out-of-frame leg → foot returns to where it stands at bind.
          if (pb.group && !this.groups[pb.group].active) {
            pb.bone.position.lerp(pb.restPos, groupRelaxAlpha);
            continue;
          }
          if (vis[pb.landmark] < VISIBILITY_THRESHOLD || !pb.restLandmark) continue;
          // Bind anchor + scaled movement since calibration (see note above).
          const delta = pts[pb.landmark].clone().sub(pb.restLandmark).multiplyScalar(scale);
          const targetWorld = pb.bindWorldPos.clone().add(delta);
          targetWorld.y = Math.max(targetWorld.y, 0); // never below the floor
          const targetLocal = targetWorld.applyMatrix4(pb.parentInvMatrix);
          pb.bone.position.lerp(targetLocal, pAlpha);
        }
      }
    }
  }

  /** Ease every driven bone back to its bind pose (used when tracking is lost). */
  relax(dt) {
    const alpha = 1 - Math.exp(-4 * dt);
    for (const s of this.segments) s.bone.quaternion.slerp(s.restQuat, alpha);
    for (const j of this.basisJoints) {
      j.bone.quaternion.slerp(j.restQuat, alpha);
      // Tracking fully lost → a different person (or framing) may come back;
      // relearn the neutral head pitch on re-entry.
      if (j.key === 'head') {
        j.pitchSamples = 0;
        j.neutralPitch = 0;
      }
    }
    for (const pb of this.positionBones) pb.bone.position.lerp(pb.restPos, alpha);
    // Decay limb-group confidence too, so someone re-entering the frame
    // torso-only doesn't inherit a stale "legs engaged" state.
    for (const g of Object.values(this.groups)) {
      g.ema += (0 - g.ema) * alpha;
      if (g.active && g.ema < GROUP_DISENGAGE) g.active = false;
    }
  }

  /**
   * Current world rotation of a node, composed from live local quaternions.
   * Uses the per-frame cache so already-solved parents are reused; walks up
   * through any unmapped in-between bones (clavicles etc.) transparently.
   */
  #currentWorldQuat(node, cache) {
    if (!node || node === this.root.parent) return Q(); // scene space
    const hit = cache.get(node);
    if (hit) return hit.clone();
    if (node === this.root) return this.root.getWorldQuaternion(Q());
    const q = this.#currentWorldQuat(node.parent, cache).multiply(node.quaternion);
    cache.set(node, q);
    return q.clone();
  }

  /**
   * What the limb gating is currently doing — for the HUD.
   * 'FULL BODY' both legs tracked · 'PARTIAL' one leg · 'UPPER BODY' none ·
   * 'CHEST-UP' when chest-up framing mode is selected.
   */
  get trackingMode() {
    if (this.framing === 'chest') return 'CHEST-UP';
    const l = this.groups.leftLeg.active;
    const r = this.groups.rightLeg.active;
    if (l && r) return 'FULL BODY';
    if (l || r) return 'PARTIAL';
    return 'UPPER BODY';
  }

  /** All driven bone names — used by the session recorder / exporters. */
  drivenBoneNames() {
    return [
      ...this.basisJoints.map((j) => j.bone.name),
      ...this.segments.map((s) => s.bone.name),
      ...this.positionBones.map((p) => p.bone.name),
    ];
  }
}
