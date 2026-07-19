# Spellcast — Progress

Living tracker. Update status as work lands. Spec: [SPEC.md](./SPEC.md)

**Repo:** https://github.com/agteo/spellcast (public)  
**Last updated:** 2026-07-19  
**Current phase:** 3 — Strange circle (finishing) → next: 4 — Remaining gestures + unlock panel

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

- [ ] dab, armsV, fingerGun
- [ ] Unlock side panel

### Phase 5 — Ghost replay

- [ ] `src/replay/ghost.js` on second character

### Phase 6 — Custom characters

- [ ] Drag-drop `.glb` + runtime Mixamo map

### Phase 7 — Share

- [ ] MediaRecorder clip + share-card PNG

### Phase 8 — Polish

- [ ] Threshold tuning; CPU hand-infer throttle; README

## Public-repo hygiene (do not commit)

- Secrets / `.env*` / API keys
- Absolute local paths (`/Users/...`)
- Private notes, credentials, personal webcam/media samples
- Large binary dumps unless deliberately vendored and licensed

## Notes / decisions

- Vendored from https://github.com/andrisgauracs/LiteRT.js-Mocap (see ATTRIBUTION.md).
- Hand ROIs from pose wrist/index/pinky; CPU alternates one hand/frame.
- Finger heart: tip proximity + curled other fingers; hearts in Three.js stage.
- Strange circle: index+middle tips together & extended for whole trail; Kåsa fit; ≥300° sweep; world-anchored ring + UnrealBloomPass; ~2.8s cooldown.

## Blockers

- _(none)_
