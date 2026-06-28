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

test('公开仓库不应公开内部推广文档或增长执行脚本', () => {
  const launchDir = ['docs', 'launch'].join('/');
  const internalPlansDir = ['docs', 'superpowers'].join('/');

  assert.equal(fileExists('scripts/capture_github_growth_metrics.ps1'), false);
  assert.equal(fileExists('scripts/setup_github_growth.ps1'), false);
  assert.equal(fileExists('docs/OPEN_SOURCE_CHECKLIST.md'), false);
  assert.equal(fileExists('docs/DEV_LOG.md'), false);
  assert.equal(fileExists('docs/PROMOTION_KIT_CN.md'), false);
  assert.equal(fileExists(launchDir), false);
  assert.equal(fileExists(internalPlansDir), false);
});

test('公开 README 不应暴露内部推广入口', () => {
  const launchDir = ['docs', 'launch'].join('/');
  const readme = readText('README.md');
  const gitignore = readText('.gitignore');

  assert.equal(readme.includes(launchDir), false);
  assert.equal(readme.includes('docs/PROMOTION_KIT_CN.md'), false);
  assert.equal(readme.includes('docs/OPEN_SOURCE_CHECKLIST.md'), false);
  assert.equal(readme.includes('docs/DEV_LOG.md'), false);
  assert.equal(readme.includes('国内推广作战手册'), false);
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
