import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runStartupBackup } from '../server/services/startupBackupService.js';

test('runStartupBackup 在 watch 模式且未显式配置时默认跳过', () => {
  const prevOnStart = process.env.FDESIGN_BACKUP_ON_START;
  delete process.env.FDESIGN_BACKUP_ON_START;

  const descriptor = Object.getOwnPropertyDescriptor(process, 'execArgv');
  let restoreMode = 'none';
  let originalExecArgv = null;

  try {
    if (descriptor && descriptor.writable) {
      restoreMode = 'writable';
      originalExecArgv = process.execArgv;
      process.execArgv = ['--watch'];
    } else {
      restoreMode = 'define';
      Object.defineProperty(process, 'execArgv', {
        value: ['--watch'],
        configurable: true,
        writable: true,
      });
    }

    const out = runStartupBackup({ projectRoot: process.cwd(), outputRoot: path.join(process.cwd(), 'output') });
    assert.equal(out.ok, true);
    assert.equal(out.skipped, true);
    assert.equal(out.reason, 'watch_mode_default_skip');
  } finally {
    if (restoreMode === 'writable') {
      process.execArgv = originalExecArgv;
    } else if (restoreMode === 'define') {
      if (descriptor) {
        Object.defineProperty(process, 'execArgv', descriptor);
      }
    }
    if (prevOnStart == null) delete process.env.FDESIGN_BACKUP_ON_START;
    else process.env.FDESIGN_BACKUP_ON_START = prevOnStart;
  }
});

test('runStartupBackup 在主备份目录无权限时应自动回退到可写目录', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-backup-'));
  const projectRoot = path.join(tmpRoot, 'project');
  const outputRoot = path.join(tmpRoot, 'output');
  await fs.promises.mkdir(projectRoot, { recursive: true });
  await fs.promises.mkdir(outputRoot, { recursive: true });
  await fs.promises.writeFile(path.join(projectRoot, 'a.txt'), 'ok', 'utf8');

  const primaryBackupRoot = path.join(outputRoot, 'project_backups');
  const fallbackBackupRoot = path.join(tmpRoot, 'fallback_project_backups');

  const prevOnStart = process.env.FDESIGN_BACKUP_ON_START;
  const prevFallback = process.env.FDESIGN_BACKUP_FALLBACK_DIR;
  process.env.FDESIGN_BACKUP_ON_START = '1';
  process.env.FDESIGN_BACKUP_FALLBACK_DIR = fallbackBackupRoot;

  const rawMkdirSync = fs.mkdirSync;
  fs.mkdirSync = function patchedMkdirSync(target, options) {
    const abs = path.resolve(String(target || ''));
    if (abs === path.resolve(primaryBackupRoot) || abs.startsWith(path.resolve(primaryBackupRoot) + path.sep)) {
      const err = new Error(`EPERM: mock deny mkdir '${abs}'`);
      err.code = 'EPERM';
      throw err;
    }
    return rawMkdirSync.call(fs, target, options);
  };

  try {
    const out = runStartupBackup({ projectRoot, outputRoot });
    assert.equal(out.ok, true);
    assert.equal(out.skipped, false);
    assert.equal(path.resolve(out.backupRoot), path.resolve(fallbackBackupRoot));
    assert.equal(fs.existsSync(path.join(out.backupRoot, out.backupName)), true);
  } finally {
    fs.mkdirSync = rawMkdirSync;
    if (prevOnStart == null) delete process.env.FDESIGN_BACKUP_ON_START;
    else process.env.FDESIGN_BACKUP_ON_START = prevOnStart;
    if (prevFallback == null) delete process.env.FDESIGN_BACKUP_FALLBACK_DIR;
    else process.env.FDESIGN_BACKUP_FALLBACK_DIR = prevFallback;
  }
});

test('runStartupBackup 在主目录可访问但子目录无权限时仍应回退', async () => {
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fdesign-backup-'));
  const projectRoot = path.join(tmpRoot, 'project');
  const outputRoot = path.join(tmpRoot, 'output');
  await fs.promises.mkdir(projectRoot, { recursive: true });
  await fs.promises.mkdir(outputRoot, { recursive: true });
  await fs.promises.writeFile(path.join(projectRoot, 'a.txt'), 'ok', 'utf8');

  const primaryBackupRoot = path.join(outputRoot, 'project_backups');
  const fallbackBackupRoot = path.join(tmpRoot, 'fallback_project_backups');
  await fs.promises.mkdir(primaryBackupRoot, { recursive: true });

  const prevOnStart = process.env.FDESIGN_BACKUP_ON_START;
  const prevFallback = process.env.FDESIGN_BACKUP_FALLBACK_DIR;
  process.env.FDESIGN_BACKUP_ON_START = '1';
  process.env.FDESIGN_BACKUP_FALLBACK_DIR = fallbackBackupRoot;

  const rawMkdirSync = fs.mkdirSync;
  fs.mkdirSync = function patchedMkdirSync(target, options) {
    const abs = path.resolve(String(target || ''));
    const primaryAbs = path.resolve(primaryBackupRoot);
    if (abs.startsWith(primaryAbs + path.sep)) {
      const err = new Error(`EPERM: mock deny mkdir '${abs}'`);
      err.code = 'EPERM';
      throw err;
    }
    return rawMkdirSync.call(fs, target, options);
  };

  try {
    const out = runStartupBackup({ projectRoot, outputRoot });
    assert.equal(out.ok, true);
    assert.equal(path.resolve(out.backupRoot), path.resolve(fallbackBackupRoot));
    assert.equal(fs.existsSync(path.join(out.backupRoot, out.backupName)), true);
  } finally {
    fs.mkdirSync = rawMkdirSync;
    if (prevOnStart == null) delete process.env.FDESIGN_BACKUP_ON_START;
    else process.env.FDESIGN_BACKUP_ON_START = prevOnStart;
    if (prevFallback == null) delete process.env.FDESIGN_BACKUP_FALLBACK_DIR;
    else process.env.FDESIGN_BACKUP_FALLBACK_DIR = prevFallback;
  }
});
