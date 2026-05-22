import test from 'node:test';
import assert from 'node:assert/strict';

import { orderBySelectedIds } from '../src/utils/selectionOrder.js';

test('orderBySelectedIds 按选中顺序返回变量并去重', () => {
  const variables = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ];
  const selectedIds = ['c', 'a', 'c', 'missing', 'b'];
  const out = orderBySelectedIds(variables, selectedIds);
  assert.deepEqual(out.map((v) => v.id), ['c', 'a', 'b']);
});

