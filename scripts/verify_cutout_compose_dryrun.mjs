import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { computeAlphaBBox, composeCutoutToCanvasPng } from '../server/services/composeCutout.js';

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

const root = path.resolve('output', '_tmp_compose_verify');
fs.mkdirSync(root, { recursive: true });

const cutoutPath = path.join(root, 'cutout.png');
const outPath = path.join(root, 'composed.png');

const srcW = 50;
const srcH = 40;
const raw = new Uint8Array(srcW * srcH * 4);
for (let y = 5; y <= 24; y += 1) {
  for (let x = 10; x <= 29; x += 1) {
    const i = (y * srcW + x) * 4;
    raw[i + 0] = 255;
    raw[i + 1] = 0;
    raw[i + 2] = 0;
    raw[i + 3] = 255;
  }
}

await sharp(Buffer.from(raw), { raw: { width: srcW, height: srcH, channels: 4 } }).png().toFile(cutoutPath);

await composeCutoutToCanvasPng({
  cutoutPngPath: cutoutPath,
  canvasWidth: 200,
  canvasHeight: 100,
  guideLeftX: 30,
  guideRightX: 110,
  outputPngPath: outPath,
});

const meta = await sharp(outPath).metadata();
must(meta.width === 200 && meta.height === 100, '输出尺寸不正确');
must(meta.hasAlpha === true, '输出应包含透明通道');

const { data, info } = await sharp(outPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const bbox = computeAlphaBBox({ data, width: info.width, height: info.height, alphaThreshold: 1 });
must(bbox != null, '输出中未检测到 alpha 内容');
must(bbox.left === 30, `left 应为 30，实际 ${bbox.left}`);
must(bbox.right === 110, `right 应为 110，实际 ${bbox.right}`);
must(bbox.top === 10, `top 应为 10，实际 ${bbox.top}`);
must(bbox.bottom === 90, `bottom 应为 90，实际 ${bbox.bottom}`);

console.log('PASS', JSON.stringify({ outPath, bbox }, null, 2));

