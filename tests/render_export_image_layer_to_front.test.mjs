import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('render_export.jsx should move replaced image layer to front', () => {
  const filePath = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('function moveLayerToFrontInParent'));
  assert.ok(content.includes('ElementPlacement.PLACEATBEGINNING'));
  assert.ok(!content.includes('moveLayerToFrontInParent(smartTarget'));
});
