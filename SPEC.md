# Spellcast — gesture-unlocked effects on LiteRT.js Mocap

Browser-based motion capture where specific body moves and hand gestures unlock visual effects: a Korean finger heart pops floating heart emojis; drawing a circle with index+middle finger together conjures a Doctor Strange–style sparking ring. Built on a clone of [LiteRT.js-Mocap](https://github.com/andrisgauracs/LiteRT.js-Mocap).

## What we keep from the base repo

- LiteRT.js pipeline: `.tflite` load/compile, WebGPU ↔ CPU (Wasm) switching, tensor I/O
- BlazePose (33 landmarks) + ROI tracking between frames
- One Euro smoothing, retargeting math, character configs (Xbot, RobotExpressive)
- HUD (FPS / inference latency / backend), overlay, camera handling, error states
- Exporter (JSON/BVH) — reused for ghost replay

## What we add

### 1. Hand tracking (second LiteRT model)

Body pose alone can't see a finger heart. Add MediaPipe **Hand Landmark (full)** — 21 keypoints/hand, ~5 MB tflite, Apache-2.0, from the same mediapipe-assets bucket.

- Crop each hand ROI from the pose model's wrist + index/pinky landmarks (the MediaPipe Holistic approach — no palm detector model needed)
- Run up to 2 hand inferences/frame; skip hands whose wrist visibility is low
- Own One Euro smoothers per hand
- HUD gains a second INFER row (pose ms + hands ms) — nice LiteRT.js showcase: 3 model invocations/frame on WebGPU

New files: `src/hands/detector.js`, `src/hands/landmarks.js`.

### 2. Gesture engine

`src/gestures/` — small rule-based recognizers over pose + hand landmarks (no extra ML model; deterministic, tunable, debuggable). Each recognizer emits `{ gesture, confidence, hand, position }` events with enter/exit hysteresis and a cooldown.

Launch set:

| Gesture | Detection | Effect |
|---|---|---|
| Korean finger heart | Thumb tip ↔ index tip distance < threshold, other fingers curled | Heart emoji sprites pop and float up from the hand |
| Strange circle | Index+middle tips together, extended; fingertip trail fits a circle (least-squares fit, low residual, > 300° swept) | Sparking orange ring shader at the drawn circle, ember particles |
| Dab | Face into elbow crook, other arm extended, both arms parallel | Screen flash + confetti burst |
| Arms raised "V" | Both wrists above head, arms straight | Golden particle rain |
| Finger gun | Index extended, others curled, thumb up; fires on thumb drop | Muzzle flash + projectile with trail |

Adding a gesture = one file exporting `update(landmarks, hands, dt) → event|null`, registered in an index — mirrors the repo's `characters.js` pattern.

### 3. Effects engine

`src/effects/` — Three.js layer over the existing scene: GPU particle system (instanced sprites), shader ring (glow + noise sparks), emoji sprite pool, post-processing bloom (UnrealBloomPass). Effects anchor either to world space (ring stays where drawn) or to a tracked joint (hearts follow the hand). Each effect: `spawn(event)`, `update(dt)`, auto-dispose.

An unlock tracker shows discovered gestures in a side panel (grayed-out silhouettes → lit icons), giving it a light game feel without scoring.

### 4. Ghost replay

Reuse the exporter's recorded frames: replay a saved take on a second, semi-transparent character while you perform live. UI: Record → Save take → toggle Ghost. Takes kept in memory + downloadable JSON (base repo format, unchanged).

### 5. Custom characters

Already supported by the base (`characters.js` bone maps). We add: drag-and-drop a `.glb` onto the page → auto-detect Mixamo-style bone names → generate the map at runtime, fall back to a "add a config entry" toast if names don't match.

### 6. Score sharing

Capture the canvas with `MediaRecorder` (webm, canvas + effects composited) for a shareable clip; a "Share card" button renders a PNG with your unlocked-gesture grid + best combo. No backend — files download locally.

## Architecture delta

```
src/
  hands/
    detector.js      hand-landmark LiteRT integration (ROI from pose wrists)
    landmarks.js     21-keypoint constants, handedness, mirroring
  gestures/
    index.js         registry + event bus (hysteresis, cooldowns)
    fingerHeart.js   strangeCircle.js  dab.js  armsV.js  fingerGun.js
  effects/
    engine.js        effect lifecycle, anchoring, bloom composer
    particles.js     ring.js  sprites.js
  replay/
    ghost.js         playback of recorded takes onto a second character
  share/
    recorder.js      MediaRecorder clip capture + share-card PNG
```

`main.js` loop becomes: camera frame → pose infer → hand ROIs → hand infer ×2 → smooth → retarget character → gesture update → effects update → render.

## Milestones

1. **Clone + run** the base repo; verify WebGPU path
2. **Hand model** integrated, hand skeleton drawn on overlay
3. **Gesture engine** with finger heart + hearts effect end-to-end
4. **Strange circle** (trail fitting + ring shader + bloom) — the money shot
5. Remaining gestures + unlock panel
6. Ghost replay
7. Drag-and-drop characters
8. Clip recording + share card
9. Polish: thresholds tuning, perf (skip hand infer when wrists offscreen), README

## Risks

- Hand model on CPU fallback may cost ~20–40 ms/hand → auto-drop to 1 hand or every-other-frame hand inference when backend = CPU
- Finger heart needs decent webcam resolution at distance → use the pose ROI to crop at full video resolution, not the downscaled pose input
- Circle detection false positives → require the two-finger pose *during* the whole trail, plus minimum radius and duration
