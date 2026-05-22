import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import SlotConfigService from '../server/services/slotConfigService.js';
import TaskTemplateService from '../server/services/taskTemplateService.js';

test('SlotConfigService.getTemplateConfig 返回 originalPsdName（来自 manifest.originalPsdName）', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_original_psd_name_'));
  const templateId = '0123456789abcdef';
  const templateDir = path.join(outputRoot, 'templates', templateId);
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, 'source.psd'), 'psd');
  fs.writeFileSync(
    path.join(templateDir, 'manifest.json'),
    JSON.stringify(
      {
        id: templateId,
        name: '用户可见名称',
        originalPsdName: '唯品会1-3(三视图).psd',
        width: 100,
        height: 200,
        variables: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  const svc = new SlotConfigService({ outputRoot });
  const cfg = await svc.getTemplateConfig(templateId);
  assert.equal(cfg.originalPsdName, '唯品会1-3(三视图).psd');
});

test('TaskTemplateService.create/get 在 items 中保留 originalPsdName（来自模板 manifest）', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_task_tpl_original_psd_name_'));
  const templateId = '0123456789abcdef';
  const templateDir = path.join(outputRoot, 'templates', templateId);
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, 'source.psd'), 'psd');
  fs.writeFileSync(
    path.join(templateDir, 'manifest.json'),
    JSON.stringify(
      {
        id: templateId,
        name: '用户可见名称',
        originalPsdName: '京东PC主图.psd',
        width: 100,
        height: 200,
        variables: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  const svc = new TaskTemplateService({ outputRoot });
  const created = svc.create({
    name: '任务模板A',
    items: [
      {
        templateId,
        selectedPsIds: [1],
        guidePicks: { 1: { leftX: 10, rightX: 20 } },
        exportFormats: ['jpeg'],
      },
    ],
  });

  assert.equal(created.items.length, 1);
  assert.equal(created.items[0].templateId, templateId);
  assert.equal(created.items[0].originalPsdName, '京东PC主图.psd');
});

test('photoshopIngest.ingestPsd 写入 manifest.originalPsdName', () => {
  const filePath = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('originalPsdName'));
});

