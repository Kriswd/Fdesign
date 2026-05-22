import test from 'node:test';
import assert from 'node:assert/strict';

import { computeAlphaBBox, computeComposeGeometry } from './composeCutout.js';

test('computeAlphaBBox finds bbox of non-transparent pixels', () => {
  const width = 6;
  const height = 5;
  const data = new Uint8Array(width * height * 4);
  const setA = (x, y, a) => {
    const i = (y * width + x) * 4;
    data[i + 3] = a;
  };
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 2; x <= 3; x += 1) {
      setA(x, y, 255);
    }
  }

  const bbox = computeAlphaBBox({ data, width, height, alphaThreshold: 1 });
  assert.deepEqual(bbox, {
    left: 2,
    top: 1,
    right: 4,
    bottom: 4,
    width: 2,
    height: 3,
    cx: 3,
    cy: 2.5,
  });
});

test('computeComposeGeometry aligns bbox span to guides and centers vertically', () => {
  const bbox = { left: 10, top: 20, right: 50, bottom: 60, width: 40, height: 40, cx: 30, cy: 40 };
  const g = computeComposeGeometry({
    bbox,
    canvasWidth: 200,
    canvasHeight: 100,
    guideLeftX: 30,
    guideRightX: 110,
  });
  assert.equal(g.outWidth, 80);
  assert.equal(g.outHeight, 80);
  assert.equal(g.left, 30);
  assert.equal(g.top, 10);
  assert.equal(Math.round(g.scale * 1000) / 1000, 2);
});

test('computeComposeGeometry rejects invalid guides', () => {
  const bbox = { left: 0, top: 0, right: 2, bottom: 2, width: 2, height: 2, cx: 1, cy: 1 };
  assert.throws(
    () =>
      computeComposeGeometry({
        bbox,
        canvasWidth: 10,
        canvasHeight: 10,
        guideLeftX: 9,
        guideRightX: 3,
      }),
    /无效参考线区间/,
  );
});

