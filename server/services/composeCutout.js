import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export function computeAlphaBBox({ data, width, height, alphaThreshold = 1 }) {
  const w = Math.floor(Number(width) || 0);
  const h = Math.floor(Number(height) || 0);
  const threshold = Math.max(0, Math.min(255, Math.floor(Number(alphaThreshold) || 0)));
  if (!data || w <= 0 || h <= 0) return null;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const expected = w * h * 4;
  if (bytes.length < expected) return null;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  let idx = 3;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = bytes[idx];
      if (a > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      idx += 4;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const left = minX;
  const top = minY;
  const right = maxX + 1;
  const bottom = maxY + 1;
  const bw = right - left;
  const bh = bottom - top;
  return {
    left,
    top,
    right,
    bottom,
    width: bw,
    height: bh,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  };
}

export function computeComposeGeometry({ bbox, canvasWidth, canvasHeight, guideLeftX, guideRightX }) {
  const cw = Math.floor(Number(canvasWidth) || 0);
  const ch = Math.floor(Number(canvasHeight) || 0);
  const leftX = Math.round(Number(guideLeftX));
  const rightX = Math.round(Number(guideRightX));
  if (!bbox) throw new Error('缺少 alpha bbox');
  if (cw <= 0 || ch <= 0) throw new Error('无效画布尺寸');
  if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) throw new Error('无效参考线区间');
  if (leftX < 0 || rightX > cw) throw new Error('参考线超出画布范围');
  const span = rightX - leftX;
  if (span <= 0) throw new Error('无效参考线跨度');
  if (!Number.isFinite(Number(bbox.width)) || bbox.width <= 0) throw new Error('无效 bbox 宽度');
  if (!Number.isFinite(Number(bbox.height)) || bbox.height <= 0) throw new Error('无效 bbox 高度');

  const scale = span / bbox.width;
  const outW = span;
  const outH = Math.max(1, Math.round(bbox.height * scale));
  const outLeft = leftX;
  const outTop = Math.round(ch / 2 - outH / 2);
  const top = Math.max(0, Math.min(ch - outH, outTop));
  return {
    scale,
    outWidth: outW,
    outHeight: outH,
    left: outLeft,
    top,
  };
}

export async function composeCutoutToCanvasPng({
  cutoutPngPath,
  canvasWidth,
  canvasHeight,
  guideLeftX,
  guideRightX,
  outputPngPath,
  alphaThreshold = 1,
} = {}) {
  const input = String(cutoutPngPath || '').trim();
  const out = String(outputPngPath || '').trim();
  if (!input) throw new Error('缺少 cutoutPngPath');
  if (!out) throw new Error('缺少 outputPngPath');
  if (!fs.existsSync(input)) throw new Error(`cutout PNG 不存在: ${input}`);

  const base = sharp(input).ensureAlpha();
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const bbox = computeAlphaBBox({ data, width: info.width, height: info.height, alphaThreshold });
  if (!bbox) throw new Error('cutout PNG 无有效 alpha 内容');

  const geom = computeComposeGeometry({
    bbox,
    canvasWidth,
    canvasHeight,
    guideLeftX,
    guideRightX,
  });

  const cropped = sharp(input)
    .ensureAlpha()
    .extract({ left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height })
    .resize({ width: geom.outWidth, height: geom.outHeight, fit: 'fill' })
    .png();

  const croppedBuf = await cropped.toBuffer();

  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({
    create: {
      width: Math.floor(Number(canvasWidth) || 0),
      height: Math.floor(Number(canvasHeight) || 0),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: croppedBuf, left: geom.left, top: geom.top }])
    .png()
    .toFile(out);

  return { bbox, geom, outputPngPath: out };
}

