# Spellcast — Progress

Living tracker. Update status as work lands. Spec: [SPEC.md](./SPEC.md)

**Repo:** https://github.com/agteo/spellcast (public)  
**Last updated:** 2026-07-19  
**Current phase:** 5 — Ghost replay (finishing) → next: 6 — Custom characters

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
- Torso fix: pelvis/chest basis now gated on all four torso landmarks + minimum spine length, relaxing to bind pose otherwise — face-only framing no longer pitches the character face-down.
- Spellbot re-skin: per-material PBR overrides in `characters.js` (teal emissive core, dark slate shell, violet accents) applied at load in `scene.js`; violet rim light + grid.
- Phase 4 gestures remain deterministic: dab uses face-to-elbow + opposite straight arm; arms-V uses both wrists above the head; finger gun arms on thumb-up and fires on thumb drop.
- Unlock discovery is session-only; no identity, storage, or backend.
- Ghost replay: Save take snapshots `litert-mocap/1` frames in memory; Ghost loads a translucent offset clone of the take's character and loops bone rotations.

## Blockers

- Face/torso mapping is still unreliable in close face-only framing. Deferred for focused retargeting diagnosis; use shoulders-to-hips framing for gesture testing.
