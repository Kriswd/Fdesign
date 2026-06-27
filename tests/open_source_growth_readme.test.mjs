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
    'docs/robots.txt',
    'docs/sitemap.xml',
    'docs/assets/fdesign-logo.svg',
    'docs/assets/fdesign-social-card.png',
    'docs/assets/fdesign-workbench-showcase.png',
    'docs/DEMO.md',
    'docs/QUICKSTART_CN.md',
    'docs/TROUBLESHOOTING_CN.md',
    'docs/SHOWCASE_GUIDE.md',
    'docs/FAQ.md',
    'docs/demo-kit/README.md',
    'docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md',
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
  const minimalPsdGuide = readText('docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md');
  const quickstart = readText('docs/QUICKSTART_CN.md');
  const troubleshooting = readText('docs/TROUBLESHOOTING_CN.md');
  const faq = readText('docs/FAQ.md');
  const showcaseGuide = readText('docs/SHOWCASE_GUIDE.md');
  assert.ok(demoKit.includes('净化演示包'));
  assert.ok(demoKit.includes('synthetic demo data'));
  assert.ok(demoKit.includes('不包含私有模板、真实商品素材或运行产物'));
  assert.ok(demoKit.includes('[最小 PSD 模板制作教程](./MINIMAL_PSD_TEMPLATE_CN.md)'));
  assert.ok(minimalPsdGuide.includes('最小 PSD 模板制作教程'));
  assert.ok(minimalPsdGuide.includes('hero_image'));
  assert.ok(minimalPsdGuide.includes('sample-products.csv'));
  assert.ok(minimalPsdGuide.includes('不要把这个文件提交到公开仓库'));
  assert.ok(quickstart.includes('npm config set registry https://registry.npmmirror.com'));
  assert.ok(quickstart.includes('[最小 PSD 模板制作教程](./demo-kit/MINIMAL_PSD_TEMPLATE_CN.md)'));
  assert.ok(quickstart.includes('http://127.0.0.1:3001/health'));
  assert.ok(quickstart.includes('不包含真实商品图、客户数据、账号信息、订单信息或私有 PSD'));
  assert.ok(troubleshooting.includes('Fdesign 中文排障清单'));
  assert.ok(troubleshooting.includes('npm config set registry https://registry.npmmirror.com'));
  assert.ok(troubleshooting.includes('Photoshop 导出失败'));
  assert.ok(troubleshooting.includes('不要公开私有 PSD、客户资料、订单、报价'));
  assert.ok(faq.includes('Windows 10/11 x64'));
  assert.ok(faq.includes('[中文快速试跑](./QUICKSTART_CN.md)'));
  assert.ok(faq.includes('[中文排障清单](./TROUBLESHOOTING_CN.md)'));
  assert.ok(faq.includes('field-map.example.json'));
  assert.ok(showcaseGuide.includes('Fdesign 净化案例提交指南'));
  assert.ok(showcaseGuide.includes('不要提交什么'));
  assert.ok(showcaseGuide.includes('Template showcase issue'));

  const readme = readText('README.md');
  const launchDir = ['.', 'docs', 'launch'].join('/');
  assert.ok(readme.includes('[中文快速试跑](./docs/QUICKSTART_CN.md)'));
  assert.ok(readme.includes('[公开演示包](./docs/demo-kit/README.md)'));
  assert.ok(readme.includes('[最小 PSD 模板制作教程](./docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md)'));
  assert.ok(readme.includes('[中文排障清单](./docs/TROUBLESHOOTING_CN.md)'));
  assert.ok(readme.includes('[净化案例提交指南](./docs/SHOWCASE_GUIDE.md)'));
  assert.ok(readme.includes('[FAQ](./docs/FAQ.md)'));
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
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign/tree/main/docs/demo-kit'));
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign/blob/main/docs/QUICKSTART_CN.md'));
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign/blob/main/docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md'));
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign/blob/main/docs/DEMO.md'));
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign/blob/main/docs/TROUBLESHOOTING_CN.md'));
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign/blob/main/docs/SHOWCASE_GUIDE.md'));
  assert.ok(page.includes('https://github.com/Kriswd/Fdesign/blob/main/docs/FAQ.md'));
  assert.ok(page.includes('先用公开演示包看懂字段绑定'));
  assert.equal(page.includes('./DEMO.html'), false);
  assert.ok(page.includes('og:image'));
  assert.ok(page.includes('https://kriswd.github.io/Fdesign/assets/fdesign-social-card.png'));
  assert.ok(page.includes('<link rel="canonical" href="https://kriswd.github.io/Fdesign/">'));
  assert.ok(page.includes('name="keywords"'));
  assert.ok(page.includes('PSD批量生成'));
  assert.ok(page.includes('application/ld+json'));
  assert.ok(page.includes('"@type": "SoftwareApplication"'));
  assert.ok(page.includes('twitter:card'));
  assert.ok(page.indexOf('在 GitHub 查看并 Star') < page.indexOf('选购服务'));
  assert.ok(readme.includes('https://kriswd.github.io/Fdesign/'));

  const robots = readText('docs/robots.txt');
  const sitemap = readText('docs/sitemap.xml');
  assert.ok(robots.includes('Sitemap: https://kriswd.github.io/Fdesign/sitemap.xml'));
  assert.ok(sitemap.includes('<loc>https://kriswd.github.io/Fdesign/</loc>'));
  assert.ok(sitemap.includes('<lastmod>2026-06-28</lastmod>'));
});

test('GitHub 社区入口与设置脚本应可重复执行', () => {
  [
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml',
    '.github/ISSUE_TEMPLATE/template_showcase.yml',
    '.github/ISSUE_TEMPLATE/quickstart_feedback.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.github/DISCUSSION_TEMPLATE/show-and-tell.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'CODE_OF_CONDUCT.md',
    'scripts/setup_github_growth.ps1',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  });

  const conduct = readText('CODE_OF_CONDUCT.md');
  const prTemplate = readText('.github/PULL_REQUEST_TEMPLATE.md');
  assert.ok(conduct.includes('private PSD assets'));
  assert.ok(conduct.includes('fake stars'));
  assert.ok(prTemplate.includes('Public Data Check'));
  assert.ok(prTemplate.includes('No private PSD templates'));

  const setupScript = readText('scripts/setup_github_growth.ps1');
  assert.ok(setupScript.includes('gh repo edit Kriswd/Fdesign'));
  assert.ok(setupScript.includes('https://kriswd.github.io/Fdesign/'));
  assert.ok(setupScript.includes('source[path]=/docs'));
  assert.ok(setupScript.includes('$pagesExitCode'));
  assert.ok(setupScript.includes('--enable-discussions'));
  assert.ok(setupScript.includes('photoshop-automation'));
  assert.ok(setupScript.includes('search/issues?q='));
  assert.ok(setupScript.includes('good first issue'));
  assert.ok(setupScript.includes('quickstart-feedback'));
  assert.ok(setupScript.includes('Quickstart CN feedback: Windows + Photoshop'));
  assert.ok(setupScript.includes('issues/new?template=quickstart_feedback.yml'));
  assert.ok(setupScript.includes('gh issue create'));

  const quickstartTemplate = readText('.github/ISSUE_TEMPLATE/quickstart_feedback.yml');
  const showcaseTemplate = readText('.github/ISSUE_TEMPLATE/template_showcase.yml');
  const showAndTell = readText('.github/DISCUSSION_TEMPLATE/show-and-tell.md');
  assert.ok(quickstartTemplate.includes('中文快速试跑反馈'));
  assert.ok(quickstartTemplate.includes('quickstart-feedback'));
  assert.ok(quickstartTemplate.includes('127.0.0.1:3001/health'));
  assert.ok(quickstartTemplate.includes('真实 PSD 模板、真实商品图、客户数据、订单信息'));
  assert.ok(showcaseTemplate.includes('SHOWCASE_GUIDE.md'));
  assert.ok(showcaseTemplate.includes('Public safety check'));
  assert.ok(showcaseTemplate.includes('PSD variables'));
  assert.ok(showAndTell.includes('Sanitization guide'));
  assert.ok(showAndTell.includes('## PSD variables'));
});
