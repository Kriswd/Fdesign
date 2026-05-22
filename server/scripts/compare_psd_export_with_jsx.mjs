import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function usage() {
  process.stderr.write('用法: node server/scripts/compare_psd_export_with_jsx.mjs <templateId> <label> <jsxPath> [psd|png|jpeg] [vbsPath]\n');
  process.exit(2);
}

const templateId = process.argv[2];
const label = process.argv[3];
const jsxPath = process.argv[4];
const formatArg = (process.argv[5] || 'psd').toLowerCase();
const format = formatArg === 'png' ? 'png' : formatArg === 'jpeg' || formatArg === 'jpg' ? 'jpeg' : 'psd';
const vbsArg = process.argv[6] || null;
if (!templateId || !label || !jsxPath) usage();

const outputRoot = path.resolve('./output');
const templateDir = path.join(outputRoot, 'templates', String(templateId));
const exportsDir = path.join(templateDir, 'exports');
const psdPath = path.join(templateDir, 'source.psd');

if (!fs.existsSync(psdPath)) {
  throw new Error(`模板 PSD 不存在: ${psdPath}`);
}
fs.mkdirSync(exportsDir, { recursive: true });

const ts = Date.now();
const jobPath = path.join(exportsDir, `job_compare_${label}_${ts}.json`);
const resultPath = path.join(exportsDir, `result_compare_${label}_${ts}.json`);
const outExt = format === 'png' ? 'png' : format === 'jpeg' ? 'jpg' : 'psd';
const outputPath = path.join(exportsDir, `export_compare_${label}_${ts}.${outExt}`);

const job = {
  templateId: String(templateId),
  psdPath,
  outputPath,
  format,
  quality: 100,
  updates: [
    {
      varType: 'text',
      psId: 299,
      name: 'compare_text',
      value: `compare_${label}_${ts}`,
      align: 'left',
    },
  ],
  mode: 'single',
  quitAfter: false,
  resultPath,
};

fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');

const vbsPath = vbsArg ? path.resolve(String(vbsArg)) : path.resolve('./server/photoshop/run_job.vbs');
if (!fs.existsSync(vbsPath)) throw new Error(`VBS 不存在: ${vbsPath}`);
if (!fs.existsSync(jsxPath)) throw new Error(`JSX 不存在: ${jsxPath}`);

execFileSync('cscript.exe', ['//Nologo', vbsPath, jsxPath, jobPath], {
  windowsHide: true,
  stdio: 'inherit',
  timeout: 15 * 60 * 1000,
});

const resultExists = fs.existsSync(resultPath);
const outputExists = fs.existsSync(outputPath);
const raw = resultExists ? fs.readFileSync(resultPath, 'utf8') : '';
const parsed = raw ? JSON.parse(raw) : null;
const jobLogPath = `${jobPath}.log`;
const jobLogExists = fs.existsSync(jobLogPath);
const jobLogTail = jobLogExists ? String(fs.readFileSync(jobLogPath, 'utf8')).trim().slice(-800) : null;
const summary = {
  jobPath,
  resultPath,
  outputPath,
  format,
  resultExists,
  outputExists,
  ok: parsed?.ok === true,
  outputFormat: parsed?.outputFormat ?? null,
  warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
  scriptBuild: parsed?.scriptBuild ?? null,
  errorTop: Array.isArray(parsed?.errors) && parsed.errors.length > 0 ? parsed.errors[0] : null,
  jobLogTail,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
