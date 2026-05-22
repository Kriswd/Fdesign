import path from 'path';

export function isPathInsideDir(dirPath, filePath) {
  const dirAbs = path.resolve(String(dirPath || ''));
  const fileAbs = path.resolve(String(filePath || ''));
  if (!dirAbs || !fileAbs) return false;
  const rel = path.relative(dirAbs, fileAbs);
  if (!rel) return true;
  if (rel === '.' || rel.startsWith(`..${path.sep}`) || rel === '..') return false;
  return true;
}

export function resolveOutputCandidatePaths({ outputRoot, candidates }) {
  const root = String(outputRoot || '').trim();
  const list = Array.isArray(candidates) ? candidates : [];
  const out = [];
  for (const c of list) {
    if (!c) continue;
    const s = String(c).trim();
    if (!s) continue;
    out.push(path.isAbsolute(s) ? s : root ? path.join(root, s) : s);
  }
  return out;
}

export function buildOutputLookupCandidates({ outputRoot, candidates }) {
  const normalized = resolveOutputCandidatePaths({ outputRoot, candidates });
  const out = [];
  const seen = new Set();
  for (const item of normalized) {
    const p = String(item || '').trim();
    if (!p) continue;
    const lower = p.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(p);
    }
    const ext = path.extname(p).toLowerCase();
    if (ext !== '.psd' && ext !== '.psb') continue;
    const alt = p.slice(0, -ext.length) + (ext === '.psd' ? '.psb' : '.psd');
    const altKey = alt.toLowerCase();
    if (seen.has(altKey)) continue;
    seen.add(altKey);
    out.push(alt);
  }
  return out;
}

export function pickFirstExistingPath({ fs, candidates }) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const p of list) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      continue;
    }
  }
  return null;
}

function isExistingFileBySize({ fs, filePath, minBytes }) {
  try {
    if (!filePath) return false;
    if (!fs.existsSync(filePath)) return false;
    if (!Number.isFinite(minBytes) || minBytes <= 0) return true;
    const st = fs.statSync(filePath);
    return Boolean(st && typeof st.isFile === 'function' && st.isFile() && Number(st.size) >= minBytes);
  } catch {
    return false;
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export async function waitForFirstExistingPath({
  fs,
  candidates,
  maxWaitMs = 2500,
  pollIntervalMs = 120,
  minBytes = 1,
}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const deadline = Date.now() + Math.max(0, Number(maxWaitMs) || 0);
  const interval = Math.max(10, Number(pollIntervalMs) || 10);
  const sizeThreshold = Number.isFinite(Number(minBytes)) ? Math.max(0, Number(minBytes)) : 0;
  while (Date.now() <= deadline) {
    for (const p of list) {
      if (!p) continue;
      if (isExistingFileBySize({ fs, filePath: p, minBytes: sizeThreshold })) return p;
    }
    if (Date.now() >= deadline) break;
    await sleepMs(interval);
  }
  return null;
}

export function buildTemplateFileUrl({ outputRoot, templateId, absPath }) {
  const tplDir = path.join(String(outputRoot || ''), 'templates', String(templateId || ''));
  if (!isPathInsideDir(tplDir, absPath)) return null;
  const rel = path.relative(tplDir, absPath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return null;
  return `/templates/${templateId}/${rel}`;
}
