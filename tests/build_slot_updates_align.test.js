import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSlotUpdates, useDataStore } from '../src/store/dataStore.js';

test('buildSlotUpdates: 文本变量带上 align，默认 left', () => {
  const slots = [
    {
      id: 'slot_1',
      name: '商品位 1',
      variables: [
        { id: 't1', psId: 101, type: 'text', excelFieldKey: 'name', align: 'right' },
        { id: 't2', psId: 102, type: 'text', excelFieldKey: 'price' },
        { id: 'i1', psId: 201, type: 'img', excelFieldKey: 'imgUrl', align: 'center' },
      ],
    },
  ];
  const rows = [{ name: 'AAA', price: 'BBB', imgUrl: 'http://x/y.png' }];
  const slotRecordMapping = { slot_1: 0 };

  const updates = buildSlotUpdates({ slots, slotRecordMapping, rows });

  const byId = new Map(updates.map((u) => [u.id, u]));
  assert.equal(byId.get('t1').align, 'right');
  assert.equal(byId.get('t2').align, 'left');
  assert.equal(byId.get('i1').align, undefined);
});

test('buildSlotUpdates: 应串行应用规则链，让值映射结果继续命中特殊值覆盖', () => {
  const slots = [
    {
      id: 'slot_1',
      name: '商品位 1',
      variables: [
        {
          id: 't1',
          psId: 101,
          type: 'text',
          varType: 'text',
          excelFieldKey: '镜框颜色',
          computedRules: [
            {
              type: 'valueMap',
              sourceFieldKey: '镜框颜色',
              mapping: { '/': '无框', '／': '无框' },
              defaultToSource: true,
            },
            {
              type: 'concatFields',
              fieldKeys: ['镜框颜色'],
              fieldPrefixes: [''],
              fieldSuffixes: ['镜框'],
              fieldJoiners: [''],
              fieldPartOverrides: [{ 无框: '无框' }],
            },
          ],
        },
      ],
    },
  ];
  const rows = [{ 镜框颜色: '/' }];
  const slotRecordMapping = { slot_1: 0 };

  const updates = buildSlotUpdates({ slots, slotRecordMapping, rows });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].value, '无框');
});

test('resetExcelData: 仅清空Excel数据，不清空商品位配置', () => {
  useDataStore.setState({
    rawHeaders: ['A'],
    activeHeaders: ['A'],
    excelHeaderCheck: { ok: true },
    rows: [{ A: '1' }],
    primaryKey: 'A',
    currentRow: { A: '1' },
    slots: [{ id: 'slot_1', name: '商品位1', variables: [] }],
    fieldDefinitions: [{ key: 'A', label: 'A' }],
    slotRecordMapping: { slot_1: 0 },
    ignoredVariableIds: ['v1'],
    ignoredFieldKeys: ['k1'],
  });

  const state = useDataStore.getState();
  state.resetExcelData();
  const next = useDataStore.getState();

  assert.deepEqual(next.rows, []);
  assert.equal(next.primaryKey, '');
  assert.equal(next.currentRow, null);
  assert.deepEqual(next.slots, [{ id: 'slot_1', name: '商品位1', variables: [] }]);
  assert.deepEqual(next.fieldDefinitions, [{ key: 'A', label: 'A' }]);
});
