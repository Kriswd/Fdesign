import test from 'node:test';
import assert from 'node:assert/strict';

import { buildZipEntry, detectPlatform, parseAngle, parseModelColorKey } from '../src/utils/exportZipLayout.js';

test('detectPlatform 识别平台（按优先级）', () => {
  assert.deepEqual(detectPlatform('京东PC主图.psd'), { platformKey: 'jd', platformLabel: '京东' });
  assert.deepEqual(detectPlatform('天猫App主图.psd'), { platformKey: 'tmall', platformLabel: '天猫' });
  assert.deepEqual(detectPlatform('考拉_小红书_主图.psd'), { platformKey: 'koala_xhs', platformLabel: '考拉+小红书' });
  assert.deepEqual(detectPlatform('唯品会1-3(三视图).psd'), { platformKey: 'vipshop', platformLabel: '唯品会' });
  assert.deepEqual(detectPlatform('无平台信息.psd'), { platformKey: 'unknown', platformLabel: '未识别平台' });
});

test('parseModelColorKey 解析 型号+色号', () => {
  assert.equal(parseModelColorKey('BL7222 A97 正.jpg'), 'BL7222 A97');
  assert.equal(parseModelColorKey('BA7072-B30-侧.png'), 'BA7072 B30');
  assert.equal(parseModelColorKey('BA7072__B30__45度'), 'BA7072 B30');
  assert.equal(parseModelColorKey('BL9999_正面'), 'BL9999');
  assert.equal(parseModelColorKey('无型号_正'), '未识别型号');
});

test('parseAngle 解析 角度', () => {
  assert.equal(parseAngle('BL7222 A97 正.jpg'), '正');
  assert.equal(parseAngle('BL7222 A97 侧.png'), '侧');
  assert.equal(parseAngle('BL7222 A97 45度.jpg'), '45');
  assert.equal(parseAngle('BL7222 A97 90°'), '侧');
  assert.equal(parseAngle('BL7222 A97 unknown'), '');
});

test('buildZipEntry 京东/天猫 规则', () => {
  const png = buildZipEntry({
    psdName: '京东PC模版.psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(png.relativePath, '京东/PNG产品图/x.png');

  const tmallWhite800Jpeg45 = buildZipEntry({
    psdName: '天猫白底800主图规范.psd',
    imgName: 'BL7222 A97 45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(tmallWhite800Jpeg45.skip, false);
  assert.equal(tmallWhite800Jpeg45.relativePath, '天猫/白底800/x.jpg');

  const tmallWhite800JpegFront = buildZipEntry({
    psdName: '天猫白底800主图规范.psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(tmallWhite800JpegFront.skip, true);

  const tmallPng45 = buildZipEntry({
    psdName: '天猫PC模版.psd',
    imgName: 'BL7222 A97 45.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(tmallPng45.skip, false);
  assert.equal(tmallPng45.relativePath, '天猫/PNG产品图/x.png');

  const tmallPngFront = buildZipEntry({
    psdName: '天猫PC模版.psd',
    imgName: 'BL7222 A97 正.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(tmallPngFront.skip, true);

  const jpgPc = buildZipEntry({
    psdName: '天猫PC模版.psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(jpgPc.relativePath, '天猫/PC/x.jpg');

  const psdApp = buildZipEntry({
    psdName: '京东App模版.psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'psd',
    defaultFileName: 'x.psd',
  });
  assert.equal(psdApp.relativePath, 'x.psd');

  const other = buildZipEntry({
    psdName: '天猫模版.psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'psd',
    defaultFileName: 'x.psd',
  });
  assert.equal(other.relativePath, 'x.psd');
});

test('buildZipEntry 考拉+小红书 规则', () => {
  const png = buildZipEntry({
    psdName: '小红书主图.psd',
    imgName: 'BL7222 A97 45.png',
    resultFormat: 'png',
    defaultFileName: 'a.png',
  });
  assert.equal(png.relativePath, '考拉+小红书/PNG/BL7222 A97/a.png');

  const jpg = buildZipEntry({
    psdName: '考拉主图.psd',
    imgName: 'BL7222 A97 侧.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'b.jpg',
  });
  assert.equal(jpg.relativePath, '考拉+小红书/JPG/BL7222 A97/b.jpg');

  const psd = buildZipEntry({
    psdName: '考拉主图.psd',
    imgName: 'BL7222 A97 侧.jpg',
    resultFormat: 'psd',
    defaultFileName: 'c.psd',
  });
  assert.equal(psd.relativePath, 'c.psd');
});

test('buildZipEntry 唯品会 规则：1-3/30/50 命名与跳过', () => {
  const v1 = buildZipEntry({
    psdName: '唯品会1-3(三视图+明星+模特+CG).psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(v1.relativePath, '唯品会/BL7222 A97/2.jpg');
  assert.equal(v1.skip, false);

  const v3 = buildZipEntry({
    psdName: '唯品会1-3(三视图).psd',
    imgName: 'BL7222 A97 45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(v3.relativePath, '唯品会/BL7222 A97/1.jpg');

  const vSide = buildZipEntry({
    psdName: '唯品会1-3(三视图).psd',
    imgName: 'BL7222 A97 侧.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(vSide.relativePath, '唯品会/BL7222 A97/3.jpg');

  const v30skip = buildZipEntry({
    psdName: '唯品会30(45图PNG).psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(v30skip.skip, true);

  const v30 = buildZipEntry({
    psdName: '唯品会30(45图PNG).psd',
    imgName: 'BL7222 A97 45.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(v30.relativePath, '唯品会/BL7222 A97/30.jpg');

  const v30Png = buildZipEntry({
    psdName: '唯品会30(45图PNG).psd',
    imgName: 'BL7222 A97 45.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(v30Png.skip, false);
  assert.equal(v30Png.relativePath, '唯品会/BL7222 A97/30.PNG');

  const v30PngSkip = buildZipEntry({
    psdName: '唯品会30(45图PNG).psd',
    imgName: 'BL7222 A97 正.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(v30PngSkip.skip, true);

  const v50 = buildZipEntry({
    psdName: '唯品会50(45度+明星+模特+CG).psd',
    imgName: 'BL7222 A97 45.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(v50.relativePath, '唯品会/BL7222 A97/50.jpg');
});
