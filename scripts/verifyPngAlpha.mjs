import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const pngPathArg = process.argv[2];
if (!pngPathArg) {
  throw new Error('缺少 PNG 路径参数');
}

const pngPath = path.resolve(pngPathArg);
if (!fs.existsSync(pngPath)) {
  throw new Error(`文件不存在: ${pngPath}`);
}

const img = sharp(pngPath);
const meta = await img.metadata();
const width = Number(meta.width) || 0;
const height = Number(meta.height) || 0;
if (width <= 0 || height <= 0) {
  throw new Error('无法读取图片尺寸');
}

console.log(JSON.stringify({ pngPath, format: meta.format, hasAlpha: meta.hasAlpha, width, height }));

const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const c = info.channels;

const sampleAlpha = (x, y) => {
  const idx = (y * w + x) * c + 3;
  return Number(data[idx]) || 0;
};

const corners = [
  sampleAlpha(0, 0),
  sampleAlpha(w - 1, 0),
  sampleAlpha(0, h - 1),
  sampleAlpha(w - 1, h - 1),
];

console.log(JSON.stringify({ cornerAlpha: corners, cornerAlphaMax: Math.max(...corners) }));
