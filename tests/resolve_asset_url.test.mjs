import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAssetUrl } from '../src/utils/apiClient.js';

test('resolveAssetUrl 为 /output 路径补齐渲染服务域名', () => {
  const out = resolveAssetUrl('/output/assets/images/a.png', 'http://localhost:3001', [
    'http://localhost:3010',
    'http://localhost:3001',
  ]);
  assert.equal(out, 'http://localhost:3001/output/assets/images/a.png');
});

test('resolveAssetUrl 对 data 与 blob 与 http 不做改写', () => {
  assert.equal(resolveAssetUrl('data:image/png;base64,xxx', 'http://localhost:3001', []), 'data:image/png;base64,xxx');
  assert.equal(resolveAssetUrl('blob:http://localhost:3010/abc', 'http://localhost:3001', []), 'blob:http://localhost:3010/abc');
  assert.equal(resolveAssetUrl('https://cdn.test/a.png', 'http://localhost:3001', []), 'https://cdn.test/a.png');
});

test('resolveAssetUrl 在无显式基地址时优先使用 3001', () => {
  const out = resolveAssetUrl('/output/assets/images/a.png', '', [
    'http://localhost:3010',
    'http://localhost:3001',
  ]);
  assert.equal(out, 'http://localhost:3001/output/assets/images/a.png');
});
