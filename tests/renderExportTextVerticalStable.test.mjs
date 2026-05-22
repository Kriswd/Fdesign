import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('render_export 文本对齐应同时校正垂直位置，避免替换后叠字', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  const start = content.indexOf('function alignTextLayerToRect');
  assert.ok(start >= 0);
  const end = content.indexOf('function convertLayerToSmartObject', start);
  assert.ok(end > start);
  const fn = content.slice(start, end);
  assert.ok(fn.includes('var dy'));
  assert.ok(fn.includes('layer.translate(dx, dy)'));
});
