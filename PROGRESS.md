# Spellcast — Progress

Living tracker. Update status as work lands. Spec: [SPEC.md](./SPEC.md)

**Repo:** https://github.com/agteo/spellcast (public)  
**Last updated:** 2026-07-19  
**Current phase:** 8 — Polish (complete)

## Status legend

- `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred

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
- [x] Skip offscreen wrists; CPU every-other-frame + ≤1 hand/infer with cache merge
- [x] Public README: gestures table, features, tunables tip

## Public-repo hygiene (do not commit)

- Secrets / `.env*` / API keys
- Absolute local paths (`/Users/...`)
- Private notes, credentials, personal webcam/media samples
- Large binary dumps unless deliberately vendored and licensed

## Notes / decisions

- Vendored from https://github.com/andrisgauracs/LiteRT.js-Mocap (see ATTRIBUTION.md).
- Hand ROIs from pose wrist/index/pinky; CPU alternates one hand/frame + stride-2; offscreen wrists skip infer.
- Tunables live in `src/gestures/thresholds.js`.
- Ghost / custom GLB / share features are local-only (no backend).
- Face/torso mapping in close face-only framing remains a known limitation — prefer shoulders-to-hips framing.

## Blockers

- Face/torso mapping is still unreliable in close face-only framing. Deferred for focused retargeting diagnosis; use shoulders-to-hips framing for gesture testing.
