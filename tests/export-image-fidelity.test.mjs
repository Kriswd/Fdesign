import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import SharpImageProcessor from '../server/services/sharpProcessor.js';

test('render_export.jsx 应使用非 SaveForWeb 的高保真 PNG 导出路径', () => {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('new PNGSaveOptions()'));
});

test('alignWhiteBackgroundImage 在保真模式下应输出更高像素密度', async () => {
  const processor = new SharpImageProcessor();
  const src = await sharp({
    create: {
      width: 2400,
      height: 2400,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: { create: { width: 1600, height: 1800, channels: 3, background: { r: 10, g: 10, b: 10 } } }, left: 400, top: 300 }])
    .png()
    .toBuffer();

  const out = await processor.alignWhiteBackgroundImage({
    imageBuffer: src,
    targetWidth: 800,
    targetHeight: 800,
    referenceRect: { left: 0 },
    manualGuides: { leftX: 120, rightX: 680 },
    preserveDetail: true,
    maxDetailScale: 4,
  });
  const meta = await sharp(out.buffer).metadata();
  assert.ok(Number(meta.width) > 800);
  assert.ok(Number(meta.height) > 800);
});

test('render_export.jsx 缩小替换图时应使用 BICUBICSHARPER 插值', () => {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('ResampleMethod.BICUBICSHARPER'));
  assert.ok(content.includes('app.preferences.interpolation'));
  assert.ok(content.includes('fitLayerToRect_skipped:already_aligned'));
});

test('sharpProcessor 在大幅缩小时应执行轻度锐化', () => {
  const filePath = path.resolve(process.cwd(), 'server/services/sharpProcessor.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('sharpen({ sigma: 0.9'));
});

test('批量导出页面 JPG 默认质量应为 100', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('useState(100)'));
});
