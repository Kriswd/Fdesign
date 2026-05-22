import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('TemplateCanvas 在 showVariableLabels=false 时不应开启文本编辑/显示文字内容', () => {
  const p = path.resolve(process.cwd(), 'src/components/TemplateCanvas.jsx');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('contentEditable={showVariableLabels && isSelected}'));
  assert.ok(content.includes('{showVariableLabels ? (isSelected ? null : (v.value ?? \'\')) : \'\'}'));
});

