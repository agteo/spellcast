import test from 'node:test';
import assert from 'node:assert/strict';

import { GestureEngine } from '../src/gestures/index.js';

test('an active gesture rearms while a recognizer remains in its exit band', () => {
  let entering = true;
  const recognizer = {
    update: () => ({
      gesture: 'testGesture',
      hand: 'Left',
      confidence: entering ? 1 : 0.4,
      _enter: entering,
      _cooldown: 0,
    }),
  };
  const engine = new GestureEngine({
    enterFrames: 1,
    exitFrames: 2,
    recognizers: [recognizer],
  });

  assert.equal(engine.update([], [], 1 / 60).length, 1);

  entering = false;
  assert.equal(engine.update([], [], 1 / 60).length, 0);
  assert.equal(engine.update([], [], 1 / 60).length, 0);
  assert.equal(engine.state.get('testGesture:Left').active, false);

  entering = true;
  assert.equal(engine.update([], [], 1 / 60).length, 1);
});

test('exit-band frames can deactivate a gesture during cooldown', () => {
  let entering = true;
  const recognizer = {
    update: () => ({
      gesture: 'coolingGesture',
      hand: 'Right',
      confidence: entering ? 1 : 0.4,
      _enter: entering,
      _cooldown: 10,
    }),
  };
  const engine = new GestureEngine({
    enterFrames: 1,
    exitFrames: 2,
    recognizers: [recognizer],
  });

  assert.equal(engine.update([], [], 1 / 60).length, 1);
  entering = false;
  engine.update([], [], 1 / 60);
  engine.update([], [], 1 / 60);

  assert.equal(engine.state.get('coolingGesture:Right').active, false);
});
