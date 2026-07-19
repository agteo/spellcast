# Spellcast

Gesture-unlocked visual effects on browser motion capture.

Spellcast builds on [LiteRT.js-Mocap](https://github.com/andrisgauracs/LiteRT.js-Mocap): BlazePose body tracking, a second LiteRT hand-landmark model, rule-based gesture recognition, and Three.js effects. Move your body and hands to unlock effects — no backend, everything runs locally after `npm install`.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

Use **Chrome** (or another WebGPU browser) for the fast path. Missing WebGPU falls back to CPU (Wasm) automatically.

**Tip:** pick the **Framing** mode that matches your camera: *Chest-up* (default) drives the torso from your shoulders alone — ideal at a desk; *Full torso* uses hips + shoulders for the most faithful leaning and turning, so stand with shoulders-to-hips in frame. Hands need to be visible for hand gestures.

## Gestures

| Gesture | How | Effect |
|---------|-----|--------|
| Finger heart | Thumb tip meets index tip; other fingers curled | Floating hearts |
| Strange circle | Index + middle together; draw a large circle | Sparking portal ring + bloom |
| Dab | Face into one elbow; other arm extended | Flash + confetti |
| Arms V | Both wrists above head, arms open | Golden particle rain |
| Finger gun | Index out, others curled; thumb up then drop | Projectile + trail |

Unlocked gestures light up in the side panel (session-only).

## Features

- **Hand tracking** — MediaPipe Hand Landmark via LiteRT.js (ROI from pose wrists; skips offscreen wrists; throttles on CPU)
- **Effects** — particles, shader ring, emoji sprites, UnrealBloomPass
- **Ghost replay** — Record → Save take → toggle Ghost for a translucent twin
- **Custom characters** — drag-and-drop a Mixamo-style `.glb` (or use Custom .glb)
- **Share** — ● Clip downloads a local WebM; Share card downloads a PNG of unlocks + best combo

## Tunables

Gesture and hand-tracking thresholds live in [`src/gestures/thresholds.js`](./src/gestures/thresholds.js) so you can tweak sensitivity without hunting through recognizers.

## Docs

| Doc | Purpose |
|-----|---------|
| [SPEC.md](./SPEC.md) | Product contract |
| [PROGRESS.md](./PROGRESS.md) | Phase checklist |
| [ATTRIBUTION.md](./ATTRIBUTION.md) | Upstream credits & licenses |

## License / attribution

Base application tree vendored from LiteRT.js-Mocap. MediaPipe / LiteRT assets and three.js example characters remain under their upstream licenses (see [ATTRIBUTION.md](./ATTRIBUTION.md)).
