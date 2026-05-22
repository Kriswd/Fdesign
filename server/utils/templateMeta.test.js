import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTemplateMeta } from './templateMeta.js';

test('large whitelisted placed layer should not be treated as background', () => {
  const psd = {
    width: 800,
    height: 800,
    children: [
      { id: 1, name: '背景', left: 0, top: 0, right: 800, bottom: 800, hidden: false },
      { id: 2, name: 'BL3267 _A08_正', left: -18, top: 170, right: 818, bottom: 640, hidden: false, placedLayer: {} },
      { id: 3, name: '新LOGO', left: 48, top: 50, right: 225, bottom: 85, hidden: false, placedLayer: {} },
    ],
  };
  const meta = extractTemplateMeta(psd);
  const img = Array.isArray(meta?.candidates?.img) ? meta.candidates.img : [];
  const names = img.map((v) => String(v?.name || ''));
  assert.ok(names.includes('BL3267 _A08_正'));
  assert.ok(names.includes('新LOGO'));
  assert.ok(!names.includes('背景'));
});
