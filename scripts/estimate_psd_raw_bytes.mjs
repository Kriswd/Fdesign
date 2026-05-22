import fs from 'node:fs';
import path from 'node:path';
import { readPsd } from 'ag-psd';

function usage() {
  console.log('用法: node scripts/estimate_psd_raw_bytes.mjs <psdPath>');
  process.exitCode = 1;
}

function bytesToHuman(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return String(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x.toFixed(i === 0 ? 0 : 2)}${units[i]}`;
}

const psdPath = process.argv[2];
if (!psdPath) usage();
if (!fs.existsSync(psdPath)) {
  console.error('PSD 不存在:', psdPath);
  process.exitCode = 1;
  process.exit();
}

const buf = fs.readFileSync(psdPath);
const psd = readPsd(buf, {
  skipLayerImageData: true,
  skipCompositeImageData: true,
  skipThumbnail: true,
  logMissingFeatures: false,
});

const docW = Number(psd?.width) || 0;
const docH = Number(psd?.height) || 0;
const channels = Number(psd?.channels) || 4;
const depth = Number(psd?.depth) || 8;
const bytesPerChannel = depth === 16 ? 2 : depth === 32 ? 4 : 1;

const leaves = [];
function walk(children, stack) {
  if (!children) return;
  for (const ch of children) {
    if (!ch) continue;
    const nextStack = [...stack, String(ch.name || '')].filter(Boolean);
    if (ch.children && ch.children.length > 0) {
      walk(ch.children, nextStack);
      continue;
    }
    const left = Number(ch.left);
    const top = Number(ch.top);
    const right = Number(ch.right);
    const bottom = Number(ch.bottom);
    const w = Number.isFinite(left) && Number.isFinite(right) ? Math.max(0, right - left) : 0;
    const h = Number.isFinite(top) && Number.isFinite(bottom) ? Math.max(0, bottom - top) : 0;
    const area = w * h;
    const isText = Boolean(ch.text);
    const isPlaced = Boolean(ch.placedLayer);
    const isRasterish = Boolean(ch.canvas) || Boolean(ch.imageData) || isPlaced;
    leaves.push({
      id: ch.id != null ? Number(ch.id) : null,
      name: ch.name != null ? String(ch.name) : '',
      path: nextStack.join(' / '),
      w,
      h,
      area,
      isText,
      isPlaced,
      isRasterish,
    });
  }
}
walk(psd.children, []);

const rasterLeaves = leaves.filter((l) => l.isRasterish);
const textLeaves = leaves.filter((l) => l.isText);

function estimateAreaPx(layer) {
  if (!layer) return 0;
  if (layer.isPlaced && layer.nodePlacedSize) {
    return layer.nodePlacedSize.w * layer.nodePlacedSize.h;
  }
  return layer.area;
}

const enriched = rasterLeaves.map((l) => l);
for (const l of enriched) {
  l.nodePlacedSize = null;
}

const byId = new Map();
for (const l of leaves) {
  if (Number.isFinite(l.id)) byId.set(l.id, l);
}

function injectPlacedSizeFromPsdNode(children) {
  if (!children) return;
  for (const ch of children) {
    if (!ch) continue;
    if (ch.children) injectPlacedSizeFromPsdNode(ch.children);
    if (!ch.placedLayer) continue;
    const id = Number(ch.id);
    const l = byId.get(id);
    if (!l) continue;
    const w = Number(ch.placedLayer.width);
    const h = Number(ch.placedLayer.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      l.nodePlacedSize = { w, h };
    }
  }
}
injectPlacedSizeFromPsdNode(psd.children);

const totalArea = rasterLeaves.reduce((acc, l) => acc + estimateAreaPx(l), 0);
const estBytes = totalArea * channels * bytesPerChannel;

const top = [...rasterLeaves]
  .sort((a, b) => estimateAreaPx(b) - estimateAreaPx(a))
  .slice(0, 20)
  .map((l) => ({
    psId: l.id,
    w: l.nodePlacedSize ? l.nodePlacedSize.w : l.w,
    h: l.nodePlacedSize ? l.nodePlacedSize.h : l.h,
    area: estimateAreaPx(l),
    approxBytes: estimateAreaPx(l) * channels * bytesPerChannel,
    isPlaced: l.isPlaced,
    name: l.name,
    path: l.path,
  }));

console.log('=== 文档信息 ===');
console.log({
  file: path.basename(psdPath),
  width: docW,
  height: docH,
  channels,
  depth: Number(psd?.depth) || null,
  bytesPerChannel,
  leafCount: leaves.length,
  rasterLeafCount: rasterLeaves.length,
  textLeafCount: textLeaves.length,
});
console.log('=== 估算（基于每个栅格层的 bounding box 面积求和） ===');
console.log({
  totalRasterAreaPx: totalArea,
  estimatedRawBytes: estBytes,
  estimatedRawHuman: bytesToHuman(estBytes),
  psdFormatLimitHuman: bytesToHuman(2 * 1024 * 1024 * 1024),
});
console.log('=== Top20 最大栅格层（按 bounding box 面积） ===');
for (const item of top) {
  console.log(
    JSON.stringify(
      {
        psId: item.psId,
        w: item.w,
        h: item.h,
        approx: bytesToHuman(item.approxBytes),
        isPlaced: item.isPlaced,
        name: item.name,
      },
      null,
      0,
    ),
  );
}
