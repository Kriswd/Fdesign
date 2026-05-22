import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import CleanupService from '../server/services/cleanupService.js';

function writeFile(fp, content) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content, 'utf8');
}

function setMtimeHoursAgo(fp, hoursAgo) {
  const ms = Date.now() - hoursAgo * 60 * 60 * 1000;
  const d = new Date(ms);
  fs.utimesSync(fp, d, d);
}

test('cleanupExportArtifacts 仅清理 inputs 与 exports 元数据，不删除导出产物', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_cleanup_'));
  const templateId = '771ef0766febe6d9';
  const inputsDir = path.join(root, 'templates', templateId, 'inputs');
  const exportsDir = path.join(root, 'templates', templateId, 'exports');

  const oldInput = path.join(inputsDir, 'img_psId_1_0.png');
  const newInput = path.join(inputsDir, 'img_psId_1_1.png');
  writeFile(oldInput, 'old');
  writeFile(newInput, 'new');
  setMtimeHoursAgo(oldInput, 10);
  setMtimeHoursAgo(newInput, 0.1);

  const job = path.join(exportsDir, 'job_123.json');
  const result = path.join(exportsDir, 'result_123.json');
  const vbsLog = path.join(exportsDir, 'job_123.json.vbs.log');
  const jsxLog = path.join(exportsDir, 'job_123.json.log');
  const vbsTmpJsx = path.join(exportsDir, 'ps_jsx_123.jsx');
  const vbsWrapJsx = path.join(exportsDir, 'ps_wrap_123.jsx');
  const output = path.join(exportsDir, 'batch_1', 'out.png');
  writeFile(job, '{}');
  writeFile(result, '{}');
  writeFile(vbsLog, 'vbs');
  writeFile(jsxLog, 'jsx');
  writeFile(vbsTmpJsx, '#target photoshop');
  writeFile(vbsWrapJsx, '#target photoshop');
  writeFile(output, 'png');
  setMtimeHoursAgo(job, 10);
  setMtimeHoursAgo(result, 10);
  setMtimeHoursAgo(vbsLog, 10);
  setMtimeHoursAgo(jsxLog, 10);
  setMtimeHoursAgo(vbsTmpJsx, 10);
  setMtimeHoursAgo(vbsWrapJsx, 10);
  setMtimeHoursAgo(output, 10);

  const svc = new CleanupService({ outputRoot: root });
  await svc.cleanupExportArtifacts({ inputsExpiryHours: 1, exportsMetaExpiryHours: 1 });

  assert.equal(fs.existsSync(oldInput), false);
  assert.equal(fs.existsSync(newInput), true);

  assert.equal(fs.existsSync(job), false);
  assert.equal(fs.existsSync(result), false);
  assert.equal(fs.existsSync(vbsLog), false);
  assert.equal(fs.existsSync(jsxLog), false);
  assert.equal(fs.existsSync(vbsTmpJsx), false);
  assert.equal(fs.existsSync(vbsWrapJsx), false);
  assert.equal(fs.existsSync(output), true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('cleanupTemplateImages 保留 reference.png 和 backdrop.png,删除过期图片', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_cleanup_images_'));
  const templateId = '771ef0766febe6d9';
  const imagesDir = path.join(root, 'templates', templateId, 'images');

  // 创建保留文件
  writeFile(path.join(imagesDir, 'reference.png'), 'reference');
  writeFile(path.join(imagesDir, 'backdrop.png'), 'backdrop');

  // 创建过期图片(25小时前)
  const oldRef1 = path.join(imagesDir, 'reference_123456.png');
  const oldUserImg = path.join(imagesDir, 'user_upload_001.jpg');
  const oldWebp = path.join(imagesDir, 'old_image.webp');
  writeFile(oldRef1, 'old ref');
  writeFile(oldUserImg, 'old user');
  writeFile(oldWebp, 'old webp');
  setMtimeHoursAgo(oldRef1, 25);
  setMtimeHoursAgo(oldUserImg, 25);
  setMtimeHoursAgo(oldWebp, 25);

  // 创建新图片(1小时前)
  const newUserImg = path.join(imagesDir, 'new_upload_002.jpeg');
  writeFile(newUserImg, 'new user');
  setMtimeHoursAgo(newUserImg, 1);

  // 创建非图片文件(应保留)
  writeFile(path.join(imagesDir, 'slot-config.json'), '{}');
  setMtimeHoursAgo(path.join(imagesDir, 'slot-config.json'), 25);

  const svc = new CleanupService({ outputRoot: root });
  const result = await svc.cleanupTemplateImages(templateId, path.join(root, 'templates', templateId), 24);

  // 验证保留文件
  assert.equal(fs.existsSync(path.join(imagesDir, 'reference.png')), true, 'reference.png 应保留');
  assert.equal(fs.existsSync(path.join(imagesDir, 'backdrop.png')), true, 'backdrop.png 应保留');
  assert.equal(fs.existsSync(newUserImg), true, '新图片应保留');
  assert.equal(fs.existsSync(path.join(imagesDir, 'slot-config.json')), true, '非图片文件应保留');

  // 验证过期文件已删除
  assert.equal(fs.existsSync(oldRef1), false, '过期 reference_*.png 应删除');
  assert.equal(fs.existsSync(oldUserImg), false, '过期用户图片应删除');
  assert.equal(fs.existsSync(oldWebp), false, '过期 webp 应删除');

  // 验证结果统计
  assert.equal(result.deleted, 3, '应删除3个文件');
  assert.equal(result.skipped, 4, '应跳过4个文件(reference.png, backdrop.png, new_upload_002.jpeg, slot-config.json)');
  assert.equal(result.error, null, '不应有错误');

  fs.rmSync(root, { recursive: true, force: true });
});

test('cleanupAllTemplateImages 批量清理所有模板的 images 文件夹', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_cleanup_all_images_'));
  const templateId1 = '771ef0766febe6d9';
  const templateId2 = '882ef0766febe6d9';

  // 模板1: 有过期图片
  const imagesDir1 = path.join(root, 'templates', templateId1, 'images');
  writeFile(path.join(imagesDir1, 'reference.png'), 'ref1');
  const oldImg1 = path.join(imagesDir1, 'old_1.png');
  writeFile(oldImg1, 'old1');
  setMtimeHoursAgo(oldImg1, 30);

  // 模板2: 没有过期图片
  const imagesDir2 = path.join(root, 'templates', templateId2, 'images');
  writeFile(path.join(imagesDir2, 'reference.png'), 'ref2');
  const newImg2 = path.join(imagesDir2, 'new_2.jpg');
  writeFile(newImg2, 'new2');
  setMtimeHoursAgo(newImg2, 2);

  const svc = new CleanupService({ outputRoot: root });
  const result = await svc.cleanupAllTemplateImages(24);

  assert.equal(fs.existsSync(oldImg1), false, '模板1的过期图片应删除');
  assert.equal(fs.existsSync(newImg2), true, '模板2的新图片应保留');
  assert.equal(result.totalTemplates, 2, '应处理2个模板');
  assert.equal(result.totalDeleted, 1, '应删除1个文件');
  assert.equal(result.errors.length, 0, '不应有错误');

  fs.rmSync(root, { recursive: true, force: true });
});
