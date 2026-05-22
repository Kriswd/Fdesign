import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import TaskTemplateService from './taskTemplateService.js';

function mkTempDir() {
  const base = path.join(os.tmpdir(), `fdesign_task_tpl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function makeMojibakeUtf8AsLatin1(s) {
  return Buffer.from(String(s || ''), 'utf8').toString('latin1');
}

function writeTemplate({ outputRoot, templateId, originalPsdName }) {
  const dir = path.join(outputRoot, 'templates', templateId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'source.psd'), Buffer.from('x'));
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ id: templateId, originalPsdName, name: originalPsdName, width: 100, height: 100, variables: [] }, null, 2),
    'utf8',
  );
}

test('task template preserves PSD count and fixes mojibake originalPsdName', () => {
  const outputRoot = mkTempDir();
  const t1 = 'aaaaaaaaaaaaaaaa';
  const t2 = 'bbbbbbbbbbbbbbbb';
  const t3 = 'cccccccccccccccc';

  writeTemplate({ outputRoot, templateId: t1, originalPsdName: makeMojibakeUtf8AsLatin1('京东PNG产品图规范(三视图).psd') });
  writeTemplate({ outputRoot, templateId: t2, originalPsdName: makeMojibakeUtf8AsLatin1('京东PC主图规范.psd') });
  writeTemplate({ outputRoot, templateId: t3, originalPsdName: makeMojibakeUtf8AsLatin1('唯品会 1-3.psd') });

  const svc = new TaskTemplateService({ outputRoot });
  const tpl = svc.create({
    name: '测试任务模板',
    items: [
      { templateId: t1, selectedPsIds: [11], guidePicks: { 11: { leftX: 10, rightX: 20 } }, exportFormats: ['png'] },
      { templateId: t2, selectedPsIds: [12], guidePicks: { 12: { leftX: 10, rightX: 20 } }, exportFormats: ['jpeg', 'psd'] },
      { templateId: t3, selectedPsIds: [13], guidePicks: { 13: { leftX: 10, rightX: 20 } }, exportFormats: ['jpeg'] },
    ],
  });

  assert.equal(Array.isArray(tpl.items) ? tpl.items.length : 0, 3);
  const names = tpl.items.map((it) => it.originalPsdName);
  assert.ok(names.some((n) => String(n).includes('京东PNG产品图规范')));
  assert.ok(names.some((n) => String(n).includes('京东PC主图规范')));
  assert.ok(names.some((n) => String(n).includes('唯品会')));
});

test('task template should persist selectedVarIds', () => {
  const outputRoot = mkTempDir();
  const templateId = 'dddddddddddddddd';
  writeTemplate({ outputRoot, templateId, originalPsdName: makeMojibakeUtf8AsLatin1('京东PC主图规范.psd') });

  const svc = new TaskTemplateService({ outputRoot });
  const tpl = svc.create({
    name: '测试任务模板-varIds',
    items: [
      {
        templateId,
        selectedPsIds: [11],
        selectedVarIds: ['1111111111111111'],
        guidePicks: { 11: { leftX: 10, rightX: 20 } },
        exportFormats: ['jpeg', 'psd'],
      },
    ],
  });

  assert.equal(Array.isArray(tpl.items) ? tpl.items.length : 0, 1);
  assert.deepEqual(tpl.items[0].selectedVarIds, ['1111111111111111']);
});

test('task template can infer selectedVarIds from selectedPsIds using manifest.variables', () => {
  const outputRoot = mkTempDir();
  const templateId = 'eeeeeeeeeeeeeeee';
  const dir = path.join(outputRoot, 'templates', templateId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'source.psd'), Buffer.from('x'));
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify(
      {
        id: templateId,
        originalPsdName: '京东PC主图规范.psd',
        name: '京东PC主图规范.psd',
        width: 100,
        height: 100,
        variables: [{ id: '2222222222222222', psId: 12, varType: 'img', name: 'v', x: 0, y: 0, width: 10, height: 10, path: 'p' }],
      },
      null,
      2,
    ),
    'utf8',
  );

  const svc = new TaskTemplateService({ outputRoot });
  const tpl = svc.create({
    name: '测试任务模板-infer-varIds',
    items: [{ templateId, selectedPsIds: [12], guidePicks: { 12: { leftX: 10, rightX: 20 } }, exportFormats: ['psd'] }],
  });

  assert.equal(Array.isArray(tpl.items) ? tpl.items.length : 0, 1);
  assert.deepEqual(tpl.items[0].selectedVarIds, ['2222222222222222']);
});
