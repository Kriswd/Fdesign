import test from 'node:test';
import assert from 'node:assert/strict';

import { computePanToCenter } from '../src/utils/panTransform.js';

test('computePanToCenter 保持缩放不变并把目标中心平移到视口中心', () => {
  const res = computePanToCenter({
    viewportWidth: 1000,
    viewportHeight: 800,
    scale: 2,
    targetCenterX: 300,
    targetCenterY: 100,
  });

  assert.equal(res.scale, 2);
  assert.equal(res.positionX, 1000 / 2 - 300 * 2);
  assert.equal(res.positionY, 800 / 2 - 100 * 2);
});

