// ---------------------------------------------------------------------------
// App orchestration:
//   webcam → PoseDetector (LiteRT.js) → HandDetector → landmark smoothing →
//   Retargeter → Three.js character, with overlay / HUD / recorder alongside.
//
// Two loops run concurrently:
//   - INFERENCE loop: as fast as the model allows (awaits each result, so
//     nothing queues up if inference is slower than the display).
//   - RENDER loop: every display frame. Reads the latest landmarks, steps the
//     retargeter (whose slerp smoothing interpolates between inference
//     results), draws the overlay, HUD and 3D scene.
// ---------------------------------------------------------------------------

import { PoseDetector } from './pose/detector.js';
import { LandmarkSmoother } from './pose/smoothing.js';
import { mirrorLandmarks, extendLandmarks, NUM_LANDMARKS, LM, synthesizeMidJoint } from './pose/landmarks.js';
import { HandDetector } from './hands/detector.js';
import { NUM_HAND_LANDMARKS } from './hands/landmarks.js';
import { GestureEngine } from './gestures/index.js';
import { UnlockTracker } from './gestures/unlocks.js';
import { GESTURE_BINDINGS } from './gestures/bindings.js';
import { EffectsEngine } from './effects/engine.js';
import { SpellAnimator } from './effects/spellAnim.js';
import { Retargeter } from './retarget/retarget.js';
import { CHARACTERS, DEFAULT_CHARACTER } from './retarget/characters.js';
import { tryBuildMixamoConfig } from './retarget/mixamoMap.js';
import { Stage } from './scene.js';
import { startWebcam, WebcamError } from './camera.js';
import { Overlay } from './overlay.js';
import { Hud } from './hud.js';
import { SessionRecorder } from './exporter.js';
import { GhostPlayer } from './replay/ghost.js';
import { ClipRecorder, clipFilename, downloadBlob } from './share/recorder.js';
import { downloadShareCard } from './share/card.js';
import { setStatus, hideStatus, showError, toast } from './ui.js';

const els = {
  video: document.getElementById('video'),
  overlay: document.getElementById('overlay'),
  sceneWrap: document.getElementById('scene-wrap'),
  backendSelect: document.getElementById('backend-select'),
  characterSelect: document.getElementById('character-select'),
  mirrorToggle: document.getElementById('mirror-toggle'),
  framingSelect: document.getElementById('framing-select'),
  recordBtn: document.getElementById('record-btn'),
  saveTakeBtn: document.getElementById('save-take-btn'),
  ghostToggle: document.getElementById('ghost-toggle'),
  exportJsonBtn: document.getElementById('export-json-btn'),
  exportBvhBtn: document.getElementById('export-bvh-btn'),
  clipBtn: document.getElementById('clip-btn'),
  shareCardBtn: document.getElementById('share-card-btn'),
  glbInput: document.getElementById('glb-input'),
  dropOverlay: document.getElementById('drop-overlay'),
  recBadge: document.getElementById('rec-badge'),
  recFrames: document.getElementById('rec-frames'),
};

const state = {
  detector: null,
  hands: null,
  gestures: null,
  effects: null,
  stage: null,
  retargeter: null,
  spellAnim: null,
  ghostPlayer: null,
  savedTake: null,
  customObjectUrls: [],
  characterKey: DEFAULT_CHARACTER,
  mirror: true,
  framing: 'chest',      // 'chest' (shoulders only) | 'full' (hips required)
  latest: null,          // { screen, worldExtended, hands, score, receivedAt }
  inferCycleMs: 0,       // EMA of time between pose publications (staleness window)
  lastRenderTime: 0,
  busy: false,           // guards backend/character switches
};

const hud = new Hud();
const recorder = new SessionRecorder();
const unlockTracker = new UnlockTracker(document.getElementById('unlock-grid'));
let clipRecorder = null;
// Debug handle (also handy on camera: poke the pipeline from DevTools).
window.__mocap = state;
window.__mocap.recorder = recorder;
// Separate smoothers for the 2D overlay points and the 3D world points.
// World: heavy on hips/spine (stable torso), snappy on wrists/elbows/face
// (responsive limbs + head). Stillness deadzones kill residual BlazePose
// twitch when the person holds still.
const FACE_SNAPS = {
  [LM.NOSE]: { minCutoff: 0.8, deadzone: 0.012 },
  [LM.LEFT_EYE]: { minCutoff: 0.8, deadzone: 0.012 },
  [LM.RIGHT_EYE]: { minCutoff: 0.8, deadzone: 0.012 },
  [LM.LEFT_EAR]: { minCutoff: 0.8, deadzone: 0.012 },
  [LM.RIGHT_EAR]: { minCutoff: 0.8, deadzone: 0.012 },
};
const LIMB_SNAPS = {
  [LM.LEFT_ELBOW]: { minCutoff: 0.9, beta: 0.08, deadzone: 0.012 },
  [LM.RIGHT_ELBOW]: { minCutoff: 0.9, beta: 0.08, deadzone: 0.012 },
  [LM.LEFT_WRIST]: { minCutoff: 1.2, beta: 0.1, deadzone: 0.01 },
  [LM.RIGHT_WRIST]: { minCutoff: 1.2, beta: 0.1, deadzone: 0.01 },
  [LM.LEFT_INDEX]: { minCutoff: 1.2, beta: 0.1, deadzone: 0.01 },
  [LM.RIGHT_INDEX]: { minCutoff: 1.2, beta: 0.1, deadzone: 0.01 },
  [LM.LEFT_KNEE]: { minCutoff: 0.7, beta: 0.06, deadzone: 0.015 },
  [LM.RIGHT_KNEE]: { minCutoff: 0.7, beta: 0.06, deadzone: 0.015 },
  [LM.LEFT_ANKLE]: { minCutoff: 0.9, beta: 0.08, deadzone: 0.012 },
  [LM.RIGHT_ANKLE]: { minCutoff: 0.9, beta: 0.08, deadzone: 0.012 },
};
const TORSO_HEAVY = {
  [LM.LEFT_HIP]: { minCutoff: 0.2, beta: 0.03, deadzone: 0.03 },
  [LM.RIGHT_HIP]: { minCutoff: 0.2, beta: 0.03, deadzone: 0.03 },
  [LM.LEFT_SHOULDER]: { minCutoff: 0.35, beta: 0.04, deadzone: 0.02 },
  [LM.RIGHT_SHOULDER]: { minCutoff: 0.35, beta: 0.04, deadzone: 0.02 },
};
const worldByIndex = { ...FACE_SNAPS, ...LIMB_SNAPS, ...TORSO_HEAVY };
const screenSmoother = new LandmarkSmoother(NUM_LANDMARKS, {
  minCutoff: 1.2, beta: 0.05, deadzone: 0.025, byIndex: worldByIndex,
});
const worldSmoother = new LandmarkSmoother(NUM_LANDMARKS, {
  minCutoff: 0.35, beta: 0.04, deadzone: 0.02, byIndex: worldByIndex,
});
const leftHandSmoother = new LandmarkSmoother(NUM_HAND_LANDMARKS, { minCutoff: 1.5, beta: 0.08, deadzone: 0.02 });
const rightHandSmoother = new LandmarkSmoother(NUM_HAND_LANDMARKS, { minCutoff: 1.5, beta: 0.08, deadzone: 0.02 });

boot().catch((err) => {
  console.error(err);
  showError('Something went wrong', err.message || String(err));
});

async function boot() {
  applyMirrorClass();

  // 1. Webcam first — the permission prompt should be the first thing seen.
  setStatus('Requesting camera…', 'Allow camera access to start tracking.');
  try {
    await startWebcam(els.video);
  } catch (err) {
    if (err instanceof WebcamError) {
      showError('Camera unavailable', err.message);
      return;
    }
    throw err;
  }

  // 2. Boot the LiteRT runtime + pick the best available backend.
  setStatus('Loading LiteRT.js runtime…', 'Initializing Wasm modules');
  state.detector = new PoseDetector();
  state.hands = new HandDetector();
  await state.detector.init();

  let backend = 'webgpu';
  if (!PoseDetector.webGpuAvailable()) {
    backend = 'wasm';
    els.backendSelect.querySelector('option[value="webgpu"]').disabled = true;
    toast('WebGPU is not available in this browser — running on CPU (XNNPACK/Wasm).', 6000);
  }

  // 3. Compile pose + hand models and load the character in parallel.
  state.stage = new Stage(els.sceneWrap);
  state.gestures = new GestureEngine();
  state.effects = new EffectsEngine(state.stage);
  state.effects.setMirror(state.mirror);
  const compilePromise = compileBackend(backend, true);
  const characterPromise = loadCharacter(state.characterKey);
  await Promise.all([compilePromise, characterPromise]);

  // 4. Wire up the controls and start both loops.
  clipRecorder = new ClipRecorder({
    video: els.video,
    overlay: els.overlay,
    getStageCanvas: () => state.stage.renderer.domElement,
  });
  setupControls();
  hideStatus();
  startInferenceLoop();
  startRenderLoop();
}

// --------------------------------------------------------------------------
// Model / character loading
// --------------------------------------------------------------------------

async function compileBackend(backend, firstLoad = false) {
  try {
    await state.detector.compile(backend, (f, msg) => {
      if (firstLoad) setStatus('Preparing pose model…', msg, f * 0.55);
    });
    await state.hands.compile(backend, (f, msg) => {
      if (firstLoad) setStatus('Preparing hand model…', msg, 0.55 + f * 0.45);
    });
  } catch (err) {
    console.error(`Compile for ${backend} failed:`, err);
    if (backend === 'webgpu') {
      toast('WebGPU compile failed — falling back to CPU (Wasm).', 6000);
      els.backendSelect.querySelector('option[value="webgpu"]').disabled = true;
      return compileBackend('wasm', firstLoad);
    }
    throw new Error(`Could not compile models: ${err.message}`);
  }
  els.backendSelect.value = state.detector.backend;
  hud.setBackend(state.detector.backend === 'webgpu' ? 'WebGPU' : 'CPU·Wasm');
}

async function loadCharacter(key) {
  const config = CHARACTERS[key];
  state.spellAnim?.dispose();
  const root = await state.stage.loadCharacter(config);
  state.retargeter = new Retargeter(root, config, { framing: state.framing });
  state.spellAnim = new SpellAnimator(
    root,
    state.stage.characterAnimations,
    config.anims || {},
  );
  state.characterKey = key;
}

// --------------------------------------------------------------------------
// Loops
// --------------------------------------------------------------------------

function startInferenceLoop() {
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  (async () => {
    let lastT = performance.now();
    let lastPublish = 0;
    while (true) {
      await nextFrame();
      if (state.busy || !state.detector.model) continue;
      try {
        const result = await state.detector.detect(els.video);
        const now = performance.now();
        const dt = Math.min((now - lastT) / 1000, 0.25);
        lastT = now;
        hud.tickInference(state.detector.lastInferMs);

        if (!result) {
          hud.tickHandsInference(0);
          const lostMs = Math.max(600, state.inferCycleMs * 2);
          if (state.latest && now - state.latest.receivedAt > lostMs) state.latest = null;
          continue;
        }

        // Smooth in the raw (unmirrored) space so the filters see a
        // continuous signal even when the mirror toggle flips.
        let screen = screenSmoother.apply(result.screen, dt);
        let world = worldSmoother.apply(result.world, dt);

        // A landmark whose screen position falls outside the camera frame is
        // an extrapolated guess — and BlazePose sometimes still scores it
        // visible, which let phantom shoulders/hips/elbows steer the rig and
        // gestures. Cap its visibility so every consumer (retargeter,
        // gesture rules, hand ROI) treats it as unreliable. Must happen
        // BEFORE mirroring: screen and world share indices only in raw space.
        const m = 0.04;
        const offscreen = screen.map(
          (p) => p.x < -m || p.x > 1 + m || p.y < -m || p.y > 1 + m,
        );
        const capVis = (p, i) =>
          offscreen[i] ? { ...p, visibility: Math.min(p.visibility, 0.2) } : p;
        screen = screen.map(capVis);
        world = world.map(capVis);

        // Chest-up framing: the camera never sees hips/legs, and resting-arm
        // phantoms are painted along the BOTTOM edge of the crop. Real arms
        // held in front of the chest (toward the camera) sit mid-frame — even
        // when below the shoulders — and must not be killed.
        if (state.framing === 'chest') {
          const LOWER = [
            LM.LEFT_HIP, LM.RIGHT_HIP,
            LM.LEFT_KNEE, LM.RIGHT_KNEE,
            LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
            LM.LEFT_HEEL, LM.RIGHT_HEEL,
            LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX,
          ];
          const kill = (arr, i) => {
            arr[i] = { ...arr[i], visibility: Math.min(arr[i].visibility, 0.2) };
          };
          for (const i of LOWER) {
            kill(screen, i);
            kill(world, i);
          }
          // Only discard arms glued to the bottom of the frame. A wrist that
          // is clearly closer to the camera than its shoulder is a real
          // forward reach (foreshortened) — never treat that as a phantom.
          const PHANTOM_ARM_Y = 0.78;
          const ARM_CHAINS = [
            {
              wrist: LM.LEFT_WRIST,
              shoulder: LM.LEFT_SHOULDER,
              joints: [LM.LEFT_WRIST, LM.LEFT_ELBOW, LM.LEFT_PINKY, LM.LEFT_INDEX, LM.LEFT_THUMB],
            },
            {
              wrist: LM.RIGHT_WRIST,
              shoulder: LM.RIGHT_SHOULDER,
              joints: [LM.RIGHT_WRIST, LM.RIGHT_ELBOW, LM.RIGHT_PINKY, LM.RIGHT_INDEX, LM.RIGHT_THUMB],
            },
          ];
          for (const chain of ARM_CHAINS) {
            const w = screen[chain.wrist];
            if (w.y <= PHANTOM_ARM_Y) continue;
            // MediaPipe world z: more negative ≈ closer to the camera.
            const closerToCamera =
              world[chain.wrist].z - world[chain.shoulder].z < -0.06;
            if (closerToCamera) continue;
            for (const i of chain.joints) {
              kill(screen, i);
              kill(world, i);
            }
          }
        }

        // When a mid-joint (elbow / knee) was capped but both endpoints are
        // real, replace it with a point on the proximal→distal segment. That
        // keeps raised-hand / seated-leg tracking alive without trusting the
        // model's wandering phantom mid-joint XYZ.
        for (const arr of [screen, world]) {
          synthesizeMidJoint(arr, LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST);
          synthesizeMidJoint(arr, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
          if (state.framing !== 'chest') {
            synthesizeMidJoint(arr, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE);
            synthesizeMidJoint(arr, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE);
          }
        }

        if (state.mirror) world = mirrorLandmarks(world, 0);

        // Publish the pose IMMEDIATELY — the retargeter must not wait for
        // hand inference (on CPU that wait backdated the freshness clock and
        // the avatar kept relaxing toward rest between updates). Hands are
        // merged into this frame below, once their inference finishes.
        const frame = {
          screen,
          worldExtended: extendLandmarks(world),
          hands: state.latest?.hands ?? [],
          score: result.score,
          receivedAt: now,
        };
        state.latest = frame;
        // Publication cadence → the render loop's adaptive staleness window.
        if (lastPublish) {
          const cycle = now - lastPublish;
          state.inferCycleMs = state.inferCycleMs
            ? state.inferCycleMs * 0.8 + cycle * 0.2
            : cycle;
        }
        lastPublish = now;

        // Hands: ROI from pose wrists at full video resolution.
        let hands = [];
        if (state.hands?.model) {
          const handResult = await state.hands.detect(els.video, screen);
          hud.tickHandsInference(handResult.inferMs);
          hands = handResult.hands.map((h) => {
            const smoother = h.side === 'Left' ? leftHandSmoother : rightHandSmoother;
            return {
              ...h,
              landmarks: smoother.apply(h.landmarks, dt),
            };
          });
          if (state.latest === frame) frame.hands = hands;
        }

        // Gesture → effects + optional special-move clip (bindings table).
        if (state.gestures && state.effects) {
          const events = state.gestures.update(screen, hands, dt);
          for (const ev of events) {
            state.effects.spawn(ev);
            const binding = GESTURE_BINDINGS[ev.gesture];
            if (binding?.anim) state.spellAnim?.play(ev.gesture);
            const firstUnlock = unlockTracker.unlock(ev.gesture);
            const messages = {
              fingerHeart: '♥ Finger heart!',
              strangeCircle: '✧ Strange circle!',
              dab: '✦ Dab!',
              armsV: '☀ Arms V!',
              fingerGun: '⌁ Finger gun!',
            };
            const message = messages[ev.gesture];
            if (message) toast(firstUnlock ? `${message} Unlocked` : message, 1600);
          }
        }
      } catch (err) {
        console.error('Inference error:', err);
        toast(`Inference error: ${err.message}`, 5000);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();
}

// ---------------------------------------------------------------------------
// Framing hint — coach the user toward a framing the tracker can work with.
// Uses screen-landmark visibilities, which the inference loop caps for
// offscreen points, so "not visible" reliably means "not usable".
// ---------------------------------------------------------------------------

const HINT_VIS = 0.55;          // same bar the retargeter/gestures use
const HINT_SHOW_MS = 1500;      // condition must hold this long before showing
const HINT_CLEAR_MS = 500;      // and be resolved this long before hiding
let hintCandidate = null;
let hintSince = 0;

function computeFramingHint() {
  const lms = state.latest?.screen;
  if (!lms) return null;
  const seen = (i) => lms[i].visibility >= HINT_VIS;

  const face = seen(LM.NOSE) || (seen(LM.LEFT_EYE) && seen(LM.RIGHT_EYE));
  if (!face) return null; // nobody (or no face) in frame — nothing to coach

  const shoulders = seen(LM.LEFT_SHOULDER) && seen(LM.RIGHT_SHOULDER);
  if (!shoulders) return 'Step back — shoulders out of frame, body tracking off';

  const hips = seen(LM.LEFT_HIP) && seen(LM.RIGHT_HIP);
  if (state.framing === 'full' && !hips) {
    return 'Full-torso framing needs hips in frame — step back or switch to Chest-up';
  }

  const anyWrist = seen(LM.LEFT_WRIST) || seen(LM.RIGHT_WRIST);
  if (!anyWrist) return 'Hands out of frame — keep wrists visible for hand gestures';

  return null;
}

function updateFramingHint(now, fresh) {
  const next = fresh ? computeFramingHint() : null;
  if (next !== hintCandidate) {
    hintCandidate = next;
    hintSince = now;
  }
  // Debounce both ways so a landmark flickering at the frame edge (or a hand
  // dropping for a beat mid-gesture) doesn't strobe the hint.
  const held = now - hintSince;
  if (hintCandidate === null) {
    if (held > HINT_CLEAR_MS) hud.setHint(null);
  } else if (held > HINT_SHOW_MS) {
    hud.setHint(hintCandidate);
  }
}

function startRenderLoop() {
  const overlay = new Overlay(els.overlay, els.video);
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - (state.lastRenderTime || now)) / 1000, 0.1) || 1 / 60;
    state.lastRenderTime = now;
    hud.tickFrame(dt);

    // "Fresh" scales with the measured inference cadence: on WebGPU this is
    // the old 500 ms, but a slow CPU backend gets up to 2 s before the avatar
    // is treated as tracking-lost and relaxed — it lags there, but it no
    // longer sags to rest between every pair of results.
    const staleMs = Math.min(2000, Math.max(500, state.inferCycleMs * 3));
    const fresh = state.latest && now - state.latest.receivedAt < staleMs;
    if (state.retargeter) {
      // Special-move clips temporarily own the rig — skip retarget while busy.
      if (state.spellAnim?.blocking) {
        /* clip driving bones */
      } else if (fresh) {
        state.retargeter.update(state.latest.worldExtended, dt);
      } else {
        state.retargeter.relax(dt); // tracking lost → ease back to rest pose
      }
      hud.setTracking(fresh ? state.retargeter.trackingMode : '–');
    }

    // Pose + hands stay in camera space; CSS .mirrored flips the overlay with the video.
    overlay.draw(
      fresh ? state.latest.screen : null,
      fresh ? state.latest.hands : null,
    );

    updateFramingHint(now, fresh);

    if (recorder.recording && fresh) {
      recorder.capture(state.latest.worldExtended, state.latest.score);
      els.recFrames.textContent = recorder.frameCount;
    }

    state.ghostPlayer?.update(dt);
    state.spellAnim?.update(dt);

    if (state.effects) {
      state.effects.setFrame(fresh ? state.latest : null);
      state.effects.update(dt);
      state.effects.render();
    } else {
      state.stage.render();
    }
    hud.draw(now);
  };
  requestAnimationFrame(loop);
}

// --------------------------------------------------------------------------
// Controls
// --------------------------------------------------------------------------

function setupControls() {
  // Backend switcher — the live WebGPU vs CPU comparison.
  els.backendSelect.disabled = false;
  els.backendSelect.value = state.detector.backend;
  els.backendSelect.addEventListener('change', async () => {
    const target = els.backendSelect.value;
    if (target === state.detector.backend || state.busy) return;
    state.busy = true;
    els.backendSelect.disabled = true;
    toast(`Compiling models for ${target === 'webgpu' ? 'WebGPU' : 'CPU (Wasm)'}…`, 10000);
    try {
      await compileBackend(target);
      toast(`Running on ${target === 'webgpu' ? 'WebGPU' : 'CPU (XNNPACK/Wasm)'}`);
    } finally {
      state.busy = false;
      els.backendSelect.disabled = false;
    }
  });

  // Character switcher — proves the retargeting layer is rig-agnostic.
  for (const [key, cfg] of Object.entries(CHARACTERS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = cfg.label;
    els.characterSelect.appendChild(opt);
  }
  els.characterSelect.value = state.characterKey;
  els.characterSelect.disabled = false;
  els.characterSelect.addEventListener('change', async () => {
    const key = els.characterSelect.value;
    if (key === state.characterKey || state.busy) return;
    state.busy = true;
    els.characterSelect.disabled = true;
    if (recorder.recording) stopRecording();
    try {
      await loadCharacter(key);
      // Ghost stays on the take's original character; rebuild if still enabled.
      if (els.ghostToggle.checked && state.savedTake) {
        await enableGhost();
      }
    } catch (err) {
      console.error(err);
      toast(`Could not load character: ${err.message}`, 5000);
      els.characterSelect.value = state.characterKey;
    } finally {
      state.busy = false;
      els.characterSelect.disabled = false;
    }
  });

  els.framingSelect.value = state.framing;
  els.framingSelect.addEventListener('change', () => {
    state.framing = els.framingSelect.value;
    state.retargeter?.setFraming(state.framing);
    toast(
      state.framing === 'chest'
        ? 'Chest-up framing: torso follows your shoulders — no hips needed.'
        : 'Full-torso framing: keep shoulders-to-hips in frame.',
      3500,
    );
  });

  els.mirrorToggle.addEventListener('change', () => {
    state.mirror = els.mirrorToggle.checked;
    applyMirrorClass();
    state.effects?.setMirror(state.mirror);
    // Mirrored landmarks flip sides — position-driven bones must recalibrate.
    state.retargeter?.resetCalibration();
  });

  els.recordBtn.disabled = false;
  els.recordBtn.addEventListener('click', () => {
    if (recorder.recording) stopRecording();
    else startRecording();
  });
  els.saveTakeBtn.addEventListener('click', () => saveTake());
  els.ghostToggle.addEventListener('change', async () => {
    if (els.ghostToggle.checked) {
      try {
        await enableGhost();
      } catch (err) {
        console.error(err);
        els.ghostToggle.checked = false;
        toast(`Ghost failed: ${err.message}`, 5000);
      }
    } else {
      disableGhost();
    }
  });
  els.exportJsonBtn.addEventListener('click', () => recorder.exportJSON());
  els.exportBvhBtn.addEventListener('click', () => recorder.exportBVH());

  els.clipBtn.disabled = false;
  els.shareCardBtn.disabled = false;
  els.clipBtn.addEventListener('click', async () => {
    if (clipRecorder.recording) await stopClip();
    else startClip();
  });
  els.shareCardBtn.addEventListener('click', async () => {
    try {
      await downloadShareCard(unlockTracker.snapshot());
      toast('Share card PNG downloaded.', 2500);
    } catch (err) {
      console.error(err);
      toast(`Share card failed: ${err.message}`, 4000);
    }
  });

  els.glbInput?.addEventListener('change', async () => {
    const file = els.glbInput.files?.[0];
    if (file) await importCustomGlb(file);
    els.glbInput.value = '';
  });
  setupGlbDropTarget();
}

function setupGlbDropTarget() {
  const overlay = els.dropOverlay;
  let depth = 0;
  const show = () => {
    depth += 1;
    overlay?.classList.remove('hidden');
  };
  const hide = () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay?.classList.add('hidden');
  };

  window.addEventListener('dragenter', (e) => {
    if (!hasGlb(e)) return;
    e.preventDefault();
    show();
  });
  window.addEventListener('dragover', (e) => {
    if (!hasGlb(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasGlb(e) && depth === 0) return;
    e.preventDefault();
    hide();
  });
  window.addEventListener('drop', async (e) => {
    depth = 0;
    overlay?.classList.add('hidden');
    const file = [...(e.dataTransfer?.files || [])].find((f) =>
      f.name.toLowerCase().endsWith('.glb')
    );
    if (!file) return;
    e.preventDefault();
    await importCustomGlb(file);
  });
}

function hasGlb(e) {
  const items = e.dataTransfer?.items;
  if (!items?.length) return true; // be permissive on enter
  return [...items].some((it) =>
    it.kind === 'file' && (it.type.includes('gltf') || true)
  );
}

async function importCustomGlb(file) {
  if (state.busy) return;
  if (!file.name.toLowerCase().endsWith('.glb')) {
    toast('Please drop a .glb file (Mixamo-style rig).', 4000);
    return;
  }

  state.busy = true;
  const objectUrl = URL.createObjectURL(file);
  state.customObjectUrls.push(objectUrl);

  try {
    toast(`Inspecting ${file.name}…`, 2500);
    const sceneRoot = await state.stage.loadGlbScene(objectUrl);
    const label = file.name.replace(/\.glb$/i, '') || 'Custom character';
    const result = tryBuildMixamoConfig(sceneRoot, { label, url: objectUrl });

    if (!result.ok) {
      toast(
        `Bone names don't match Mixamo — add a config entry in characters.js. Missing: ${result.missing.join(', ')}`,
        8000,
      );
      return;
    }

    const key = `custom_${Date.now().toString(36)}`;
    CHARACTERS[key] = result.config;
    addCharacterOption(key, result.config.label);
    if (recorder.recording) stopRecording();
    await loadCharacter(key);
    els.characterSelect.value = key;
    toast(`Loaded ${label} (Mixamo map OK)`, 3500);
  } catch (err) {
    console.error(err);
    toast(`Could not load .glb: ${err.message}`, 5000);
  } finally {
    state.busy = false;
  }
}

function addCharacterOption(key, label) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = label;
  els.characterSelect.appendChild(opt);
}

function startClip() {
  try {
    clipRecorder.start();
    els.clipBtn.textContent = '■ Stop clip';
    els.clipBtn.classList.add('clipping');
    toast('Recording shareable clip…', 2000);
  } catch (err) {
    console.error(err);
    toast(`Clip failed: ${err.message}`, 5000);
  }
}

async function stopClip() {
  const blob = await clipRecorder.stop();
  els.clipBtn.textContent = '● Clip';
  els.clipBtn.classList.remove('clipping');
  if (!blob) {
    toast('Clip was empty — try again.', 3000);
    return;
  }
  downloadBlob(blob, clipFilename());
  toast(`Clip saved (${(blob.size / 1e6).toFixed(1)} MB webm)`, 3500);
}

function startRecording() {
  recorder.start(state.stage.character, state.characterKey);
  els.recordBtn.textContent = '■ Stop';
  els.recordBtn.classList.add('recording');
  els.recBadge.classList.remove('hidden');
  els.exportJsonBtn.disabled = true;
  els.exportBvhBtn.disabled = true;
  els.saveTakeBtn.disabled = true;
}

function stopRecording() {
  recorder.stop();
  els.recordBtn.textContent = '● Record';
  els.recordBtn.classList.remove('recording');
  els.recBadge.classList.add('hidden');
  const has = recorder.frameCount > 0;
  els.exportJsonBtn.disabled = !has;
  els.exportBvhBtn.disabled = !has;
  els.saveTakeBtn.disabled = !has;
  if (has) toast(`Recorded ${recorder.frameCount} frames — save a take or export.`);
}

function saveTake() {
  const take = recorder.saveTake();
  if (!take) {
    toast('Nothing to save — record a take first.', 3000);
    return;
  }
  state.savedTake = take;
  els.ghostToggle.disabled = false;
  toast(`Take saved (${take.frameCount} frames) — toggle Ghost to replay.`, 3500);
}

async function enableGhost() {
  if (!state.savedTake) {
    els.ghostToggle.checked = false;
    toast('Save a take before enabling Ghost.', 3000);
    return;
  }
  const key = state.savedTake.character;
  const config = CHARACTERS[key];
  if (!config) throw new Error(`Unknown character for take: ${key}`);

  const root = await state.stage.loadGhost(config);
  state.ghostPlayer = new GhostPlayer(root, state.savedTake);
  state.ghostPlayer.play();
  toast(`Ghost replaying ${state.savedTake.frameCount} frames`, 2500);
}

function disableGhost() {
  state.ghostPlayer?.stop();
  state.ghostPlayer = null;
  state.stage?.removeGhost();
}

function applyMirrorClass() {
  els.video.classList.toggle('mirrored', state.mirror);
  els.overlay.classList.toggle('mirrored', state.mirror);
}
