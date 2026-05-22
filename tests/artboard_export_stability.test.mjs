import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function extractFunctionSource(content, functionName) {
  const marker = `function ${functionName}(`;
  const start = content.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const bodyStart = content.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `missing function body for ${functionName}`);
  let depth = 0;
  for (let i = bodyStart; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${functionName}`);
}

function loadRenderExportLayerIdFns(actionManagerLayerId) {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  const source = [
    extractFunctionSource(content, 'getLayerIdSafe'),
    content.includes('function readActiveLayerIdByActionManager(')
      ? extractFunctionSource(content, 'readActiveLayerIdByActionManager')
      : '',
    'module.exports = { getLayerIdSafe };',
  ].filter(Boolean).join('\n\n');
  const context = {
    module: { exports: {} },
    exports: {},
    Number,
    isFinite,
    app: { activeDocument: { activeLayer: null } },
    ActionReference: function ActionReference() {
      this.putEnumerated = () => {};
    },
    charIDToTypeID: (value) => value,
    stringIDToTypeID: (value) => value,
    executeActionGet: () => ({
      hasKey: () => true,
      getInteger: () => actionManagerLayerId,
    }),
  };
  vm.runInNewContext(source, context);
  return { getLayerIdSafe: context.module.exports.getLayerIdSafe, context };
}

test('render_export 在画板稳态模式下应提供文本位置快照与回放能力', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('function captureStableTextBounds'));
  assert.ok(content.includes('function captureStableUpdateRects'));
  assert.ok(content.includes('function upsertStableTextBounds'));
  assert.ok(content.includes('function restoreStableTextBounds'));
  assert.ok(content.includes('preserveArtboardTextPosition'));
  assert.ok(content.includes('stableUpdateRects = preserveArtboardTextPosition ? captureStableUpdateRects(workDoc, updates, logArr) : null'));
  assert.ok(content.includes('upsertStableTextBounds(workDoc, stableTextBounds, psId)'));
});

test('render_export 在画板稳态模式下应先 duplicate 原图层，再隔离智能对象并统一回放文本', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('duplicateLayer = target.duplicate();'));
  assert.ok(content.includes('smartTarget = duplicateLayer || target;'));
  assert.ok(content.includes('isolateR = isolateSmartObjectLayer(smartTarget);'));
  assert.ok(content.includes('restoreLayerPlacement(smartTarget, placeInfo);'));
  assert.ok(content.includes('restoreLayerArtboardPosition(smartTarget, placeRectBeforeIsolate, logArr, "img_update[" + String(i) + "]");'));
  assert.ok(content.includes('logArr.push("img_update[" + String(i) + "] targetLayerId(before)=" + String(getLayerIdSafe(target)));'));
  assert.ok(content.includes('logArr.push("img_update[" + String(i) + "] duplicateLayerId(afterDup)=" + String(duplicateLayerId));'));
  assert.ok(content.includes('logArr.push("img_update[" + String(i) + "] smartLayerId(afterIsolate)=" + String(getLayerIdSafe(smartTarget)));'));
  assert.ok(content.includes('try { if (target && target !== smartTarget) target.remove(); } catch (eRmDup) {}'));
  assert.ok(!content.includes('if (preserveArtboardTextPosition) skipFit = true'));
  assert.ok(content.includes('if (pendingStableTextRestore) {'));
});

test('photoshopIngest 导出任务应下发画板稳态开关到 JSX', () => {
  const p = path.resolve(process.cwd(), 'server/services/photoshopIngest.js');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('detectTemplateHasArtboard'));
  assert.ok(content.includes('preserveArtboardTextPosition: enableArtboardStableExport'));
  assert.ok(content.includes("'[导出调试] 画板稳态开关'"));
});

test('render_export 图片替换应优先保持原图层矩形，异常 updates 坐标不参与重定位', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('function pickDesiredImageRect(placeRect, updateRect, fallbackRect, logArr, updateIndex)'));
  assert.ok(content.includes('var imgFile = null;'));
  assert.ok(content.includes('if (!(imgFile && imgFile.exists)) {'));
  assert.ok(content.includes('message: "image_file_not_found"'));
  assert.ok(content.includes('var desiredFromUpdate = null;'));
  assert.ok(content.includes('try { desiredFromUpdate = readRectFromUpdate(u); } catch (eDU) { desiredFromUpdate = null; }'));
  assert.ok(content.includes('desiredFromUpdate = normalizeUpdateRectForLayer(smartTarget, desiredFromUpdate, placeRect, logArr, "img_update[" + String(i) + "]");'));
  assert.ok(content.includes('var desiredFromFallback = null;'));
  assert.ok(content.includes('desiredFromFallback = normalizeUpdateRectForLayer(smartTarget, desiredFromFallback, placeRect, logArr, "img_update[" + String(i) + "]_fallback");'));
  assert.ok(content.includes('var desiredFromStable = null;'));
  assert.ok(content.includes('desiredFromStable = alignSnapshotRectToCurrentSpace(smartTarget, desiredFromStable, placeRect, logArr, "img_update[" + String(i) + "]");'));
  assert.ok(content.includes('var placeRectForDesired = placeRect;'));
  assert.ok(content.includes('if (preserveArtboardTextPosition && desiredFromStable) placeRectForDesired = desiredFromStable;'));
  assert.ok(content.includes('var desired = pickDesiredImageRect(placeRectForDesired, desiredFromUpdate, desiredFromFallback, logArr, i);'));
  assert.ok(content.includes('desiredRectRejected=update_distance_'));
});

test('render_export 应输出几何诊断日志字段用于现场复盘', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('function formatRectForLog(rect)'));
  assert.ok(content.includes('function collectLayerChainNames(layer)'));
  assert.ok(content.includes('updateRectRaw='));
  assert.ok(content.includes('replacedRect(beforeFit)='));
  assert.ok(content.includes('desiredAfterDistance='));
});

test('render_export 图片替换应在回到画板前完成置入，避免临时大图把后续画板整体下推', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  const imgBlockStart = content.indexOf('} else if (u && u.varType === "img") {');
  assert.notEqual(imgBlockStart, -1, 'missing image update block');
  const replaceIdx = content.indexOf('replacePlacedContents(imgPath);', imgBlockStart);
  const restorePlacementIdx = content.indexOf('restoreLayerPlacement(smartTarget, placeInfo);', imgBlockStart);
  assert.notEqual(replaceIdx, -1, 'missing replacePlacedContents');
  assert.notEqual(restorePlacementIdx, -1, 'missing restoreLayerPlacement');
  assert.ok(replaceIdx < restorePlacementIdx, 'expected image replacement before restoring artboard placement');
});


test('render_export single 模式应保留逐层几何日志，便于偏移复盘', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('var singleLog = [];'));
  assert.ok(content.includes('mode=single'));
  assert.ok(content.includes('applyUpdatesToDoc(work, updates, singleLog, artboardRenames'));
  assert.ok(content.includes('safeWriteTextFile(jobPath + ".log", singleLog.join("\\n") + "\\n");'));
  assert.ok(content.includes('singleLog.push("updatedText=" + String(r.updatedText || 0));'));
  assert.ok(content.includes('singleLog.push("updatedImage=" + String(r.updatedImage || 0));'));
});

test('render_export 文本对齐应按图层原始对齐锚点回放并输出文本日志', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('function resolveTextAnchorAlign(layer, align)'));
  assert.ok(content.includes('function readTextAnchorPoint(layer)'));
  assert.ok(content.includes('function restoreTextAnchorPoint(layer, pt)'));
  assert.ok(content.includes('function formatPointForLog(pt)'));
  assert.ok(content.includes('function normalizeUpdateRectForLayer(layer, updateRect, referenceRect, logArr, logPrefix)'));
  assert.ok(content.includes('function alignSnapshotRectToCurrentSpace(layer, snapshotRect, currentRect, logArr, logPrefix)'));
  assert.ok(content.includes('var textAnchorBefore = readTextAnchorPoint(target);'));
  assert.ok(content.includes('anchorRestored = restoreTextAnchorPoint(target, textAnchorBefore);'));
  assert.ok(content.includes('text_update[" + String(i) + "] anchorBefore='));
  assert.ok(content.includes('text_update[" + String(i) + "] anchorAfter='));
  assert.ok(content.includes('text_update[" + String(i) + "] anchorRestored='));
  assert.ok(content.includes('updateRectNormSource='));
  assert.ok(content.includes('stableRectAlignSource='));
  assert.ok(content.includes('text_update['));
  assert.ok(content.includes('alignResolved='));
  assert.ok(content.includes('desiredRectSource='));
  assert.ok(content.includes('text_update[" + String(i) + "] desiredAfterDistance='));
});

test('render_export 应按图层ID回放父级容器与兄弟顺序，避免对象引用失效', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('function resolveLayerByIdFromDoc(doc, layerId)'));
  assert.ok(content.includes('parentId: null'));
  assert.ok(content.includes('refId: null'));
  assert.ok(content.includes('if (info.parentId != null) parent = resolveLayerByIdFromDoc(doc, info.parentId);'));
  assert.ok(content.includes('if (info.refId != null) refLayer = resolveLayerByIdFromDoc(doc, info.refId);'));
});

test('render_export psd-bundle 应在原层级复制并恢复位置，避免跨画板位移', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('var placeInfoB = captureSiblingPlacement(target);'));
  assert.ok(content.includes('linkedDup = target.duplicate();'));
  assert.ok(content.includes('restoreLayerPlacement(variantLayer, placeInfoB);'));
  assert.ok(content.includes('var desiredRectPicked = pickDesiredImageRect('));
  assert.ok(content.includes('renameArtboardGroupByLayer(variantLayer, taskArtboardRenames, taskLog, psId);'));
});

test('render_export 导出前应默认折叠所有画板组', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('function collapseAllArtboardGroups(workDoc, logArr)'));
  assert.ok(content.includes('collapseAllArtboardGroups(work, singleLog);'));
  assert.ok(content.includes('collapseAllArtboardGroups(work, taskLog);'));
  assert.ok(content.includes('collapseAllArtboardGroups(work, batchLog);'));
});
