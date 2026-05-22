import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import CleanupService from '../server/services/cleanupService.js';
import TaskTemplateService from '../server/services/taskTemplateService.js';

function writeJson(fp, data) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

function templateManifest(name) {
  return {
    name,
    isUserSaved: true,
    savedAt: '2026-03-28T10:00:00.000Z',
  };
}

function createRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign-template-delete-'));
  const dataRoot = path.join(root, 'data-output');
  const legacyRoot = path.join(root, 'legacy-output');
  fs.mkdirSync(path.join(dataRoot, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(legacyRoot, 'templates'), { recursive: true });
  return { root, dataRoot, legacyRoot };
}

async function deleteTemplateWithLegacyFallback({ cleanupService, dataRoot, legacyRoot, templateId }) {
  const success = await cleanupService.deleteTemplate(templateId);
  if (success) return 'data';
  const legacyDir = path.join(legacyRoot, 'templates', templateId);
  const successLegacy = await cleanupService.deleteTemplateAtPath(templateId, legacyDir);
  if (successLegacy) return 'legacy';
  return null;
}

test('模板删除先删 data-only 模板', async () => {
  const { root, dataRoot, legacyRoot } = createRoots();
  const templateId = '1111111111111111';
  const dataDir = path.join(dataRoot, 'templates', templateId);
  writeJson(path.join(dataDir, 'manifest.json'), templateManifest('data 模板'));

  const cleanupService = new CleanupService({ outputRoot: dataRoot, isTemplatePinned: () => false });
  const deletedFrom = await deleteTemplateWithLegacyFallback({ cleanupService, dataRoot, legacyRoot, templateId });

  assert.equal(deletedFrom, 'data');
  assert.equal(fs.existsSync(dataDir), false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('模板删除回退到 legacy-only 模板', async () => {
  const { root, dataRoot, legacyRoot } = createRoots();
  const templateId = '2222222222222222';
  const legacyDir = path.join(legacyRoot, 'templates', templateId);
  writeJson(path.join(legacyDir, 'manifest.json'), templateManifest('legacy 模板'));

  const cleanupService = new CleanupService({ outputRoot: dataRoot, isTemplatePinned: () => false });
  const deletedFrom = await deleteTemplateWithLegacyFallback({ cleanupService, dataRoot, legacyRoot, templateId });

  assert.equal(deletedFrom, 'legacy');
  assert.equal(fs.existsSync(legacyDir), false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('被任务模板引用时保持禁止删除', async () => {
  const { root, dataRoot, legacyRoot } = createRoots();
  const templateId = '3333333333333333';
  const dataDir = path.join(dataRoot, 'templates', templateId);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'source.psd'), 'psd');
  writeJson(path.join(dataDir, 'manifest.json'), templateManifest('被引用模板'));

  const taskTemplateService = new TaskTemplateService({ outputRoot: dataRoot });
  taskTemplateService.writeDb({
    nextId: 2,
    templates: [
      {
        id: 1,
        name: '任务模板A',
        items: [{ templateId, quantity: 1 }],
      },
    ],
  });
  assert.equal(taskTemplateService.isTemplateReferenced(templateId), true);

  const cleanupService = new CleanupService({ outputRoot: dataRoot, isTemplatePinned: () => false });
  const shouldBlock = taskTemplateService.isTemplateReferenced(templateId);
  if (!shouldBlock) {
    await deleteTemplateWithLegacyFallback({ cleanupService, dataRoot, legacyRoot, templateId });
  }

  assert.equal(shouldBlock, true);
  assert.equal(fs.existsSync(dataDir), true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('data 与 legacy 都不存在时返回 null', async () => {
  const { root, dataRoot, legacyRoot } = createRoots();
  const templateId = '4444444444444444';

  const cleanupService = new CleanupService({ outputRoot: dataRoot, isTemplatePinned: () => false });
  const deletedFrom = await deleteTemplateWithLegacyFallback({ cleanupService, dataRoot, legacyRoot, templateId });

  assert.equal(deletedFrom, null);

  fs.rmSync(root, { recursive: true, force: true });
});
