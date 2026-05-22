import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildArtboardRenameMap } from '../server/utils/templateMeta.js';

test('导出接口错误响应透传 dupImageGuideMismatch 与 code', () => {
  const filePath = path.resolve(process.cwd(), 'server/index.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('dupImageGuideMismatch'));
  assert.ok(content.includes('code'));
});

test('PSD 自动填充导出允许 assets/images 且使用目录内路径校验', () => {
  const filePath = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes("path.join(this.outputRoot, 'assets', 'images')"));
  assert.ok(content.includes('isPathInsideDir(base, resolvedSrc)'));
});

test('批量导出默认 quality 应为 100', () => {
  const filePath = path.resolve(process.cwd(), 'server/index.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('Number(req.body?.quality) || 100'));
});

test('PSD自动填充应对 PNG/JPEG 也启用内容边缘对齐与更高保真预缩放', () => {
  const filePath = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes("(safeFormat === 'psd' || safeFormat === 'psb')"));
  assert.ok(content.includes('maxScaleFactor: 3'));
});

test('根据 manifest 变量 path 构建画板重命名映射（psId 键，sourceName 优先）', () => {
  const variables = [
    { psId: 101, name: '画板A', path: '画板A/组/图层1' },
    { psId: 102, name: '画板A', path: '画板A/组/图层2' },
    { psId: 201, name: '画板B', path: '画板B/组/图层3' },
  ];
  const updates = [
    { psId: 102, varType: 'img', sourceName: '主图A_最终版.png', imagePath: '/x/AA.jpg' },
    { psId: 101, varType: 'img', sourceName: '不会生效.jpg', imagePath: '/x/AA_2.jpg' },
    { psId: 201, varType: 'img', imagePath: '/x/BB.png' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 101: '不会生效', 102: '主图A_最终版', 201: 'BB' });
});

test('导出任务 payload 使用 manifest 变量构建 artboardRenames 并传入 JSX 任务', () => {
  const filePath = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const renameVariables = Array.isArray(manifest?.variables) && manifest.variables.length > 0'));
  assert.ok(content.includes('artboardRenames: buildArtboardRenameMap({ variables: renameVariables, updates })'));
});

test('导出文本更新应将换行标准化为 Photoshop 可识别格式', () => {
  const filePath = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('normalizeTextValue'));
  assert.ok(content.includes('replace(/\\r\\n/g,'));
  assert.ok(content.includes("replace(/\\n/g, '\\r')"));

  const jsxPath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const jsxContent = fs.readFileSync(jsxPath, 'utf8');
  assert.ok(jsxContent.includes('applyTextUpdate'));
  assert.ok(jsxContent.includes('replace(/\\r\\n/g,'));
  assert.ok(
    jsxContent.includes("replace(/\\n/g, '\\r')") || jsxContent.includes('replace(/\\n/g, "\\r")')
  );
});

test('JSX 在图片替换后支持按映射重命名画板组', () => {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('function renameArtboardGroupByLayer(layer, renameMap, logArr, psIdHint)'));
  assert.ok(content.includes('var psIdKey = psIdHint != null ? String(psIdHint) : "";'));
  assert.ok(content.includes('if (psIdKey && hasOwnRename(renameMap, psIdKey)) {'));
  assert.ok(content.includes('renameArtboardGroupByLayer(smartTarget, renameMap, logArr, psId)'));
  assert.ok(content.includes('renameArtboardGroupByLayer(variantLayer, taskArtboardRenames, taskLog, psId)'));
});

test('PSD 自动填充导出应透传 sourceName 供画板与图片层命名', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/PsdAutoFillTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const pickSourceName = (item) => {'));
  assert.ok(content.includes('sourceName: pickSourceName(match) || next[varIndex]?.sourceName'));
  assert.ok(content.includes('sourceName: pickSourceName(v) || existing?.sourceName'));

  const ingestPath = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const ingestContent = fs.readFileSync(ingestPath, 'utf8');
  const sourceNameMatches = ingestContent.match(/sourceName: u\.sourceName != null \? String\(u\.sourceName\) : undefined/g) || [];
  assert.ok(sourceNameMatches.length >= 3);
});

test('模板列表合并扫描时，未保存同 id 不应屏蔽已保存模板', () => {
  const filePath = path.resolve(process.cwd(), 'server/index.js');
  const content = fs.readFileSync(filePath, 'utf8');
  const idxSavedCheck = content.indexOf('if (!manifest.isUserSaved) continue;');
  const idxSeenAdd = content.indexOf('seen.add(id);');
  assert.ok(idxSavedCheck >= 0 && idxSeenAdd >= 0 && idxSeenAdd > idxSavedCheck);
});

test('photoshopIngest 文本解码与容错分支应保持 lint 兼容写法', () => {
  const filePath = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes("split('\\u0000').length - 1") || content.includes('split("\\u0000").length - 1'));
  assert.ok(!content.includes('utf16leText.match(/\\u0000/g)'));
  assert.ok(content.includes('catch (eDecodeBom) {'));
  assert.ok(content.includes('void eDecodeBom;'));
  assert.ok(content.includes('catch (eDecodeHeuristic) {'));
  assert.ok(content.includes('void eDecodeHeuristic;'));
});
