import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

import SlotConfigService from '../server/services/slotConfigService.js';

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

test('SlotConfigService 应保留 computedRule/computedRules 并可回读', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-slotcfg-'));
  const outputRoot = path.join(tmpRoot, 'output');
  const templateId = 'deadbeefdeadbeef';
  const templateDir = path.join(outputRoot, 'templates', templateId);
  ensureDir(templateDir);

  await fs.promises.writeFile(
    path.join(templateDir, 'manifest.json'),
    JSON.stringify({ id: templateId, name: 'T', width: 100, height: 200 }, null, 2),
    'utf-8',
  );

  const service = new SlotConfigService({ outputRoot });
  const computedRule = { type: 'concatFields', fieldKeys: ['a', 'b'], fieldPrefixes: ['', ''], fieldSuffixes: ['', ''], joiner: '-' };
  const computedRules = [
    { id: 'r1', enabled: true, type: 'keywordContains', sourceFieldKey: 'x', keyword: '偏光', trueText: '高清偏光镜片', falseText: '非偏光镜片' },
  ];

  await service.saveSlotConfig(templateId, {
    slots: [
      {
        id: 'slot_1',
        name: '商品位 1',
        variables: [
          {
            id: 'v1',
            psId: 101,
            type: 'text',
            label: '标题',
            excelFieldKey: 'title',
            align: 'left',
            computedRule,
            computedRules,
          },
        ],
      },
    ],
    fieldDefinitions: [{ key: 'title', label: 'title', type: 'text' }],
    ignoredVariableIds: [],
    ignoredFieldKeys: [],
  });

  const cfg = await service.getTemplateConfig(templateId);
  const v = cfg.slots[0].variables[0];
  assert.deepEqual(v.computedRule, computedRule);
  assert.deepEqual(v.computedRules, computedRules);
  assert.equal(v.psId, 101);
});

test('SlotConfigService 应过滤并规范化脏 fieldDefinitions', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-slotcfg-fields-'));
  const outputRoot = path.join(tmpRoot, 'output');
  const templateId = 'badc0ffee0ddf00d';
  const templateDir = path.join(outputRoot, 'templates', templateId);
  ensureDir(templateDir);

  await fs.promises.writeFile(
    path.join(templateDir, 'manifest.json'),
    JSON.stringify({ id: templateId, name: 'T', width: 100, height: 200 }, null, 2),
    'utf-8',
  );

  const service = new SlotConfigService({ outputRoot });

  await service.saveSlotConfig(templateId, {
    slots: [],
    fieldDefinitions: [
      null,
      { key: ' 款号 ', label: ' 款号 ', type: 'text' },
      { key: '', label: '空 key', type: 'text' },
      { key: '色号', label: '   ', type: 'text' },
      { key: '镜框颜色', label: '镜框颜色' },
      'bad',
    ],
    ignoredVariableIds: [],
    ignoredFieldKeys: [],
  });

  const cfg = await service.getTemplateConfig(templateId);
  assert.deepEqual(cfg.fieldDefinitions, [
    { key: '款号', label: '款号', type: 'text' },
    { key: '色号', label: '色号', type: 'text' },
    { key: '镜框颜色', label: '镜框颜色', type: 'text' },
  ]);
});

test('SlotConfigService 应暴露可读的调试摘要，便于保存链路核对', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-slotcfg-debug-'));
  const outputRoot = path.join(tmpRoot, 'output');
  const templateId = 'abcddcbaabcddcba';
  const templateDir = path.join(outputRoot, 'templates', templateId);
  ensureDir(templateDir);

  await fs.promises.writeFile(
    path.join(templateDir, 'manifest.json'),
    JSON.stringify({ id: templateId, name: 'T', width: 100, height: 200 }, null, 2),
    'utf-8',
  );

  const service = new SlotConfigService({ outputRoot });
  await service.saveSlotConfig(templateId, {
    slots: [
      {
        id: 'slot_1',
        name: '商品位 1',
        variables: [
          { id: 'v1', psId: 101, type: 'text', label: '标题', computedRules: [{ id: 'r1', type: 'constant', value: 'X', enabled: true }] },
          { id: 'v2', psId: 102, type: 'text', label: '副标题', computedRules: [] },
        ],
      },
    ],
    fieldDefinitions: [{ key: 'title', label: '标题', type: 'text' }],
    ignoredVariableIds: ['v2'],
    ignoredFieldKeys: ['title'],
  });

  const cfg = await service.getTemplateConfig(templateId);
  const summary = service.buildSlotConfigDebugSummary(cfg);
  assert.deepEqual(summary, {
    slotCount: 1,
    variableCount: 2,
    fieldDefinitionKeys: ['title'],
    ignoredVariableIds: ['v2'],
    ignoredFieldKeys: ['title'],
    ruleChainLengths: [{ slotId: 'slot_1', variableId: 'v1', psId: 101, length: 1 }],
  });
});

test('SlotConfigService 应返回模板列表缩略图 URL', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-slotcfg-thumb-'));
  const outputRoot = path.join(tmpRoot, 'output');
  const templateId = 'feedfacefeedface';
  const templateDir = path.join(outputRoot, 'templates', templateId);
  ensureDir(templateDir);
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 20, g: 40, b: 60 },
    },
  }).webp().toFile(path.join(templateDir, 'reference.png'));

  const service = new SlotConfigService({ outputRoot });
  const thumbnailUrl = await service.ensureThumbnailUrl(templateId, templateDir);
  assert.equal(thumbnailUrl, `/templates/${templateId}/preview-card.webp`);
  assert.equal(fs.existsSync(path.join(templateDir, 'preview-card.webp')), true);
});

