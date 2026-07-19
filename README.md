# Spellcast

Gesture-unlocked visual effects on browser motion capture.

Spellcast builds on [LiteRT.js-Mocap](https://github.com/andrisgauracs/LiteRT.js-Mocap): BlazePose body tracking plus (planned) a second LiteRT hand-landmark model, rule-based gesture recognition, and Three.js effects. Move your body and hands to unlock effects — a Korean finger heart, a Doctor Strange–style sparking ring, and more.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

Use Chrome (or another WebGPU browser) for the fast path. The app detects missing WebGPU and falls back to CPU (Wasm) with a toast.

## Status

**Phase 0 — Bootstrap:** base LiteRT.js-Mocap tree vendored; WebGPU ↔ CPU switch present in the app.

See [SPEC.md](./SPEC.md) for the product contract and [PROGRESS.md](./PROGRESS.md) for the phased build tracker.

## Planned features

- **Hand tracking** — MediaPipe Hand Landmark via LiteRT.js (ROI from pose wrists)
- **Gestures** — finger heart, Strange circle, dab, arms raised “V”, finger gun
- **Effects** — particles, shader ring, emoji sprites, bloom
- **Ghost replay** — semi-transparent playback of a saved take beside live performance
- **Custom characters** — drag-and-drop Mixamo-style `.glb`
- **Share** — local WebM clip + PNG share card (no backend)

## Docs

| Doc | Purpose |
|-----|---------|
| [SPEC.md](./SPEC.md) | What we’re building |
| [PROGRESS.md](./PROGRESS.md) | Live phase checklist |
| [ATTRIBUTION.md](./ATTRIBUTION.md) | Upstream credits & licenses |

## License / attribution

Base application tree vendored from LiteRT.js-Mocap. MediaPipe / LiteRT assets and three.js example characters remain under their upstream licenses (see [ATTRIBUTION.md](./ATTRIBUTION.md)).
