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

test('README 首屏应采用电商生产结果导向定位', () => {
  const readme = readText('README.md');
  const headline = '把 Excel 商品数据，一键变成批量 PSD 成品';

  assert.ok(readme.includes('# 闪图 Fdesign V3.0'));
  assert.ok(readme.includes(headline));
  assert.ok(readme.includes('Turns Excel product data into batch PSD deliverables'));
  assert.ok(readme.includes('![闪图 Fdesign 工作台](./public/screenshots/fdesign-workbench-showcase.png)'));
  assert.ok(readme.includes('1. 导入 PSD 模板'));
  assert.ok(readme.includes('2. 绑定 Excel 字段与商品图'));
  assert.ok(readme.includes('3. 批量导出 PSD / PSB / PNG / JPEG'));
  assert.ok(readme.includes('如果 Fdesign 帮你少做重复图，欢迎给仓库点一个 Star'));
});

test('README 应把店铺入口保持为次级服务入口', () => {
  const readme = readText('README.md');
  const quickStartIndex = readme.indexOf('## 快速开始');
  const shopIndex = readme.indexOf('## 服务入口');

  assert.ok(quickStartIndex > -1);
  assert.ok(shopIndex > quickStartIndex);
  assert.ok(readme.includes('VITE_SHOP_URL=https://pay.ldxp.cn/shop/FTIWLFHQ'));
  assert.ok(readme.includes('开源功能可直接本地运行；需要模板定制、部署协助或成品服务时，再使用店铺入口。'));
});

test('公开增长文档与发布素材应齐备', () => {
  [
    'docs/DEMO.md',
    'docs/ROADMAP.md',
    'docs/launch/copy-benchmark.md',
    'docs/launch/Fdesign_V3_launch_kit.md',
    'docs/github/release-v3.0.0.md',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  });

  const launchKit = readText('docs/launch/Fdesign_V3_launch_kit.md');
  assert.ok(launchKit.includes('国内电商设计师/运营首发'));
  assert.ok(launchKit.includes('Star 转化复盘'));
  assert.ok(launchKit.includes('English short summary'));

  const benchmark = readText('docs/launch/copy-benchmark.md');
  assert.ok(benchmark.includes('Bjango-Actions'));
  assert.ok(benchmark.includes('Proxyshop'));
  assert.ok(benchmark.includes('Batch Mockup Smart Object Replacement'));
});

test('GitHub 社区入口与设置脚本应可重复执行', () => {
  [
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml',
    '.github/ISSUE_TEMPLATE/template_showcase.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.github/DISCUSSION_TEMPLATE/show-and-tell.md',
    'scripts/setup_github_growth.ps1',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  });

  const setupScript = readText('scripts/setup_github_growth.ps1');
  assert.ok(setupScript.includes('gh repo edit Kriswd/Fdesign'));
  assert.ok(setupScript.includes('--enable-discussions'));
  assert.ok(setupScript.includes('photoshop-automation'));
  assert.ok(setupScript.includes('search/issues?q='));
  assert.ok(setupScript.includes('good first issue'));
  assert.ok(setupScript.includes('gh issue create'));
});
