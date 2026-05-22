import test from 'node:test';
import assert from 'node:assert/strict';

import { pickAngle, matchChannel, pickModel } from '../server/utils/channelMatch.js';

test('pickAngle: 不应把型号中的 45 误判为 45 度', () => {
  assert.equal(pickAngle('BL3045.png'), null);
  assert.equal(pickAngle('ABCD12345.jpg'), null);
});

test('pickAngle: 45°/45度 或分隔符 token 才判定为 45', () => {
  assert.equal(pickAngle('BL3045_45度.tga'), '45');
  assert.equal(pickAngle('BL3045-45°.tga'), '45');
  assert.equal(pickAngle('BL3045 45.tga'), '45');
});

test('pickAngle: 正侧关键字优先于型号数字', () => {
  assert.equal(pickAngle('BL3045_正.jpg'), '正');
  assert.equal(pickAngle('BL3090_侧.jpg'), '侧');
});

test('matchChannel: 相似型号不应互相匹配', () => {
  const channels = [
    { angle: '正', baseModel: pickModel('BL3045'), isGeneric: false, sourceName: 'BL3045_正.tga' },
    { angle: '正', baseModel: pickModel('BL30456'), isGeneric: false, sourceName: 'BL30456_正.tga' },
  ];
  const a = matchChannel('BL3045_正.jpg', channels);
  assert.equal(a?.sourceName, 'BL3045_正.tga');
});
