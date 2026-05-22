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

test('package.json 与 lockfile 版本应升级为 3.0', () => {
  const pkg = JSON.parse(readText('package.json'));
  const lock = JSON.parse(readText('package-lock.json'));

  assert.equal(pkg.version, '3.0');
  assert.equal(lock.version, '3.0');
  assert.equal(lock.packages[''].version, '3.0');
});

test('产品标题与工作台标题应展示 V3.0', () => {
  const indexHtml = readText('index.html');
  const mainEntry = readText('src/main.jsx');
  const appMeta = readText('src/config/appMeta.js');
  const workbenchPage = readText('src/pages/WorkbenchPage.jsx');
  const workbenchTabs = readText('src/pages/WorkbenchTabsPage.jsx');
  const batchProductImage = readText('src/pages/Workbench/BatchProductImageTab.jsx');

  assert.ok(appMeta.includes("APP_VERSION = '3.0'"));
  assert.ok(appMeta.includes("APP_VERSION_LABEL = 'V3.0'"));
  assert.ok(indexHtml.includes('<title>闪图 V3.0</title>'));
  assert.ok(indexHtml.includes("document.title = '闪图 V3.0 - 启动失败';"));
  assert.ok(mainEntry.includes("APP_TITLE_CRASH"));
  assert.ok(mainEntry.includes("APP_TITLE_DEFAULT"));
  assert.ok(workbenchPage.includes('APP_DISPLAY_NAME'));
  assert.ok(workbenchTabs.includes('APP_DISPLAY_NAME'));
  assert.ok(batchProductImage.includes('APP_TITLE_DEFAULT'));
});

test('启动脚本应展示 V3.0', () => {
  const releaseBat = readText('start_release.bat');
  const launcherBat = readText('start.bat');

  assert.ok(releaseBat.includes('Fdesign V3.0'));
  assert.ok(launcherBat.includes('Fdesign V3.0 Launcher'));
});

test('浏览器图标与首页左上角应使用产品 Logo', () => {
  const indexHtml = readText('index.html');
  const logoSvg = readText('public/fdesign-logo.svg');
  const brandLogo = readText('src/components/BrandLogo.jsx');
  const workbenchPage = readText('src/pages/WorkbenchPage.jsx');
  const workbenchTabs = readText('src/pages/WorkbenchTabsPage.jsx');

  assert.ok(indexHtml.includes('<link rel="icon" type="image/svg+xml" href="/fdesign-logo.svg" />'));
  assert.ok(logoSvg.includes('viewBox="0 0 256 256"'));
  assert.ok(brandLogo.includes("src={APP_LOGO_SRC}"));
  assert.ok(workbenchPage.includes('<BrandLogo />'));
  assert.ok(workbenchTabs.includes('<BrandLogo />'));
});

test('后台健康检查应暴露 3.0 应用版本', () => {
  const serverIndex = readText('server/index.js');

  assert.ok(serverIndex.includes('const APP_VERSION'));
  assert.ok(serverIndex.includes('version: APP_VERSION'));
});

test('开源发布不应保留脚手架默认资产，且 lockfile 与环境文件规则明确', () => {
  const pkg = JSON.parse(readText('package.json'));
  const ignore = readText('.gitignore');
  const ignoreLines = ignore.split(/\r?\n/g).map((line) => line.trim());

  assert.notEqual(pkg.private, true);
  assert.equal(fileExists('public/vite.svg'), false);
  assert.equal(fileExists('src/assets/react.svg'), false);
  assert.equal(fileExists('src/App.css'), false);
  assert.equal(ignoreLines.includes('package-lock.json'), false);
  assert.ok(ignoreLines.includes('.env*'));
  assert.ok(ignoreLines.includes('!.env.example'));
});

test('公开仓库应保留协作入口并移除风险资料', () => {
  const pkg = JSON.parse(readText('package.json'));
  const readme = readText('README.md');
  const envExample = readText('.env.example');

  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.scripts['gen:quote-docx'], undefined);
  assert.equal(pkg.devDependencies.docx, undefined);
  assert.ok(fileExists('LICENSE'));
  assert.ok(fileExists('CONTRIBUTING.md'));
  assert.ok(fileExists('SECURITY.md'));
  assert.ok(envExample.includes('ADMIN_AUTH_SECRET='));
  assert.ok(readme.includes('LICENSE'));
  assert.equal(readme.includes('正式公开前仍需要'), false);

  [
    'docs/PROJECT_PROPOSAL.md',
    'git_log.txt',
    'scripts/generate_pricing_basis_docx.mjs',
    'scripts/generate_quote_docx.mjs',
    'server/services/PsdAutoFillTab.zip',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), false, `${relPath} 不应进入公开仓库`);
  });
});

test('开源说明应包含 V3.0 启动地址与待办清单', () => {
  const readme = readText('README.md');
  const checklist = readText('docs/OPEN_SOURCE_CHECKLIST.md');
  const changelog = readText('CHANGELOG_V3.0.md');

  assert.ok(readme.includes('闪图 Fdesign V3.0'));
  assert.ok(readme.includes('http://127.0.0.1:3010/'));
  assert.ok(readme.includes('http://127.0.0.1:3001/health'));
  assert.ok(checklist.includes('开源前必须确认'));
  assert.ok(checklist.includes('LICENSE'));
  assert.ok(changelog.includes('闪图 Fdesign V3.0'));
});

test('发布启动脚本必须使用 CRLF 换行，避免双击闪退', () => {
  const filePath = path.resolve(process.cwd(), 'start_release.bat');
  const content = fs.readFileSync(filePath);
  assert.ok(content.includes(Buffer.from('\r\n')));
  assert.equal(content.includes(Buffer.from('\n')) && !content.includes(Buffer.from('\r\n')), false);
});
