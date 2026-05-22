import fs from 'fs';
import os from 'os';
import path from 'path';

function isTruthy(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function hasExplicitBackupSwitch() {
  if (!Object.prototype.hasOwnProperty.call(process.env, 'FDESIGN_BACKUP_ON_START')) return false;
  const raw = process.env.FDESIGN_BACKUP_ON_START;
  if (raw == null) return false;
  return String(raw).trim() !== '';
}

function isNodeWatchMode() {
  const args = Array.isArray(process.execArgv) ? process.execArgv : [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || '').trim();
    if (!arg) continue;
    if (arg === '--watch' || arg.startsWith('--watch=')) return true;
  }
  return false;
}

function safeMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function rmrf(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    try {
      if (fs.existsSync(targetPath)) fs.rmdirSync(targetPath, { recursive: true });
    } catch (e2) {
      void e2;
    }
  }
}

function shouldSkip(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (!norm || norm === '.') return false;
  const first = norm.split('/')[0];
  if (first === 'node_modules') return true;
  if (first === 'output') return true;
  if (first === 'dist') return true;
  if (first === '.git') return true;
  if (first === 'logs') return true;
  if (first === '.trae') return true;
  return false;
}

function copyRecursive(srcRoot, dstRoot, rel = '') {
  if (shouldSkip(rel)) return;
  const srcPath = rel ? path.join(srcRoot, rel) : srcRoot;
  const dstPath = rel ? path.join(dstRoot, rel) : dstRoot;
  const st = fs.statSync(srcPath);
  if (st.isDirectory()) {
    safeMkdir(dstPath);
    const entries = fs.readdirSync(srcPath, { withFileTypes: true });
    for (const e of entries) {
      const nextRel = rel ? path.join(rel, e.name) : e.name;
      if (shouldSkip(nextRel)) continue;
      copyRecursive(srcRoot, dstRoot, nextRel);
    }
    return;
  }
  if (st.isFile()) {
    safeMkdir(path.dirname(dstPath));
    fs.copyFileSync(srcPath, dstPath);
  }
}

function timestampDirName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function uniqueResolvedPaths(list) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i];
    if (!raw) continue;
    const abs = path.resolve(String(raw));
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

function buildErrorItem(targetPath, e) {
  return {
    path: targetPath,
    code: e && e.code ? String(e.code) : '',
    message: e && e.message ? String(e.message) : String(e),
  };
}

function runBackupOnRoot({ root, backupRoot, keep }) {
  safeMkdir(backupRoot);
  const backupName = timestampDirName();
  const dst = path.join(backupRoot, backupName);
  safeMkdir(dst);
  try {
    const startedAt = Date.now();
    copyRecursive(root, dst, '');
    const elapsedMs = Date.now() - startedAt;
    const dirs = listDirs(backupRoot).sort((a, b) => b.localeCompare(a));
    for (let i = keep; i < dirs.length; i += 1) {
      rmrf(path.join(backupRoot, dirs[i]));
    }
    return { backupRoot, backupName, elapsedMs };
  } catch (e) {
    rmrf(dst);
    throw e;
  }
}

export function runStartupBackup({ projectRoot, outputRoot } = {}) {
  if (!hasExplicitBackupSwitch() && isNodeWatchMode()) {
    return { ok: true, skipped: true, reason: 'watch_mode_default_skip' };
  }
  const enabled = isTruthy(process.env.FDESIGN_BACKUP_ON_START ?? '1');
  if (!enabled) return { ok: true, skipped: true, reason: 'disabled' };

  const keep = Number.isFinite(Number(process.env.FDESIGN_BACKUP_KEEP))
    ? Math.max(1, Math.min(20, Math.floor(Number(process.env.FDESIGN_BACKUP_KEEP))))
    : 3;

  const root = projectRoot ? path.resolve(projectRoot) : path.resolve(process.cwd());
  const out = outputRoot ? path.resolve(outputRoot) : path.resolve(root, 'output');
  const primaryBackupRoot = process.env.FDESIGN_BACKUP_DIR
    ? path.resolve(process.env.FDESIGN_BACKUP_DIR)
    : path.join(out, 'project_backups');
  const fallbackFromEnv = process.env.FDESIGN_BACKUP_FALLBACK_DIR
    ? path.resolve(process.env.FDESIGN_BACKUP_FALLBACK_DIR)
    : '';
  const fallbackFromOutput = path.join(out, 'project_backups_fallback');
  const fallbackFromTmp = path.join(os.tmpdir(), 'FdesignData', 'project_backups');
  const candidates = uniqueResolvedPaths([
    primaryBackupRoot,
    fallbackFromEnv,
    fallbackFromOutput,
    fallbackFromTmp,
  ]);
  const errors = [];
  let result = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const targetRoot = candidates[i];
    try {
      result = runBackupOnRoot({ root, backupRoot: targetRoot, keep });
      break;
    } catch (e) {
      errors.push(buildErrorItem(targetRoot, e));
    }
  }
  if (!result) {
    const err = new Error('backup_root_unwritable');
    err.details = errors;
    throw err;
  }
  if (errors.length > 0) {
    console.warn('[warn][startup-backup] backup root fallback', {
      picked: result.backupRoot,
      attempts: errors,
    });
  }

  return {
    ok: true,
    skipped: false,
    backupRoot: result.backupRoot,
    backupName: result.backupName,
    keep,
    elapsedMs: result.elapsedMs,
  };
}
