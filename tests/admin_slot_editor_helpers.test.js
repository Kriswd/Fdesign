import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGuidePick,
  nextGuidePick,
  guidePicksObjectToMap,
  guidePicksMapToObject,
  findFirstSlotVariableOccurrence,
} from '../src/utils/guidePick.js';

test('normalizeGuidePick: 无效输入返回 null', () => {
  assert.equal(normalizeGuidePick(null), null);
  assert.equal(normalizeGuidePick({}), null);
  assert.equal(normalizeGuidePick({ leftX: 10 }), null);
  assert.equal(normalizeGuidePick({ rightX: 20 }), null);
  assert.equal(normalizeGuidePick({ leftX: 20, rightX: 10 }), null);
  assert.equal(normalizeGuidePick({ leftX: 'x', rightX: 10 }), null);
});

test('normalizeGuidePick: 有效输入归一化为整数', () => {
  assert.deepEqual(normalizeGuidePick({ leftX: 10.2, rightX: 20.7 }), { leftX: 10, rightX: 21 });
});

test('nextGuidePick: 首次点击只填 leftX', () => {
  assert.deepEqual(nextGuidePick(null, 100), { leftX: 100, rightX: null });
});

test('nextGuidePick: 第二次点击补齐 rightX，并保证 left<=right', () => {
  assert.deepEqual(nextGuidePick({ leftX: 100, rightX: null }, 200), { leftX: 100, rightX: 200 });
  assert.deepEqual(nextGuidePick({ leftX: 200, rightX: null }, 100), { leftX: 100, rightX: 200 });
});

test('nextGuidePick: 已有左右后，按点击位置更新更近的一侧', () => {
  const base = { leftX: 100, rightX: 200 };
  assert.deepEqual(nextGuidePick(base, 150), { leftX: 150, rightX: 200 });
  assert.deepEqual(nextGuidePick(base, 140), { leftX: 140, rightX: 200 });
  assert.deepEqual(nextGuidePick(base, 160), { leftX: 100, rightX: 160 });
});

test('guidePicksObjectToMap / guidePicksMapToObject: 双向转换保持数据', () => {
  const obj = {
    '123': { leftX: 10, rightX: 20 },
    '456': { leftX: 30.4, rightX: 80.6 },
    'bad': { leftX: 1, rightX: 2 },
    '789': { leftX: 20, rightX: 10 },
  };
  const map = guidePicksObjectToMap(obj);
  assert.deepEqual(map.get(123), { leftX: 10, rightX: 20 });
  assert.deepEqual(map.get(456), { leftX: 30, rightX: 81 });
  assert.equal(map.has(789), false);

  const back = guidePicksMapToObject(map);
  assert.deepEqual(back, {
    '123': { leftX: 10, rightX: 20 },
    '456': { leftX: 30, rightX: 81 },
  });
});

test('guidePicksMapToObject: 未完成绑定不会被落盘', () => {
  const map = new Map();
  map.set(111, { leftX: 10, rightX: null });
  map.set(222, { leftX: 30, rightX: 20 });
  map.set(333, { leftX: 10, rightX: 20 });
  const out = guidePicksMapToObject(map);
  assert.deepEqual(out, { '333': { leftX: 10, rightX: 20 } });
});

test('findFirstSlotVariableOccurrence: 定位变量所在商品位与索引', () => {
  const slots = [
    { id: 's1', variables: [{ id: 'v1' }, { id: 'v2' }] },
    { id: 's2', variables: [{ id: 'v3' }] },
  ];
  assert.deepEqual(findFirstSlotVariableOccurrence(slots, 'v3'), {
    slotId: 's2',
    slotIndex: 1,
    variableIndex: 0,
  });
  assert.equal(findFirstSlotVariableOccurrence(slots, 'missing'), null);
});
