import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProductImageCatalog, matchCatalogImage, parseProductImageName, pickAngle } from '../src/utils/productImageMatch.js';

test('parseProductImageName extracts model/color/angle from typical name', () => {
  const meta = parseProductImageName('BJ3205 B10 正.jpg');
  assert.equal(meta.model, 'BJ3205');
  assert.equal(meta.color, 'B10');
  assert.equal(meta.angle, '正');
  assert.equal(meta.key, 'BJ3205_B10');
});

test('parseProductImageName supports underscore naming convention', () => {
  const meta = parseProductImageName('BL7213_A60_正.png');
  assert.equal(meta.model, 'BL7213');
  assert.equal(meta.color, 'A60');
  assert.equal(meta.angle, '正');
  assert.equal(meta.key, 'BL7213_A60');
});

test('parseProductImageName should not strip 90 from color code like C90', () => {
  const meta = parseProductImageName('BL6110 C90 正.jpg');
  assert.equal(meta.model, 'BL6110');
  assert.equal(meta.color, 'C90');
  assert.equal(meta.angle, '正');
  assert.equal(meta.key, 'BL6110_C90');
});

test('pickAngle detects 45/正/侧', () => {
  assert.equal(pickAngle('BL3236 A12 45.png'), '45');
  assert.equal(pickAngle('BL3236 A12 正.png'), '正');
  assert.equal(pickAngle('BL3236 A12 侧.png'), '侧');
});

test('pickAngle should recognize 主视图 and 斜45 aliases from slot labels', () => {
  assert.equal(pickAngle('商品位1 主视图'), '正');
  assert.equal(pickAngle('商品位1 侧视图'), '侧');
  assert.equal(pickAngle('商品位1 斜45图'), '45');
});

test('matchCatalogImage matches by model+color+angle', () => {
  const catalog = buildProductImageCatalog([
    { originalName: 'BJ3205 B10 正.jpg', publicUrl: '/output/a.jpg', imagePath: '/abs/a.jpg' },
    { originalName: 'BJ3205 B10 侧.jpg', publicUrl: '/output/b.jpg', imagePath: '/abs/b.jpg' },
  ]);
  const m = matchCatalogImage({ model: 'BJ3205', color: 'B10', angle: '侧' }, catalog);
  assert.ok(m.ok);
  assert.equal(m.match.originalName, 'BJ3205 B10 侧.jpg');
});

test('matchCatalogImage reports conflict when multiple candidates share same angle', () => {
  const catalog = buildProductImageCatalog([
    { originalName: 'BJ3205 B10 正.jpg', publicUrl: '/output/a.jpg', imagePath: '/abs/a.jpg' },
    { originalName: 'BJ3205 B10 正(1).jpg', publicUrl: '/output/b.jpg', imagePath: '/abs/b.jpg' },
  ]);
  const m = matchCatalogImage({ model: 'BJ3205', color: 'B10', angle: '正' }, catalog);
  assert.equal(m.ok, false);
  assert.equal(m.reason, 'conflict');
  assert.ok(Array.isArray(m.conflicts));
  assert.equal(m.conflicts.length, 2);
});
