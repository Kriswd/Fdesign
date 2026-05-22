import test from 'node:test';
import assert from 'node:assert/strict';

import { computeInitialTransform } from '../src/utils/canvasViewport.js';

test('computeInitialTransform: viewport 未就绪时也应尊重 maxInitialScale', () => {
  const tr = computeInitialTransform({
    viewportWidth: 0,
    viewportHeight: 0,
    contentWidth: 1000,
    contentHeight: 1000,
    maxInitialScale: 0.45,
  });
  assert.ok(tr);
  assert.ok(Number.isFinite(tr.scale));
  assert.ok(tr.scale <= 0.45);
});

test('computeInitialTransform: viewport 就绪时 scale 不得超过 maxInitialScale', () => {
  const tr = computeInitialTransform({
    viewportWidth: 800,
    viewportHeight: 600,
    contentWidth: 2000,
    contentHeight: 2000,
    padding: 0,
    topOffset: 0,
    maxInitialScale: 0.45,
  });
  assert.ok(tr);
  assert.ok(Number.isFinite(tr.scale));
  assert.ok(tr.scale <= 0.45);
});
