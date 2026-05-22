import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('批量生成页参考线绑定按钮应显示“保存绑定”，不应出现“退出绑定”', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('保存绑定'));
  assert.ok(!content.includes('退出绑定'));
});

test('CanvasLayer 不应在缩放/拖拽结束时自动回正视口', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/hud/CanvasLayer.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('onPanningStop={ensureVisible}'));
  assert.ok(!content.includes('onZoomStop={ensureVisible}'));
});

test('Zip 导出文件名不应包含PSD名称前缀（JPG/PNG）', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const buildExportFileName = ({ psdName, imgName, urlExt, fallbackFormat }) => {'));
  assert.ok(content.includes('`${imgBase}.${ext}`'));
  assert.ok(!content.includes('return `${psdBase}_${imgBase}.${ext}`'));
});

test('合并PSD不应阻断JPG导出流程（不应在合并PSD后直接 return）', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('批量生成完成（合并PSD）'));
  assert.ok(!content.includes('setIsGenerating(false);\n      return;'));
  assert.ok(!content.includes('setGenerationProgress({ current: 0, total: bundleRows.filter((b) => b.serverTemplateId).length })'));
});

test('任务模板默认导出格式不应强制包含 PNG', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes("return normalizeExportFormats(mapped != null ? mapped : fallbackFormats, ['jpeg', 'psd']);"));
});

test('缺通道提示只应对 PNG 格式触发', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  const marker = "String(currentFormat || '').toLowerCase() === 'png'";
  const count = content.split(marker).length - 1;
  assert.ok(count >= 2);
});

test('生成队列应同时展示合并PSD与逐张导出结果', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('...(Array.isArray(bundleExportResults) ? bundleExportResults : [])'));
  assert.ok(content.includes('...(Array.isArray(generationResults) ? generationResults : [])'));
});

test('生成队列文件名应与压缩包文件名逻辑一致', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const getQueueDisplayName = (task) => {'));
  assert.ok(content.includes('return buildExportFileName({'));
});

test('切换PSD时应恢复上次选中的变量与参考线绑定', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const [activeHotspotIdByPsdId, setActiveHotspotIdByPsdId] = useState(() => new Map());'));
  assert.ok(!content.includes('useEffect(() => {\n    setActiveHotspotId(null);\n    setGuidePickMode(false);\n  }, [basePsdId]);'));
  assert.ok(content.includes('const lastBaseRestoreKeyRef = useRef'));
});

test('PSD模板上传应忽略重复文件', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const makeSig = (f) =>'));
  assert.ok(content.includes('已上传过的 PSD 将自动忽略'));
});

test('上传PSD后应自动选中一个默认图片变量以启用合并PSD', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const pickDefaultImageVarPsId = useCallback'));
  assert.ok(content.includes('pickDefaultImageVarPsId(parsed?.variables)'));
  assert.ok(content.includes('new Set([defaultImgPsId])'));
});

test('仅导出JPG时不应额外兜底重选图片变量', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  const marker = 'pickDefaultImageVarPsId(';
  const count = content.split(marker).length - 1;
  assert.equal(count, 1);
});

test('批量生成画布只允许单选一个图片变量（新选中替换旧选中）', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const toggleVariable = (varId) => {'));
  assert.ok(content.includes('new Set([psId])'));
  assert.ok(!content.includes('current.add(psId)'));
});

test('批量生成页参考线解析不应对32倍整数误判缩放', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('n % 32 === 0'));
});

test('右侧统计文案应使用 PSD模版数量', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('PSD模版数量'));
});

test('单文件下载按钮应为纯图标，不应出现“单张下载/下载单张”文案', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('下载单张'));
  assert.ok(!content.includes('单张下载'));
});

test('合并PSD提示文案不应将PSD与PNG绑定', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('且未勾选 PNG'));
  assert.ok(content.includes('合并为单个PSD'));
});

test('导出前统计应显示预计导出与格式明细', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('预计导出:'));
  assert.ok(content.includes('PNG ${sum.png} / JPG ${sum.jpg} / PSD ${sum.psd}'));
});

test('合并PSD图层名应去掉上传前缀随机串', () => {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('replace(/^[a-z0-9_-]{6,80}__+/i'));
});

test('任务模板保存与导出应支持 selectedVarIds', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('selectedVarIds'));
});

test('任务模板导出 angleHint 应优先使用产品图文件名而非变量名', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes("const angleHint = parseAngleHint(src0) || parseAngleHint(vname);"));
  assert.ok(!content.includes("const angleHint = parseAngleHint(vname) || parseAngleHint(src0);"));
});

test('PNG 模板默认导出格式应为 PNG+PSD', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes("return /png/i.test(raw) ? ['png', 'psd'] : ['jpeg', 'psd'];"));
});

test('打包文件名应包含平台名并支持多平台', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const platformLabel = (() => {'));
  assert.ok(content.includes("if (labels.size > 1) return '多平台';"));
  assert.ok(content.includes('const zipBaseName = `${sanitizeZipNameSegment(platformLabel)}_批量导出_${timestamp}`;'));
});

test('任务模板列表应展示原始 PSD 名称而非模板ID缩写', () => {
  const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/BatchProductImageTab.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const originalPsdNameRaw ='));
  assert.ok(content.includes('{originalPsdName}'));
  assert.ok(!content.includes("{String(it?.__taskTemplateName || '任务模板')} · PSD_{String(it?.templateId || '').slice(0, 6)}"));
});
