import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import CleanupService from '../server/services/cleanupService.js';

test('CleanupService 不应删除被任务模板引用的 templateId', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psd-cleanup-test-'));
  const outputRoot = path.join(root, 'output');
  const templatesDir = path.join(outputRoot, 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });

  const pinnedId = 'aaaaaaaaaaaaaaaa';
  const freeId = 'bbbbbbbbbbbbbbbb';

  const writeTemplate = (id, isUserSaved) => {
    const dir = path.join(templatesDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'source.psd'), 'x');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ isUserSaved }, null, 2), 'utf8');
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    fs.utimesSync(dir, old, old);
  };

  writeTemplate(pinnedId, false);
  writeTemplate(freeId, false);

  const cleanup = new CleanupService({
    outputRoot,
    isTemplatePinned: (id) => String(id) === pinnedId,
  });

  await cleanup.cleanupAllTemporaryTemplates();

  assert.ok(fs.existsSync(path.join(templatesDir, pinnedId)));
  assert.ok(!fs.existsSync(path.join(templatesDir, freeId)));

  fs.rmSync(root, { recursive: true, force: true });
});

test('CleanupService 遇到损坏 manifest.json 时不应删除（避免误删用户保存）', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psd-cleanup-test-'));
  const outputRoot = path.join(root, 'output');
  const templatesDir = path.join(outputRoot, 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });

  const badId = 'cccccccccccccccc';
  const dir = path.join(templatesDir, badId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'source.psd'), 'x');
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{bad json', 'utf8');
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  fs.utimesSync(dir, old, old);

  const cleanup = new CleanupService({ outputRoot, isTemplatePinned: () => false });
  await cleanup.cleanupAllTemporaryTemplates();

  assert.ok(fs.existsSync(dir));
  fs.rmSync(root, { recursive: true, force: true });
});
