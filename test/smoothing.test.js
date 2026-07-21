import test from 'node:test';
import assert from 'node:assert/strict';

import { LandmarkSmoother } from '../src/pose/smoothing.js';

test('reset forgets stale coordinates and smoothing preserves landmark metadata', () => {
  const smoother = new LandmarkSmoother(1, { minCutoff: 0.1 });
  const first = smoother.apply([
    { x: 0, y: 0, z: 0, visibility: 1, source: 'fresh' },
  ], 1 / 60);
  assert.equal(first[0].source, 'fresh');

  smoother.apply([{ x: 1, y: 1, z: 1, visibility: 1 }], 1 / 60);
  smoother.reset();
  const reacquired = smoother.apply([
    { x: 10, y: 20, z: 30, visibility: 0.9 },
  ], 1 / 60);

  assert.deepEqual(reacquired[0], {
    x: 10,
    y: 20,
    z: 30,
    visibility: 0.9,
  });
});
