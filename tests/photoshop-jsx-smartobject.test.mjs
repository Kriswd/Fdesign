import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('render_export.jsx 应使用 placedLayerMakeCopy 进行“通过拷贝新建智能对象”', () => {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('placedLayerMakeCopy'));
});

