import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSlotConfigPayload } from '../src/utils/slotConfigPayload.js';

test('buildSlotConfigPayload 会保留 computedRule 与 computedRules', () => {
  const computedRule = { type: 'concatFields', fieldKeys: ['a', 'b'], fieldPrefixes: ['', ''], fieldSuffixes: ['', ''], joiner: '-' };
  const computedRules = [
    { enabled: true, type: 'keywordContains', sourceFieldKey: 'x', keyword: '偏光', trueText: '高清偏光镜片', falseText: '非偏光镜片' },
  ];
  const payload = buildSlotConfigPayload({
    templateId: 'deadbeefdeadbeef',
    slots: [
      {
        id: 'slot_1',
        name: '商品位 1',
        variables: [
          {
            id: 'v1',
            psId: 101,
            name: '标题',
            type: 'text',
            label: '标题',
            excelFieldKey: 'title',
            align: 'left',
            computedRule,
            computedRules,
          },
        ],
      },
    ],
    fieldDefinitions: [{ key: 'title', label: 'title', type: 'text' }],
    ignoredVariableIds: [],
    ignoredFieldKeys: [],
  });

  const v = payload.slots[0].variables[0];
  assert.deepEqual(v.computedRule, computedRule);
  assert.deepEqual(v.computedRules, computedRules);
});
