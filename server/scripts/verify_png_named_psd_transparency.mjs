import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import PhotoshopIngestService from '../services/photoshopIngest.js';

const outputRoot = process.env.OUTPUT_ROOT
  ? path.resolve(process.env.OUTPUT_ROOT)
  : path.resolve(process.cwd(), 'output');

const templateId = process.env.TEMPLATE_ID ? String(process.env.TEMPLATE_ID).trim() : '';
const productImagePath = process.env.PRODUCT_IMAGE_PATH ? path.resolve(process.env.PRODUCT_IMAGE_PATH) : '';
const channelStoredName = process.env.CHANNEL_STORED_NAME ? String(process.env.CHANNEL_STORED_NAME).trim() : '';
const channelSourceName = process.env.CHANNEL_SOURCE_NAME ? String(process.env.CHANNEL_SOURCE_NAME).trim() : channelStoredName;
const psId = process.env.PS_ID ? Number(process.env.PS_ID) : NaN;
const leftX = process.env.GUIDE_LEFT_X ? Number(process.env.GUIDE_LEFT_X) : NaN;
const rightX = process.env.GUIDE_RIGHT_X ? Number(process.env.GUIDE_RIGHT_X) : NaN;
const layerX = process.env.LAYER_X ? Number(process.env.LAYER_X) : NaN;
const layerY = process.env.LAYER_Y ? Number(process.env.LAYER_Y) : NaN;
const layerW = process.env.LAYER_W ? Number(process.env.LAYER_W) : NaN;
const layerH = process.env.LAYER_H ? Number(process.env.LAYER_H) : NaN;

if (!templateId) throw new Error('Missing TEMPLATE_ID');
if (!productImagePath || !fs.existsSync(productImagePath)) throw new Error('Missing or invalid PRODUCT_IMAGE_PATH');
if (!channelStoredName) throw new Error('Missing CHANNEL_STORED_NAME');
if (!Number.isFinite(psId)) throw new Error('Missing PS_ID');
if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) throw new Error('Invalid GUIDE_LEFT_X / GUIDE_RIGHT_X');
if (!Number.isFinite(layerX) || !Number.isFinite(layerY) || !Number.isFinite(layerW) || !Number.isFinite(layerH)) {
  throw new Error('Missing LAYER_X/LAYER_Y/LAYER_W/LAYER_H');
}

const svc = new PhotoshopIngestService({ outputRoot });
const res = await svc.exportTemplateBatch({
  templateId,
  tasks: [
    {
      label: 'verify_transparent_psd',
      format: 'psd',
      updates: [
        {
          varType: 'img',
          psId,
          imagePath: productImagePath,
          sourceName: path.basename(productImagePath),
          x: layerX,
          y: layerY,
          width: layerW,
          height: layerH,
          guidePick: { leftX, rightX },
        },
      ],
    },
  ],
  channels: [{ storedName: channelStoredName, sourceName: channelSourceName }],
});

const task0 = Array.isArray(res?.results) ? res.results[0] : null;
if (!task0 || task0.ok !== true || !task0.outputPath) {
  throw new Error(`Export failed: ${JSON.stringify(task0 || res, null, 2)}`);
}

const outPsd = String(task0.outputPath);
if (!fs.existsSync(outPsd)) throw new Error(`PSD not found: ${outPsd}`);

const jobDir = path.join(outputRoot, 'templates', templateId);
const inputsDir = path.join(jobDir, 'inputs');
if (!fs.existsSync(inputsDir)) throw new Error(`inputs dir not found: ${inputsDir}`);

const recent = fs
  .readdirSync(inputsDir)
  .filter((n) => n.toLowerCase().endsWith('.png') && n.includes(`img_psId_${psId}_mask_`))
  .map((n) => ({ n, t: fs.statSync(path.join(inputsDir, n)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];

if (!recent) throw new Error('No aligned PNG found in inputs dir');

const alignedPath = path.join(inputsDir, recent.n);
const meta = await sharp(alignedPath).metadata();
if (!meta.hasAlpha) throw new Error(`Aligned PNG has no alpha: ${alignedPath}`);

console.log(JSON.stringify({ ok: true, outputPsd: outPsd, alignedPng: alignedPath, alignedMeta: meta }, null, 2));

