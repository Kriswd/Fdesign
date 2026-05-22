import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCutoutNoPsdRequest } from './cutoutNoPsdPayload.mjs';

test('fresh mode builds cutout request for all images', () => {
  const req = buildCutoutNoPsdRequest({
    taskMode: 'fresh',
    productImages: [
      { id: 'a', name: 'BA7072B30_正.jpg', serverImagePath: 'E:\\x\\a.jpg' },
      { id: 'b', name: 'BA7072B30_侧.jpg', serverImagePath: 'E:\\x\\b.jpg' },
    ],
    channelMasks: [{ name: 'BA7072B30_正.tga', storedName: 's1.tga' }],
    resizeMode: 'exact',
  });

  assert.deepEqual(req.images, [
    { imagePath: 'E:\\x\\a.jpg', sourceName: 'BA7072B30_正.jpg' },
    { imagePath: 'E:\\x\\b.jpg', sourceName: 'BA7072B30_侧.jpg' },
  ]);
  assert.deepEqual(req.channels, [{ storedName: 's1.tga', sourceName: 'BA7072B30_正.tga' }]);
  assert.equal(req.resizeMode, 'exact');
});

test('template multi-variable mode builds cutout request for assigned images only', () => {
  const req = buildCutoutNoPsdRequest({
    taskMode: 'template',
    productImages: [
      { id: 'a', name: 'BA7072B30_正.jpg', serverImagePath: 'E:\\x\\a.jpg' },
      { id: 'b', name: 'BA7072B30_侧.jpg', serverImagePath: 'E:\\x\\b.jpg' },
      { id: 'c', name: 'UNUSED.jpg', serverImagePath: 'E:\\x\\c.jpg' },
    ],
    taskTemplateUnionPsIds: [101, 102],
    taskTemplateImageGroups: [
      { id: 'g1', assignments: { '101': 'b', '102': 'a' } },
      { id: 'g2', assignments: { '101': 'b' } },
    ],
    channelMasks: [{ name: '45.tga', storedName: 'any45.tga' }],
  });

  assert.deepEqual(req.images, [
    { imagePath: 'E:\\x\\b.jpg', sourceName: 'BA7072B30_侧.jpg' },
    { imagePath: 'E:\\x\\a.jpg', sourceName: 'BA7072B30_正.jpg' },
  ]);
});

test('throws when channel mask has no storedName', () => {
  assert.throws(
    () =>
      buildCutoutNoPsdRequest({
        taskMode: 'fresh',
        productImages: [{ id: 'a', name: 'a.jpg', serverImagePath: 'E:\\x\\a.jpg' }],
        channelMasks: [{ name: 'x.tga', storedName: '' }],
      }),
    /通道图未上传/,
  );
});

