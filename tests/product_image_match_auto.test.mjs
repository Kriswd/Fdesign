import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProductImageCatalog, matchCatalogImageByAngleSource } from '../src/utils/productImageMatch.js';

test('无角度但唯一候选时应匹配产品图', () => {
  const images = [
    { originalName: 'BL6110 C90 正.jpg', publicUrl: '/output/a.jpg', imagePath: 'x' },
  ];
  const catalog = buildProductImageCatalog(images);
  const result = matchCatalogImageByAngleSource({
    model: 'BL6110',
    color: 'C90',
    angleSource: '',
    catalog,
  });
  assert.equal(result.ok, true);
  assert.equal(result.match?.originalName, 'BL6110 C90 正.jpg');
});

test('无角度且多候选时应返回冲突', () => {
  const images = [
    { originalName: 'BL6110 C90 正.jpg', publicUrl: '/output/a.jpg', imagePath: 'x' },
    { originalName: 'BL6110 C90 侧.jpg', publicUrl: '/output/b.jpg', imagePath: 'y' },
  ];
  const catalog = buildProductImageCatalog(images);
  const result = matchCatalogImageByAngleSource({
    model: 'BL6110',
    color: 'C90',
    angleSource: '',
    catalog,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'conflict');
});
