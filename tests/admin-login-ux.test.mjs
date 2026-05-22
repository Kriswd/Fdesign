import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/pages/AdminPage.jsx');

function extractAuthModalSnippet(content) {
  const start = content.indexOf('管理员登录');
  if (start === -1) return '';
  const end = content.indexOf('当前状态', start);
  const safeEnd = end === -1 ? Math.min(content.length, start + 6000) : end;
  return content.slice(Math.max(0, start - 200), safeEnd + 200);
}

test('管理端登录弹窗在未登录/改密场景不应提供取消入口', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  const snippet = extractAuthModalSnippet(content);
  assert.ok(snippet.includes('管理员登录'));
  assert.ok(!snippet.includes('>取消<'));
});

test('首次登录改密提示应清晰且包含确认新密码', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  const snippet = extractAuthModalSnippet(content);
  assert.ok(snippet.includes('首次登录需要设置新密码后才能继续') || snippet.includes('首次登录：请先设置新管理员密码'));
  assert.ok(snippet.includes('mustChangePassword ?'));
  assert.ok(snippet.includes('初始密码：'));
  assert.ok(snippet.includes('确认新密码'));
});

test('PSD自动填充页数据控制台容器应至少 480px 高以显示约10行', () => {
  const p = path.resolve(process.cwd(), 'src/pages/Workbench/PsdAutoFillTab.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('col-span-12 h-[60vh]') || content.includes('col-span-12 h-[78vh]'));
  assert.ok(content.includes('min-h-[520px]') || content.includes('min-h-[780px]'));
});

test('选中记录不应自动绑定商品位，需点击指定商品位触发', () => {
  const p = path.resolve(process.cwd(), 'src/pages/Workbench/PsdAutoFillTab.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(!content.includes('if (selectedSlotId) {\n      bindRowToSlot(selectedSlotId, row);'));
});
