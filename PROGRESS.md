# Spellcast — Progress

Living tracker. Update status as work lands. Spec: [SPEC.md](./SPEC.md)

**Repo:** https://github.com/agteo/spellcast (public)  
**Last updated:** 2026-07-19  
**Current phase:** 0 — Bootstrap

## Status legend

- `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred

## Phase checklist

### Phase 0 — Bootstrap

- [x] Init git, add public remote `agteo/spellcast`
- [ ] Clone / vendor LiteRT.js-Mocap base (Apache-compatible attribution)
- [ ] Verify WebGPU path locally
- [x] Add `.gitignore` (node_modules, .env*, local models cache if needed, OS junk)
- [x] First push: SPEC + PROGRESS + README — no private paths/secrets

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

- _(empty — add as we go)_

## Blockers

- _(none)_
