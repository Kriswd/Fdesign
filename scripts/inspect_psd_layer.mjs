import fs from 'node:fs';
import path from 'node:path';
import { readPsd } from 'ag-psd';

function usage() {
  console.log('用法: node scripts/inspect_psd_layer.mjs <psdPath> <psId>');
  process.exitCode = 1;
}

function pickKeys(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return String(obj);
  }
}

const psdPath = process.argv[2];
const psIdRaw = process.argv[3];
const psId = Number(psIdRaw);
if (!psdPath || !Number.isFinite(psId) || psId <= 0) usage();
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

console.log('=== 文档信息 ===');
console.log(
  safeStringify(
    pickKeys(psd, ['width', 'height', 'channels', 'depth', 'colorMode', 'version']),
  ),
);

let found = null;
function walk(children, stack) {
  if (!children) return;
  for (const ch of children) {
    if (!ch) continue;
    const id = Number(ch.id);
    const nextStack = [...stack, String(ch.name || '')].filter(Boolean);
    if (id === psId) {
      found = { node: ch, path: nextStack.join(' / ') };
      return;
    }
    if (ch.children) walk(ch.children, nextStack);
    if (found) return;
  }
}
walk(psd.children, []);

if (!found) {
  console.error('未找到图层 psId=', psId);
  process.exitCode = 2;
  process.exit();
}

const node = found.node;
console.log('=== 命中图层 ===');
console.log('path:', found.path);
console.log(
  safeStringify(
    pickKeys(node, [
      'id',
      'name',
      'top',
      'left',
      'right',
      'bottom',
      'opacity',
      'visible',
      'blendMode',
      'clipping',
      'group',
      'sectionDivider',
    ]),
  ),
);

const hasText = Boolean(node.text);
const hasPlaced = Boolean(node.placedLayer);
const hasCanvas = Boolean(node.canvas);
const hasImageData = Boolean(node.imageData);
console.log('=== 类型判定 ===');
console.log(safeStringify({ hasText, hasPlacedLayer: hasPlaced, hasCanvas, hasImageData }));

if (hasText) {
  console.log('=== text 摘要 ===');
  console.log(
    safeStringify(
      pickKeys(node.text, ['text', 'transform', 'antiAlias', 'orientation', 'style']),
    ),
  );
}

if (hasPlaced) {
  console.log('=== placedLayer 摘要（关键） ===');
  const pl = node.placedLayer;
  console.log(
    safeStringify(
      pickKeys(pl, [
        'id',
        'type',
        'pageNumber',
        'placed',
        'width',
        'height',
        'transform',
        'warp',
        'resolution',
        'boundingBox',
        'linked',
      ]),
    ),
  );
  console.log('=== placedLayer 全量 keys ===');
  console.log(Object.keys(pl).sort().join(', '));
}

console.log('done:', path.basename(psdPath), 'psId=', psId);
