import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import PhotoshopIngestService from '../server/services/photoshopIngest.js';

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJson(fp, obj) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2), 'utf8');
}

async function writeJpg(fp, rgb) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: rgb,
    },
  })
    .jpeg({ quality: 80 })
    .toFile(fp);
}

async function main() {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign-verify-'));
  const outputRoot = path.join(sandboxRoot, 'output');
  fs.mkdirSync(outputRoot, { recursive: true });

  const svc = new PhotoshopIngestService({ outputRoot });

  const templateId = '0123456789abcdef';
  const templateDir = path.join(outputRoot, 'templates', templateId);
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, 'source.psd'), '');
  writeJson(path.join(templateDir, 'manifest.json'), {
    width: 20,
    height: 20,
    backgroundRect: { left: 0, top: 0, width: 20, height: 20 },
  });
  fs.mkdirSync(path.join(templateDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(templateDir, 'channels', 'QZ9999A1_正.tga'), 'x');
  fs.writeFileSync(path.join(templateDir, 'channels', 'QZ9999A1_侧.tga'), 'x');

  await writeJpg(path.join(outputRoot, 'uploads', 'u1', 'QZ9999A1_正.jpg'), { r: 255, g: 0, b: 0 });
  await writeJpg(path.join(outputRoot, 'uploads', 'u1', 'QZ9999A1_侧.jpg'), { r: 0, g: 255, b: 0 });

  const batchRes = await svc.exportTemplateBatch({
    templateId,
    variables: [{ psId: 1, varType: 'img', name: '产品图', x: 0, y: 0, width: 20, height: 20 }],
    tasks: [
      {
        label: '有通道',
        format: 'png',
        updates: [{ psId: 1, varType: 'img', imagePath: 'u1/QZ9999A1_正.jpg', sourceName: 'QZ9999A1_正.jpg' }],
      },
      {
        label: '有通道2',
        format: 'png',
        updates: [{ psId: 1, varType: 'img', imagePath: 'u1/QZ9999A1_侧.jpg', sourceName: 'QZ9999A1_侧.jpg' }],
      },
    ],
    dryRun: true,
    transparentBackground: true,
  });

  must(batchRes && batchRes.dryRun === true, 'batch-export dryRun 未返回');
  must(batchRes.tasksCount === 2, 'batch-export dryRun tasksCount 不正确');


  fs.mkdirSync(path.join(outputRoot, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'channels', 'QZ9999A1_正.tga'), 'x');
  fs.writeFileSync(path.join(outputRoot, 'channels', 'QZ9999A1_45.tga'), 'x');

  await writeJpg(path.join(outputRoot, 'uploads', 'u2', 'QZ9999A1_正.jpg'), { r: 0, g: 0, b: 255 });
  await writeJpg(path.join(outputRoot, 'uploads', 'u2', 'QZ9999A1_45.jpg'), { r: 255, g: 255, b: 0 });

  const cutoutRes = await svc.cutoutBatchNoPsd({
    images: [
      { imagePath: 'u2/QZ9999A1_正.jpg', sourceName: 'QZ9999A1_正.jpg' },
      { imagePath: 'u2/QZ9999A1_45.jpg', sourceName: 'QZ9999A1_45.jpg' },
    ],
    channels: [
      { storedName: 'QZ9999A1_正.tga', sourceName: 'QZ9999A1_正.tga' },
      { storedName: 'QZ9999A1_45.tga', sourceName: 'QZ9999A1_45.tga' },
    ],
    dryRun: true,
    resizeMode: 'exact',
  });

  must(cutoutRes && cutoutRes.dryRun === true, 'cutout-batch-no-psd dryRun 未返回');
  must(cutoutRes.tasksCount === 2, 'cutout-batch-no-psd dryRun tasksCount 不正确');

  let cutoutMissingOk = false;
  try {
    fs.unlinkSync(path.join(outputRoot, 'channels', 'QZ9999A1_45.tga'));
    await svc.cutoutBatchNoPsd({
      images: [{ imagePath: 'u2/QZ9999A1_45.jpg', sourceName: 'QZ9999A1_45.jpg' }],
      channels: [{ storedName: 'QZ9999A1_正.tga', sourceName: 'QZ9999A1_正.tga' }],
      dryRun: true,
      resizeMode: 'exact',
    });
  } catch (e) {
    cutoutMissingOk = e && e.code === 'MISSING_CHANNELS';
  }
  must(cutoutMissingOk, 'cutout-batch-no-psd 缺通道未返回 MISSING_CHANNELS');

  console.log(
    JSON.stringify(
      {
        outputRoot,
        batch: { dryRun: true, tasksCount: batchRes.tasksCount },
        cutout: { dryRun: true, tasksCount: cutoutRes.tasksCount, missingOk: cutoutMissingOk },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exitCode = 1;
});
