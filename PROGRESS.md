# Spellcast — Progress

Living tracker. Update status as work lands. Spec: [SPEC.md](./SPEC.md)

**Repo:** https://github.com/agteo/spellcast (public)  
**Last updated:** 2026-07-21
**Current phase:** Tracking v2 + spell linkage (in progress)

## Status legend

- `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred

## Post-launch: Tracking v2 + spell linkage

- [x] Limb bend-plane twist (arms/legs `twistVia`)
- [x] Split One-Euro presets (snappy limbs, heavy hips) + softer micro-freeze
- [x] Chest-up soft pitch from head; full-mode hips-below-shoulders gate
- [x] Soften chest-up arm kill (wrist-chain only); X Bot default
- [x] `GESTURE_BINDINGS` + follow-anchored hearts
- [x] Unlock/fire `AnimationMixer` clips on Spellbot (`config.anims`)
- [x] Upper-limb/gesture reliability: reach-aware pose ROI, aligned hand ROI,
      split upper-arm/forearm gating, gesture rearming + dropout fixes
- [x] Node regression tests for gesture hysteresis and smoother reset
- [ ] User-saved gesture → link effect/anim (deferred)
- [ ] Confirm in Chrome: mapping + spell clips
## Phase checklist

### Phase 0 — Bootstrap

- [x] Init git, add public remote `agteo/spellcast`
- [x] Clone / vendor LiteRT.js-Mocap base (Apache-compatible attribution)
- [x] Verify WebGPU path locally
- [x] Add `.gitignore`
- [x] First push + vendor push

### Phase 1 — Hand tracking

- [x] `src/hands/detector.js` + `landmarks.js`
- [x] ROI crop from pose wrists; up to 2 hands/frame (1 hand/frame on CPU)
- [x] Overlay hand skeleton; HUD POSE + HANDS rows
- [ ] Confirm in Chrome: both hands draw; HUD shows pose + hands ms

### Phase 2 — First gesture E2E

- [x] `src/gestures/` registry (hysteresis + cooldown)
- [x] Finger heart recognizer
- [x] Hearts effect via `src/effects/`
- [ ] Confirm in Chrome: finger heart → heart burst + toast

### Phase 3 — Strange circle

- [x] Trail + least-squares circle fit (`strangeCircle.js`)
- [x] Ring shader + bloom + embers
- [ ] Confirm in Chrome: draw a circle with index+middle → sparking portal

### Phase 4 — Remaining gestures + unlock panel

- [x] dab, armsV, fingerGun recognizers
- [x] Screen flash + confetti, golden rain, muzzle projectile/trail
- [x] Session unlock side panel (all five launch gestures)
- [ ] Confirm thresholds and effects in Chrome

### Phase 5 — Ghost replay

- [x] `src/replay/ghost.js` on second translucent character
- [x] Save take (in-memory) + Ghost toggle UI
- [ ] Confirm in Chrome: Record → Save take → Ghost loops beside live

### Phase 6 — Custom characters

- [x] Drag-drop `.glb` + runtime Mixamo map (`mixamoMap.js`)
- [x] File picker + drop overlay; fallback toast lists missing bones
- [ ] Confirm with a Mixamo export in Chrome

### Phase 7 — Share

- [x] MediaRecorder side-by-side WebM clip (`src/share/recorder.js`)
- [x] Share-card PNG with unlock grid + best combo (`src/share/card.js`)
- [ ] Confirm clip + card download in Chrome

### Phase 8 — Polish

- [x] Centralize thresholds in `src/gestures/thresholds.js`
- [x] Skip offscreen wrists; CPU ≤1 hand/pose cycle with cache merge
- [x] Public README: gestures table, features, tunables tip

## Public-repo hygiene (do not commit)

- Secrets / `.env*` / API keys
- Absolute local paths (`/Users/...`)
- Private notes, credentials, personal webcam/media samples
- Large binary dumps unless deliberately vendored and licensed

## Notes / decisions

- Vendored from https://github.com/andrisgauracs/LiteRT.js-Mocap (see ATTRIBUTION.md).
- Hand ROIs from pose wrist/index/pinky, aligned to the landmark model's Y axis;
  CPU alternates one hand per pose cycle; offscreen wrists skip infer.
- Tunables live in `src/gestures/thresholds.js`.
- Ghost / custom GLB / share features are local-only (no backend).
- Head is now basis-driven from FACE landmarks (ear line + eye-midpoint forward) — follows head yaw/pitch/roll even in face-only framing. Chest-up framing also relaxes hip-dependent spine segments (extrapolated hips sometimes pass the visibility gate and used to bend the torso).
- Gesture recognizers see *pre-synthesis* landmarks (`gestureScreen`) so dab still gets a real elbow crook; retarget may synthesize mid-joints separately.
- Webcam + overlay use `object-fit: contain` so skeleton dots stay aligned with the video (cover was cropping the mapping).

## Blockers

- None. Face-only head mapping fixed via face-basis head driver (verify in Chrome).
