import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { duplicateTemplateOnDisk } from '../server/utils/templateDuplicate.js';

function writeFile(fp, content) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content, 'utf8');
}

function writeJson(fp, data) {
  writeFile(fp, JSON.stringify(data, null, 2));
}

test('duplicateTemplateOnDisk 复制稳定文件并跳过临时产物目录', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_dup_tpl_'));
  const templateId = '771ef0766febe6d9';
  const tplDir = path.join(root, 'templates', templateId);

  writeFile(path.join(tplDir, 'source.psd'), 'psd');
  writeJson(path.join(tplDir, 'manifest.json'), {
    name: '主图模版A',
    isUserSaved: true,
    savedAt: '2026-01-01T00:00:00.000Z',
  });
  writeJson(path.join(tplDir, 'slot-config.json'), {
    templateId,
    version: 1,
    slots: [{ id: 's1', variables: [{ psId: 1, varType: 'text' }] }],
    fieldDefinitions: [],
    ignoredVariableIds: [],
    ignoredFieldKeys: [],
  });
  writeFile(path.join(tplDir, 'reference.png'), 'png');
  writeFile(path.join(tplDir, 'preview-card.webp'), 'thumb');
  writeFile(path.join(tplDir, 'images', 'reference_1.png'), 'png2');
  writeFile(path.join(tplDir, 'exports', 'job_1.json'), '{}');
  writeFile(path.join(tplDir, 'inputs', 'img_1.png'), 'img');

  const out = await duplicateTemplateOnDisk({
    outputRoot: root,
    templateId,
    name: '主图模版A（副本）',
    nowIso: '2026-03-14T10:00:00.000Z',
  });

  assert.equal(out.success, true);
  assert.equal(typeof out.templateId, 'string');
  assert.match(out.templateId, /^[0-9a-f]{16}$/i);
  assert.equal(out.name, '主图模版A（副本）');
  assert.equal(out.savedAt, '2026-03-14T10:00:00.000Z');
  assert.equal(out.thumbnailUrl, `/templates/${out.templateId}/preview-card.webp`);

  const newDir = path.join(root, 'templates', out.templateId);
  assert.equal(fs.existsSync(path.join(newDir, 'source.psd')), true);
  assert.equal(fs.existsSync(path.join(newDir, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(newDir, 'slot-config.json')), true);
  assert.equal(fs.existsSync(path.join(newDir, 'reference.png')), true);
  assert.equal(fs.existsSync(path.join(newDir, 'preview-card.webp')), true);
  assert.equal(fs.existsSync(path.join(newDir, 'images', 'reference_1.png')), true);

  assert.equal(fs.existsSync(path.join(newDir, 'exports')), false);
  assert.equal(fs.existsSync(path.join(newDir, 'inputs')), false);

  const newManifest = JSON.parse(fs.readFileSync(path.join(newDir, 'manifest.json'), 'utf8'));
  assert.equal(newManifest.isUserSaved, true);
  assert.equal(newManifest.name, '主图模版A（副本）');
  assert.equal(newManifest.savedAt, '2026-03-14T10:00:00.000Z');

  const newSlot = JSON.parse(fs.readFileSync(path.join(newDir, 'slot-config.json'), 'utf8'));
  assert.equal(newSlot.templateId, out.templateId);
  assert.equal(Array.isArray(newSlot.slots), true);
  assert.equal(newSlot.slots[0].id, 's1');

  const oldSlot = JSON.parse(fs.readFileSync(path.join(tplDir, 'slot-config.json'), 'utf8'));
  assert.equal(oldSlot.templateId, templateId);

  fs.rmSync(root, { recursive: true, force: true });
});

