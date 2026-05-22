import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import CleanupService from '../server/services/cleanupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputRoot = path.join(__dirname, '../output');
const templatesDir = path.join(outputRoot, 'templates');

function isSafeTemplateId(templateId) {
  return typeof templateId === 'string' && /^[0-9a-f]{16}$/i.test(templateId);
}

function shouldDeleteExportMetaFile(name) {
  const s = String(name || '');
  if (!s) return false;
  if (/^job_(batch_|bundle_|vars_)?\d+\.json$/i.test(s)) return true;
  if (/^result_(batch_|bundle_|vars_)?\d+\.json$/i.test(s)) return true;
  if (/\.json\.(vbs\.log|log)$/i.test(s)) return true;
  if (/\.json\.task_\d+\.log$/i.test(s)) return true;
  if (/^run_.*\.jsx$/i.test(s)) return true;
  return false;
}

function parseArgs(argv) {
  const out = {
    inputsExpiryHours: 6,
    exportsMetaExpiryHours: 72,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--inputs-expiry-hours' && argv[i + 1]) {
      out.inputsExpiryHours = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (a === '--exports-meta-expiry-hours' && argv[i + 1]) {
      out.exportsMetaExpiryHours = Number(argv[i + 1]);
      i += 1;
      continue;
    }
  }
  return out;
}

function safeNumber(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

async function statSafe(fp) {
  try {
    return await fs.promises.stat(fp);
  } catch {
    return null;
  }
}

async function summarizeCandidates({ inputsCutoff, exportsCutoff }) {
  const summary = {
    templatesScanned: 0,
    inputs: { totalFiles: 0, totalBytes: 0, deleteFiles: 0, deleteBytes: 0 },
    exportsMeta: { totalFiles: 0, totalBytes: 0, deleteFiles: 0, deleteBytes: 0 },
  };

  if (!fs.existsSync(templatesDir)) return summary;
  const templateIds = await fs.promises.readdir(templatesDir);
  for (const templateId of templateIds) {
    if (!isSafeTemplateId(templateId)) continue;
    summary.templatesScanned += 1;
    const templateDir = path.join(templatesDir, templateId);
    const inputsDir = path.join(templateDir, 'inputs');
    const exportsDir = path.join(templateDir, 'exports');

    if (fs.existsSync(inputsDir)) {
      const rows = await fs.promises.readdir(inputsDir, { withFileTypes: true }).catch(() => []);
      for (const it of rows) {
        const fp = path.join(inputsDir, it.name);
        const st = await statSafe(fp);
        if (!st) continue;
        summary.inputs.totalFiles += 1;
        summary.inputs.totalBytes += Number(st.size) || 0;
        if (Number(st.mtimeMs) < inputsCutoff) {
          summary.inputs.deleteFiles += 1;
          summary.inputs.deleteBytes += Number(st.size) || 0;
        }
      }
    }

    if (fs.existsSync(exportsDir)) {
      const rows = await fs.promises.readdir(exportsDir, { withFileTypes: true }).catch(() => []);
      for (const it of rows) {
        if (!it.isFile()) continue;
        if (!shouldDeleteExportMetaFile(it.name)) continue;
        const fp = path.join(exportsDir, it.name);
        const st = await statSafe(fp);
        if (!st) continue;
        summary.exportsMeta.totalFiles += 1;
        summary.exportsMeta.totalBytes += Number(st.size) || 0;
        if (Number(st.mtimeMs) < exportsCutoff) {
          summary.exportsMeta.deleteFiles += 1;
          summary.exportsMeta.deleteBytes += Number(st.size) || 0;
        }
      }
    }
  }
  return summary;
}

function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const inputsExpiryHours = safeNumber(args.inputsExpiryHours, 6);
  const exportsMetaExpiryHours = safeNumber(args.exportsMetaExpiryHours, 72);
  const inputsCutoff = Date.now() - inputsExpiryHours * 60 * 60 * 1000;
  const exportsCutoff = Date.now() - exportsMetaExpiryHours * 60 * 60 * 1000;

  console.log('--- Export Artifacts Cleanup ---');
  console.log(`Output root: ${outputRoot}`);
  console.log(`Inputs expiry hours: ${inputsExpiryHours}`);
  console.log(`Exports meta expiry hours: ${exportsMetaExpiryHours}`);

  const before = await summarizeCandidates({ inputsCutoff, exportsCutoff });
  console.log('[Before] Templates scanned:', before.templatesScanned);
  console.log('[Before] inputs:', {
    totalFiles: before.inputs.totalFiles,
    totalSize: formatBytes(before.inputs.totalBytes),
    toDeleteFiles: before.inputs.deleteFiles,
    toDeleteSize: formatBytes(before.inputs.deleteBytes),
  });
  console.log('[Before] exports meta:', {
    totalFiles: before.exportsMeta.totalFiles,
    totalSize: formatBytes(before.exportsMeta.totalBytes),
    toDeleteFiles: before.exportsMeta.deleteFiles,
    toDeleteSize: formatBytes(before.exportsMeta.deleteBytes),
  });

  const svc = new CleanupService({ outputRoot });
  await svc.cleanupExportArtifacts({ inputsExpiryHours, exportsMetaExpiryHours });

  const after = await summarizeCandidates({ inputsCutoff, exportsCutoff });
  console.log('[After] inputs:', {
    totalFiles: after.inputs.totalFiles,
    totalSize: formatBytes(after.inputs.totalBytes),
    stillDeletableFiles: after.inputs.deleteFiles,
    stillDeletableSize: formatBytes(after.inputs.deleteBytes),
  });
  console.log('[After] exports meta:', {
    totalFiles: after.exportsMeta.totalFiles,
    totalSize: formatBytes(after.exportsMeta.totalBytes),
    stillDeletableFiles: after.exportsMeta.deleteFiles,
    stillDeletableSize: formatBytes(after.exportsMeta.deleteBytes),
  });
  console.log('Done.');
}

run().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
