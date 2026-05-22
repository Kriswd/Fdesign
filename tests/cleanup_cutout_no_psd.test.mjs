import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import CleanupService from '../server/services/cleanupService.js';

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function makeDirWithTime(root, name, ms) {
  const fp = path.join(root, name);
  await ensureDir(fp);
  const d = new Date(ms);
  await fs.promises.utimes(fp, d, d).catch(() => void 0);
  await fs.promises.writeFile(path.join(fp, 'marker.txt'), name, 'utf-8');
  return fp;
}

test('cleanupCutoutNoPsdArtifacts 仅删除命名白名单且满足保留策略的目录', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-cutout-'));
  const outputRoot = path.join(tmpRoot, 'output');
  const cutoutDir = path.join(outputRoot, 'cutout_no_psd');
  await ensureDir(cutoutDir);

  const now = Date.now();
  const d1 = now - 30 * 24 * 60 * 60 * 1000;
  const d2 = now - 25 * 24 * 60 * 60 * 1000;
  const d3 = now - 20 * 24 * 60 * 60 * 1000;
  const n1 = now - 2 * 24 * 60 * 60 * 1000;
  const n2 = now - 1 * 24 * 60 * 60 * 1000;

  const old1 = `cutout_no_psd_compose_${d1}`;
  const old2 = `cutout_no_psd_compose_${d2}`;
  const old3 = `cutout_no_psd_compose_${d3}`;
  const new1 = `cutout_no_psd_${n1}`;
  const new2 = `cutout_no_psd_${n2}`;

  await makeDirWithTime(cutoutDir, old1, d1);
  await makeDirWithTime(cutoutDir, old2, d2);
  await makeDirWithTime(cutoutDir, old3, d3);
  await makeDirWithTime(cutoutDir, new1, n1);
  await makeDirWithTime(cutoutDir, new2, n2);
  await makeDirWithTime(cutoutDir, 'cutout_no_psd_custom_keep', d1);
  await makeDirWithTime(cutoutDir, 'random_dir', d1);

  const svc = new CleanupService({ outputRoot });
  await svc.cleanupCutoutNoPsdArtifacts({ keepDays: 7, keepLatest: 2 });

  assert.equal(fs.existsSync(path.join(cutoutDir, new2)), true);
  assert.equal(fs.existsSync(path.join(cutoutDir, new1)), true);
  assert.equal(fs.existsSync(path.join(cutoutDir, old3)), false);
  assert.equal(fs.existsSync(path.join(cutoutDir, old2)), false);
  assert.equal(fs.existsSync(path.join(cutoutDir, old1)), false);
  assert.equal(fs.existsSync(path.join(cutoutDir, 'cutout_no_psd_custom_keep')), true);
  assert.equal(fs.existsSync(path.join(cutoutDir, 'random_dir')), true);
});

test('cleanupCutoutNoPsdArtifacts 在仅存在旧目录时会保留最新 keepLatest 个', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-cutout-'));
  const outputRoot = path.join(tmpRoot, 'output');
  const cutoutDir = path.join(outputRoot, 'cutout_no_psd');
  await ensureDir(cutoutDir);

  const now = Date.now();
  const d1 = now - 30 * 24 * 60 * 60 * 1000;
  const d2 = now - 25 * 24 * 60 * 60 * 1000;
  const d3 = now - 20 * 24 * 60 * 60 * 1000;

  const old1 = `cutout_no_psd_compose_${d1}`;
  const old2 = `cutout_no_psd_compose_${d2}`;
  const old3 = `cutout_no_psd_compose_${d3}`;

  await makeDirWithTime(cutoutDir, old1, d1);
  await makeDirWithTime(cutoutDir, old2, d2);
  await makeDirWithTime(cutoutDir, old3, d3);

  const svc = new CleanupService({ outputRoot });
  await svc.cleanupCutoutNoPsdArtifacts({ keepDays: 7, keepLatest: 2 });

  assert.equal(fs.existsSync(path.join(cutoutDir, old3)), true);
  assert.equal(fs.existsSync(path.join(cutoutDir, old2)), true);
  assert.equal(fs.existsSync(path.join(cutoutDir, old1)), false);
});
