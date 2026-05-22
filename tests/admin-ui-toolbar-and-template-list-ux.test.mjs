import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('模板配置页顶部工具栏应拉满宽度且不换行', () => {
  const p = path.resolve(process.cwd(), 'src/pages/AdminSlotEditor.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('Toolbar overlay'));
  assert.ok(content.includes('left-4'));
  assert.ok(content.includes('right-4'));
  assert.ok(!content.includes('left-1/2 -translate-x-1/2'));
  assert.ok(content.includes('truncate'));
  assert.ok(content.includes('whitespace-nowrap'));
});

test('模板列表卡片名称与ID应支持悬浮显示完整信息', () => {
  const p = path.resolve(process.cwd(), 'src/pages/AdminPage.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('title={template.name}'));
  assert.ok(content.includes('title={template.id}'));
});

test('管理端与工作台模板卡应优先使用缩略图并启用异步懒加载', () => {
  const adminPath = path.resolve(process.cwd(), 'src/pages/AdminPage.jsx');
  const workbenchPath = path.resolve(process.cwd(), 'src/pages/WorkbenchPage.jsx');
  const adminContent = fs.readFileSync(adminPath, 'utf8');
  const workbenchContent = fs.readFileSync(workbenchPath, 'utf8');
  assert.ok(adminContent.includes('template.thumbnailUrl || template.previewUrl'));
  assert.ok(adminContent.includes('loading="lazy"'));
  assert.ok(adminContent.includes('decoding="async"'));
  assert.ok(workbenchContent.includes('tpl.thumbnailUrl || tpl.previewUrl'));
  assert.ok(workbenchContent.includes('loading="lazy"'));
  assert.ok(workbenchContent.includes('decoding="async"'));
});

