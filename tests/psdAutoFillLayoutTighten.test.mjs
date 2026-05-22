import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('PSD自动填充页：参考线开关应在画布标题栏，右侧不应有独立参考线卡片', () => {
  const p = path.resolve(process.cwd(), 'src/pages/Workbench/PsdAutoFillTab.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('aria-label="切换参考线显示"'));
  assert.ok(!content.includes('参考线仅用于展示与导出对齐，绑定关系以管理端配置为准'));
});

test('数据控制台空态：Excel 拖拽上传区应铺满高度并更大', () => {
  const p = path.resolve(process.cwd(), 'src/components/DataConsole.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('data-console'));
  assert.ok(content.includes('min-h-[360px]'));
});
