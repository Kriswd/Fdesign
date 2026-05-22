import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildOutputLookupCandidates,
  buildTemplateFileUrl,
  isPathInsideDir,
  pickFirstExistingPath,
  resolveOutputCandidatePaths,
} from '../server/services/exportResultResolver.js';

test('isPathInsideDir 仅允许目录内路径', () => {
  const root = path.resolve('C:/tmp/fdesign_root');
  const inside = path.join(root, 'a/b/c.txt');
  const same = root;
  const outside = path.join(root, '..', 'escape.txt');
  assert.equal(isPathInsideDir(root, inside), true);
  assert.equal(isPathInsideDir(root, same), true);
  assert.equal(isPathInsideDir(root, outside), false);
});

test('buildTemplateFileUrl 仅对 template 目录内文件生成 URL', () => {
  const outputRoot = path.resolve('D:/work/output');
  const templateId = 'abc123';
  const abs1 = path.join(outputRoot, 'templates', templateId, 'exports', 'x.psb');
  const abs2 = path.join(outputRoot, 'templates', 'other', 'exports', 'x.psb');
  assert.equal(buildTemplateFileUrl({ outputRoot, templateId, absPath: abs1 }), `/templates/${templateId}/exports/x.psb`);
  assert.equal(buildTemplateFileUrl({ outputRoot, templateId, absPath: abs2 }), null);
});

test('resolveOutputCandidatePaths 支持相对路径补全到 outputRoot', () => {
  const outputRoot = path.resolve('E:/Project/output');
  const out = resolveOutputCandidatePaths({
    outputRoot,
    candidates: ['templates/t1/exports/a.psb', path.join(outputRoot, 'templates', 't1', 'exports', 'b.psd')],
  });
  assert.equal(out.length, 2);
  assert.equal(out[0], path.join(outputRoot, 'templates', 't1', 'exports', 'a.psb'));
  assert.equal(out[1], path.join(outputRoot, 'templates', 't1', 'exports', 'b.psd'));
});

test('buildOutputLookupCandidates 会补齐 PSD/PSB 兄弟候选并去重', () => {
  const outputRoot = path.resolve('E:/Project/output');
  const out = buildOutputLookupCandidates({
    outputRoot,
    candidates: ['templates/t1/exports/a.psd', path.join(outputRoot, 'templates', 't1', 'exports', 'a.psb')],
  });
  assert.deepEqual(out, [
    path.join(outputRoot, 'templates', 't1', 'exports', 'a.psd'),
    path.join(outputRoot, 'templates', 't1', 'exports', 'a.psb'),
  ]);
});

test('pickFirstExistingPath 优先返回第一个存在的候选', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_export_resolver_'));
  const p1 = path.join(dir, 'missing.psd');
  const p2 = path.join(dir, 'ok.psb');
  fs.writeFileSync(p2, 'ok');
  const picked = pickFirstExistingPath({ fs, candidates: [p1, p2] });
  assert.equal(picked, p2);
});

test('PSB 降级场景：优先选择 result 的 psb 输出并生成 URL', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_output_root_'));
  const templateId = 't_psb';
  const exportsDir = path.join(outputRoot, 'templates', templateId, 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });

  const resultPsb = path.join(exportsDir, 'export_1.psb');
  fs.writeFileSync(resultPsb, 'psb');
  const requestedPsd = path.join(exportsDir, 'export_1.psd');

  const candidates = resolveOutputCandidatePaths({
    outputRoot,
    candidates: [resultPsb, requestedPsd],
  }).filter((p) => isPathInsideDir(exportsDir, p));
  const effective = pickFirstExistingPath({ fs, candidates });
  assert.equal(effective, resultPsb);
  assert.equal(buildTemplateFileUrl({ outputRoot, templateId, absPath: effective }), `/templates/${templateId}/exports/export_1.psb`);
});
