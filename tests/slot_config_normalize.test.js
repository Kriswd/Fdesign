import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSlotsAgainstVariables } from '../src/utils/slotConfigNormalize.js';

test('normalizeSlotsAgainstVariables 会按 psId 归一化 id 并去重', () => {
  const variables = [
    { id: 'new_1', psId: 10, name: 'A', varType: 'text' },
    { id: 'new_2', psId: 20, name: 'B', varType: 'img' },
  ];

  const slots = [
    {
      id: 'slot_1',
      name: '商品位 1',
      variables: [
        { id: 'old_1', psId: 10, excelFieldKey: 'a' },
        { id: 'old_dup', psId: 10, excelFieldKey: 'a2' },
        { id: 'old_2', psId: 20, excelFieldKey: 'b' },
      ],
    },
  ];

  const out = normalizeSlotsAgainstVariables(slots, variables);
  assert.equal(out[0].variables.length, 2);
  assert.equal(out[0].variables[0].id, 'new_1');
  assert.equal(out[0].variables[1].id, 'new_2');
});

