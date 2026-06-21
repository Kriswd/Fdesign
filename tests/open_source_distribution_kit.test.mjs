import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(relPath) {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.resolve(process.cwd(), relPath));
}

test('公开仓库应只保留指标脚本，不公开内部推广文档', () => {
  const launchDir = ['docs', 'launch'].join('/');
  const internalPlansDir = ['docs', 'superpowers'].join('/');

  assert.equal(fileExists('scripts/capture_github_growth_metrics.ps1'), true);
  assert.equal(fileExists(launchDir), false);
  assert.equal(fileExists(internalPlansDir), false);
});

test('公开 README 和检查清单不应暴露内部推广入口', () => {
  const launchDir = ['docs', 'launch'].join('/');
  const readme = readText('README.md');
  const checklist = readText('docs/OPEN_SOURCE_CHECKLIST.md');
  const gitignore = readText('.gitignore');

  assert.equal(readme.includes(launchDir), false);
  assert.equal(readme.includes('国内推广作战手册'), false);
  assert.equal(checklist.includes(launchDir), false);
  assert.ok(checklist.includes('内部运营、渠道排期、发布文案和复盘资料不得提交到公开仓库'));
  assert.ok(gitignore.includes('private/'));
  assert.ok(gitignore.includes(`${launchDir}/`));
});

test('公开演示包应提供净化数据、字段映射和示例图片', () => {
  const csv = readText('docs/demo-kit/sample-products.csv');
  const fieldMap = JSON.parse(readText('docs/demo-kit/field-map.example.json'));
  const manifest = JSON.parse(readText('docs/demo-kit/image-manifest.json'));

  assert.ok(csv.includes('FDX1001-C10'));
  assert.equal(fieldMap.template, 'fdesign-public-demo');
  assert.equal(fieldMap.textVariables.model_no, 'style_no');
  assert.ok(manifest.images.every((image) => fileExists(`docs/demo-kit/${image.path}`)));
});

test('GitHub 增长指标脚本应采集 Star、流量、Release 和 Pages 状态', () => {
  const script = readText('scripts/capture_github_growth_metrics.ps1');

  assert.ok(script.includes("repos/$Repo/traffic/$Endpoint"));
  assert.ok(script.includes("popular/referrers"));
  assert.ok(script.includes("popular/paths"));
  assert.ok(script.includes("stargazerCount"));
  assert.ok(script.includes("repos/$Repo/pages"));
  assert.ok(script.includes("repos/$Repo/releases/latest"));
  assert.ok(script.includes("output/github-growth-metrics"));
  assert.ok(script.includes("ConvertTo-Json -Depth 30"));
});
