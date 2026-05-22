import fs from 'node:fs';
import path from 'node:path';
import PhotoshopIngestService from '../services/photoshopIngest.js';

function readJsonIfExists(fp) {
  try {
    if (!fp) return null;
    const p = String(fp);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function logSection(title) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

const templateId = process.argv[2];
if (!templateId) {
  process.stderr.write('用法: node server/scripts/diagnose_psd_2gb.mjs <templateId>\n');
  process.exit(2);
}

const outputRoot = path.resolve('./output');
const svc = new PhotoshopIngestService({ outputRoot });

const templateDir = path.join(outputRoot, 'templates', templateId);
const sampleInput = fs.existsSync(path.join(templateDir, 'inputs'))
  ? fs
      .readdirSync(path.join(templateDir, 'inputs'))
      .map((n) => path.join(templateDir, 'inputs', n))
      .find((p) => /\.(png|jpg|jpeg|webp)$/i.test(p))
  : null;

async function runCase(label, payload) {
  logSection(label);
  try {
    const res = await svc.exportTemplate(payload);
    process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
    return { ok: true, res };
  } catch (e) {
    const err = e && e.message ? String(e.message) : String(e);
    process.stdout.write(`${JSON.stringify({ ok: false, message: err, jobPath: e?.jobPath || null, resultPath: e?.resultPath || null, scriptBuild: e?.scriptBuild || null }, null, 2)}\n`);
    const parsed = readJsonIfExists(e?.resultPath);
    if (parsed) {
      process.stdout.write(`result.json 摘要: ${JSON.stringify({ ok: parsed.ok, outputFormat: parsed.outputFormat || null, warnings: parsed.warnings || [], errors: parsed.errors || [] }, null, 2)}\n`);
    }
    return { ok: false, err };
  }
}

await runCase('Case A: 仅文本更新导出 PSD', {
  templateId,
  updates: [{ varType: 'text', psId: 299, name: '诊断文本', value: `diag_${Date.now()}`, align: 'left' }],
  variables: [],
  format: 'psd',
  quality: 100,
  dryRun: false,
  isPsdAutoFill: false,
});

if (sampleInput) {
  await runCase('Case B: 仅图片更新导出 PSD（使用 templates/{id}/inputs 下的样本图）', {
    templateId,
    updates: [{ varType: 'img', psId: 2841, name: '诊断图片', imagePath: sampleInput }],
    variables: [],
    format: 'psd',
    quality: 100,
    dryRun: false,
    isPsdAutoFill: true,
  });
} else {
  logSection('Case B: 跳过（未找到 inputs 样本图）');
}

