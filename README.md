# Spellcast

Gesture-unlocked visual effects on browser motion capture.

Spellcast builds on [LiteRT.js-Mocap](https://github.com/andrisgauracs/LiteRT.js-Mocap): BlazePose body tracking plus a second LiteRT hand-landmark model, rule-based gesture recognition, and Three.js effects. Move your body and hands to unlock effects — a Korean finger heart, a Doctor Strange–style sparking ring, and more.

## Status

Early scaffolding. See [SPEC.md](./SPEC.md) for the product contract and [PROGRESS.md](./PROGRESS.md) for the phased build tracker.

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

## License / attribution

Application code will follow the base project’s license once the LiteRT.js-Mocap tree is vendored. MediaPipe / LiteRT assets remain under their upstream licenses (typically Apache-2.0).
