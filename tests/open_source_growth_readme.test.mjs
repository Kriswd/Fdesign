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

test('公开演示文档与社区素材应齐备', () => {
  [
    'docs/index.html',
    'docs/assets/fdesign-logo.svg',
    'docs/assets/fdesign-workbench-showcase.png',
    'docs/DEMO.md',
    'docs/demo-kit/README.md',
    'docs/demo-kit/sample-products.csv',
    'docs/demo-kit/field-map.example.json',
    'docs/demo-kit/image-manifest.json',
    'docs/demo-kit/images/FDX1001-C10-front.svg',
    'docs/ROADMAP.md',
    'docs/github/release-v3.0.0.md',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  });

  const demoKit = readText('docs/demo-kit/README.md');
  assert.ok(demoKit.includes('净化演示包'));
  assert.ok(demoKit.includes('synthetic demo data'));
  assert.ok(demoKit.includes('不包含私有模板、真实商品素材或运行产物'));

  const readme = readText('README.md');
  const launchDir = ['.', 'docs', 'launch'].join('/');
  assert.ok(readme.includes('[公开演示包](./docs/demo-kit/README.md)'));
  assert.equal(readme.includes(`${launchDir}/`), false);
});

test('GitHub Pages 项目页应提供可传播的 Star 转化入口', () => {
  const page = readText('docs/index.html');
  const readme = readText('README.md');

  assert.ok(page.includes('<title>闪图 Fdesign V3.0 - Excel 商品数据批量生成 PSD 成品</title>'));
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign'));
  assert.ok(page.includes('在 GitHub 查看并 Star'));
  assert.ok(page.includes('./assets/fdesign-logo.svg'));
  assert.ok(page.includes('./assets/fdesign-workbench-showcase.png'));
  assert.ok(page.includes('og:image'));
  assert.ok(page.indexOf('在 GitHub 查看并 Star') < page.indexOf('选购服务'));
  assert.ok(readme.includes('https://kriswd.github.io/Fdesign/'));
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
  assert.ok(setupScript.includes('https://kriswd.github.io/Fdesign/'));
  assert.ok(setupScript.includes('source[path]=/docs'));
  assert.ok(setupScript.includes('$pagesExitCode'));
  assert.ok(setupScript.includes('--enable-discussions'));
  assert.ok(setupScript.includes('photoshop-automation'));
  assert.ok(setupScript.includes('search/issues?q='));
  assert.ok(setupScript.includes('good first issue'));
  assert.ok(setupScript.includes('gh issue create'));
});
