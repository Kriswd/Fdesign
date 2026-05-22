import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/pages/Workbench/PsdAutoFillTab.jsx');

test('PSD自动填充页隐藏切片导出区并移动导出PSD入口', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('切片与导出'));
  assert.ok(content.includes('导出修改后的PSD'));
  assert.ok(!content.includes('切片导出'));
});

test('PSD自动填充页不展示恒为0的图层统计', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('layers?.length'));
  assert.ok(!content.includes(' 图层'));
});

test('PSD自动填充页默认缩放更小', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('maxInitialScale={0.45}'));
});

test('HudEditor侧栏应支持文字应用并移除只读提示', () => {
  const p = path.resolve(process.cwd(), 'src/components/hud/SidePanel.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('应用'));
  assert.ok(content.includes('取消'));
  assert.ok(!content.includes('仅做只读预览'));
});

test('PSD自动填充页产品图库应提供一键清空全部图片', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('一键清空图片'));
  assert.ok(content.includes('clearAllProductImages'));
});

test('自动匹配图片不应要求图片变量先配置字段映射', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('const hasSlotVarBinding = useCallback((slotVar) => {'));
  assert.ok(!content.includes('if (!hasSlotVarBinding(slotVar)) {'));
  assert.ok(!content.includes('matchReport.skippedUnmapped += 1;'));
});

test('PSD自动填充页模板卡应优先使用轻量缩略图并启用异步懒加载', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('tpl.thumbnailUrl || tpl.previewUrl'));
  assert.ok(content.includes('loading="lazy"'));
  assert.ok(content.includes('decoding="async"'));
});
