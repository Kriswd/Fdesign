import test from 'node:test';
import assert from 'node:assert/strict';
import { matchChannel, pickAngle, pickModel } from './channelMatch.js';

test('pickAngle detects 45/正/侧 patterns', () => {
  assert.equal(pickAngle('BA7079B3045度.png'), '45');
  assert.equal(pickAngle('BA7079B30_45度.png'), '45');
  assert.equal(pickAngle('BL3236 A12 45.jpg'), '45');
  assert.equal(pickAngle('BJ3205_B10_45.png'), '45');
  assert.equal(pickAngle('BL3236 A12 正.jpg'), '正');
  assert.equal(pickAngle('BL3236 A12 侧.jpg'), '侧');
});

test('pickModel extracts base model token', () => {
  assert.equal(pickModel('BA7079B3045度.png'), 'BA7079B30');
  assert.equal(pickModel('BL3236 A12 45.jpg'), 'BL3236');
  assert.equal(pickModel('BJ3205_B10_45.png'), 'BJ3205');
});

test('matchChannel matches style+color+angle when available', () => {
  const channels = [
    { sourceName: 'BJ3205_B10_45_VRay 线框颜色.tga', model: 'BJ3205', baseModel: 'BJ3205', angle: '45', isGeneric: false },
    { sourceName: 'BJ3205_B20_45_VRay 线框颜色.tga', model: 'BJ3205', baseModel: 'BJ3205', angle: '45', isGeneric: false },
  ];

  const m1 = matchChannel('BJ3205_B10_45.png', channels);
  assert.ok(m1);
  assert.equal(m1.sourceName, 'BJ3205_B10_45_VRay 线框颜色.tga');
});

test('matchChannel keeps working for compact names like BA7079B3045度', () => {
  const channels = [
    { sourceName: 'BL3236 C10 45_VRay 线框颜色.tga', model: 'BL3236', baseModel: 'BL3236', angle: '45', isGeneric: false },
    { sourceName: 'BA7079B30 45度_VRay 线框颜色.tga', model: 'BA7079B30', baseModel: 'BA7079B30', angle: '45', isGeneric: false },
  ];

  const m1 = matchChannel('BL3236 A12 45.png', channels);
  assert.ok(m1);
  assert.equal(m1.baseModel, 'BL3236');

  const m2 = matchChannel('BA7079B3045度.png', channels);
  assert.ok(m2);
  assert.equal(m2.baseModel, 'BA7079B30');
});
