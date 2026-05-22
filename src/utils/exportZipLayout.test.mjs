import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZipEntry } from './exportZipLayout.js';

test('jd/tmall jpeg without PC/App in psdName should be skipped', () => {
  const entry = buildZipEntry({
    psdName: '京东主图规范(三视图).psd',
    imgName: 'BL7213_A61_45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(entry.skip, true);
});

test('jd/tmall jpeg with App in psdName should go to App folder', () => {
  const entry = buildZipEntry({
    psdName: '京东APP主图规范(三视图).psd',
    imgName: 'BL7213_A61_45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '京东/App/x.jpg');
});

test('jd png should be grouped by model+color', () => {
  const entry = buildZipEntry({
    psdName: '京东PNG产品图规范(三视图).psd',
    imgName: 'BL7213_A61_45.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '京东/PNG产品图/x.png');
});

test('tmall png should only include 45 angle', () => {
  const keep = buildZipEntry({
    psdName: '天猫PNG产品图规范(三视图).psd',
    imgName: 'BL7213_A61_45.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(keep.skip, false);
  assert.equal(keep.relativePath, '天猫/PNG产品图/x.png');

  const skipFront = buildZipEntry({
    psdName: '天猫PNG产品图规范(三视图).psd',
    imgName: 'BL7213_A61_正.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(skipFront.skip, true);

  const skipSide = buildZipEntry({
    psdName: '天猫PNG产品图规范(三视图).psd',
    imgName: 'BL7213_A61_侧.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(skipSide.skip, true);
});

test('tmall jpeg with PC in psdName should be grouped by model+color', () => {
  const entry = buildZipEntry({
    psdName: '天猫PC主图规范.psd',
    imgName: 'BL7213_A61_45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '天猫/PC/x.jpg');
});

test('tmall 白底800 jpeg should only include 45 angle and go to 白底800 folder', () => {
  const keep = buildZipEntry({
    psdName: '天猫白底800主图规范.psd',
    imgName: 'BL7213_A61_45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(keep.skip, false);
  assert.equal(keep.relativePath, '天猫/白底800/x.jpg');

  const skipFront = buildZipEntry({
    psdName: '天猫白底800主图规范.psd',
    imgName: 'BL7213_A61_正.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(skipFront.skip, true);

  const skipSide = buildZipEntry({
    psdName: '天猫白底800主图规范.psd',
    imgName: 'BL7213_A61_侧.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(skipSide.skip, true);
});

test('jd/tmall model-only imgName should still export without model folder', () => {
  const entry = buildZipEntry({
    psdName: '京东APP主图规范.psd',
    imgName: 'BL7213_45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '京东/App/x.jpg');
});

test('jd/tmall unrecognized model imgName should still export without model folder', () => {
  const entry = buildZipEntry({
    psdName: '天猫APP主图规范.psd',
    imgName: 'A61_45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '天猫/App/x.jpg');
});

test('vipshop png should be grouped by model+color without 其他产物 folder', () => {
  const entry = buildZipEntry({
    psdName: '唯品会主图规范.psd',
    imgName: 'BL3236_A12_45.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '唯品会/BL3236 A12/x.png');
});

test('vipshop 30 png should only include 45 angle and rename to 30.PNG', () => {
  const keep = buildZipEntry({
    psdName: '唯品会30(45图PNG).psd',
    imgName: 'BL3236_A12_45.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(keep.skip, false);
  assert.equal(keep.relativePath, '唯品会/BL3236 A12/30.PNG');

  const skipFront = buildZipEntry({
    psdName: '唯品会30(45图PNG).psd',
    imgName: 'BL3236_A12_正.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(skipFront.skip, true);

  const skipSide = buildZipEntry({
    psdName: '唯品会30(45图PNG).psd',
    imgName: 'BL3236_A12_侧.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(skipSide.skip, true);
});

test('vipshop jpeg with unknown template kind should still go to model+color folder', () => {
  const entry = buildZipEntry({
    psdName: '唯品会主图规范.psd',
    imgName: 'BL3236_A12_45.jpg',
    resultFormat: 'jpeg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '唯品会/BL3236 A12/x.jpg');
});

test('vipshop 1-3 should map 45/正/侧 to 1/2/3', () => {
  const v45 = buildZipEntry({
    psdName: '唯品会1-3(三视图+明星+模特+CG).psd',
    imgName: 'BL7222 A97 45.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(v45.skip, false);
  assert.equal(v45.relativePath, '唯品会/BL7222 A97/1.jpg');

  const vFront = buildZipEntry({
    psdName: '唯品会1-3(三视图+明星+模特+CG).psd',
    imgName: 'BL7222 A97 正.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(vFront.skip, false);
  assert.equal(vFront.relativePath, '唯品会/BL7222 A97/2.jpg');

  const vSide = buildZipEntry({
    psdName: '唯品会1-3(三视图+明星+模特+CG).psd',
    imgName: 'BL7222 A97 侧.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(vSide.skip, false);
  assert.equal(vSide.relativePath, '唯品会/BL7222 A97/3.jpg');
});

// 得物平台测试
test('dewu png should be flat under platform folder without subfolder', () => {
  const entry = buildZipEntry({
    psdName: '得物PNG产品图规范(三视图).psd',
    imgName: 'BL7213_A61_45.png',
    resultFormat: 'png',
    defaultFileName: 'x.png',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '得物/x.png');
});

test('dewu jpeg should be flat under platform folder without subfolder', () => {
  const entry = buildZipEntry({
    psdName: '得物JPG产品图规范(三视图).psd',
    imgName: 'BL7213_A61_正.jpg',
    resultFormat: 'jpg',
    defaultFileName: 'x.jpg',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, '得物/x.jpg');
});

test('dewu psd should go to zip root', () => {
  const entry = buildZipEntry({
    psdName: '得物PNG产品图规范(三视图).psd',
    imgName: 'BL7213_A61_45.psd',
    resultFormat: 'psd',
    defaultFileName: 'BL7213_A61_45.psd',
  });
  assert.equal(entry.skip, false);
  assert.equal(entry.relativePath, 'BL7213_A61_45.psd');
});
