import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildPreparedRunJsxSource,
  detectSilentNoopAfterPhotoshopRun,
  getRetryBudgetForPhotoshopError,
  tryPrepareRunJsx,
} from '../server/services/photoshopIngest.js';

test('仅有 VBS 日志时应识别为 Photoshop 静默吞任务', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_ps_run_'));
  const resultPath = path.join(dir, 'result.json');
  const jsxLogPath = path.join(dir, 'job.json.log');
  const jsxBatchLogPath = path.join(dir, 'job.json.task_0.log');
  const fatalLogPath = path.join(dir, 'job.json.fatal.log');

  assert.equal(
    detectSilentNoopAfterPhotoshopRun({
      fs,
      resultPath,
      jsxLogPath,
      jsxBatchLogPath,
      fatalLogPath,
    }),
    true,
  );
});

test('存在 result 文件时不应误判为 Photoshop 静默吞任务', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_ps_run_'));
  const resultPath = path.join(dir, 'result.json');
  const jsxLogPath = path.join(dir, 'job.json.log');
  const jsxBatchLogPath = path.join(dir, 'job.json.task_0.log');
  const fatalLogPath = path.join(dir, 'job.json.fatal.log');
  fs.writeFileSync(resultPath, '{"ok":true}', 'utf8');

  assert.equal(
    detectSilentNoopAfterPhotoshopRun({
      fs,
      resultPath,
      jsxLogPath,
      jsxBatchLogPath,
      fatalLogPath,
    }),
    false,
  );
});

test('存在 JSX 日志时不应误判为 Photoshop 静默吞任务', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_ps_run_'));
  const resultPath = path.join(dir, 'result.json');
  const jsxLogPath = path.join(dir, 'job.json.log');
  const jsxBatchLogPath = path.join(dir, 'job.json.task_0.log');
  const fatalLogPath = path.join(dir, 'job.json.fatal.log');
  fs.writeFileSync(jsxLogPath, 'SCRIPT_BUILD: demo', 'utf8');

  assert.equal(
    detectSilentNoopAfterPhotoshopRun({
      fs,
      resultPath,
      jsxLogPath,
      jsxBatchLogPath,
      fatalLogPath,
    }),
    false,
  );
});

test('silent noop 在全局重试为 0 时也至少应获得一次重试预算', () => {
  const err = new Error('silent_noop_after_vbs_success');
  assert.equal(getRetryBudgetForPhotoshopError(err, 0), 1);
});

test('buildPreparedRunJsxSource 应把 jobPath 注入到自包含 JSX 顶部', () => {
  const content = buildPreparedRunJsxSource({
    sourceText: '#target photoshop\nvar SCRIPT_BUILD = "demo";\nmain.apply(null, arguments);',
    jobPath: 'C:\\work\\job_1.json',
  });
  assert.ok(content.startsWith('#target photoshop\nvar __FDESIGN_JOB_PATH = "C:\\\\work\\\\job_1.json";\n'));
  assert.ok(content.includes('var SCRIPT_BUILD = "demo";'));
});

test('tryPrepareRunJsx 应产出带 jobPath 注入的临时运行脚本', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdesign_prepare_jsx_'));
  const src = path.join(dir, 'render_export.jsx');
  fs.writeFileSync(src, 'var SCRIPT_BUILD = "demo";\nmain.apply(null, arguments);', 'utf8');
  const prepared = tryPrepareRunJsx({ jsxPath: src, jobPath: path.join(dir, 'job.json'), label: 'export' });
  const content = fs.readFileSync(prepared.runJsxPath, 'utf8');
  assert.ok(content.includes('var __FDESIGN_JOB_PATH = '));
  assert.ok(content.includes('var SCRIPT_BUILD = "demo";'));
  prepared.cleanup();
  assert.equal(fs.existsSync(prepared.runJsxPath), false);
});

test('run_job.vbs 应优先执行带注入 jobPath 的自包含 JSX，并仅在回退时传参数', () => {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/run_job.vbs');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('If InStr(1, head, "__FDESIGN_JOB_PATH", vbTextCompare) > 0 Then'));
  assert.ok(content.includes('logFile.WriteLine "invokeMode=direct_with_injected_job_path"'));
  assert.ok(content.includes('Call appRef.DoJavaScriptFile(execScriptPath, Array(), 1)'));
  assert.ok(content.includes('Call appRef.DoJavaScriptFile(execScriptPath, Array(jobPath), 1)'));
  assert.ok(!content.includes('$.evalFile('));
});
