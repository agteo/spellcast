# Spellcast — Progress

Living tracker. Update status as work lands. Spec: [SPEC.md](./SPEC.md)

**Repo:** https://github.com/agteo/spellcast (public)  
**Last updated:** 2026-07-19  
**Current phase:** 1 — Hand tracking

## Status legend

- `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred

## Phase checklist

### Phase 0 — Bootstrap

- [x] Init git, add public remote `agteo/spellcast`
- [x] Clone / vendor LiteRT.js-Mocap base (Apache-compatible attribution)
- [x] Verify WebGPU path locally (`isWebGPUSupported` + default `webgpu` compile; `npm run build` OK — confirm HUD in Chrome)
- [x] Add `.gitignore` (node_modules, .env*, litert-wasm copy, OS junk; allow shipped `public/models/*.tflite`)
- [x] First push: SPEC + PROGRESS + README — no private paths/secrets
- [x] Vendor push: base app tree + attribution + package rename

### Phase 1 — Hand tracking

- [ ] `src/hands/detector.js` + `landmarks.js`
- [ ] ROI crop from pose wrists; up to 2 hands/frame
- [ ] Overlay hand skeleton; HUD second INFER row

### Phase 2 — First gesture E2E

- [ ] `src/gestures/` registry (hysteresis + cooldown)
- [ ] Finger heart recognizer
- [ ] Hearts effect via `src/effects/`

### Phase 3 — Strange circle

- [ ] Trail + least-squares circle fit
- [ ] Ring shader + bloom + embers

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
- Package name set to `spellcast` (`0.1.0`); base scripts (`dev` / `build` / Wasm copy) unchanged.
- Shipped BlazePose `.tflite` and character `.glb` files are intentionally tracked.

## Blockers

- _(none)_
