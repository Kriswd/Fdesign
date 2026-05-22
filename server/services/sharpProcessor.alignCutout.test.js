import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import SharpImageProcessor from './sharpProcessor.js';

test('alignCutoutAlphaImage keeps alpha and aligns into guide span', async () => {
  const p = new SharpImageProcessor();

  const srcW = 240;
  const srcH = 120;
  const rectW = 120;
  const rectH = 60;

  const solid = await sharp({
    create: {
      width: 160,
      height: 70,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const cutout = await sharp({
    create: {
      width: srcW,
      height: srcH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: solid, left: 40, top: 25 }])
    .png()
    .toBuffer();

  const referenceRect = { left: 0, top: 0, width: rectW, height: rectH };
  const manualGuides = { leftX: 30, rightX: 90 };

  const out = await p.alignCutoutAlphaImage({
    imageBuffer: cutout,
    targetWidth: rectW,
    targetHeight: rectH,
    referenceRect,
    manualGuides,
    alphaThreshold: 10,
  });

  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.width, rectW);
  assert.equal(meta.height, rectH);
  assert.equal(meta.hasAlpha, true);

  const bounds = await p.getNonTransparentBounds(out.buffer, { alphaThreshold: 10 });
  assert.ok(bounds);
  assert.ok(bounds.left >= 29 && bounds.left <= 31);
  assert.ok(bounds.right <= 91);
  assert.ok(bounds.width <= 60);
});

