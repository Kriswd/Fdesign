import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error('缺少文件路径参数');
}

const tryPath = path.resolve(inputPath);
let fullPath = tryPath;
if (!fs.existsSync(fullPath)) {
  const baseDir = path.resolve(process.cwd(), 'output', 'channels');
  const prefix = String(inputPath || '').trim();
  if (!prefix) {
    throw new Error(`文件不存在: ${fullPath}`);
  }
  const list = fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [];
  const matched = list.find((name) => name.indexOf(prefix) === 0);
  if (!matched) {
    throw new Error(`文件不存在: ${fullPath}`);
  }
  fullPath = path.join(baseDir, matched);
}

const meta = await sharp(fullPath).metadata();
console.log(JSON.stringify({ path: fullPath, format: meta.format, width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha }));
