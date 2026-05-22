import test from 'node:test';
import assert from 'node:assert/strict';

import { autoChainOnSave } from '../src/utils/ruleChainAuto.js';

test('autoChainOnSave: 规则链为空时保存会自动生成单条规则链', () => {
  const out = autoChainOnSave({
    chain: [],
    rule: { type: 'constant', value: 'X' },
    normalizeEntry: (r) => ({ ...r, enabled: true, id: 'r1' }),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'r1');
  assert.equal(out[0].enabled, true);
});

test('autoChainOnSave: 当前规则已在链中时不应重复追加', () => {
  const out = autoChainOnSave({
    chain: [{ id: 'keep', enabled: true, type: 'constant', value: 'X' }],
    rule: { type: 'constant', value: 'X' },
    normalizeEntry: (r) => ({ ...r, enabled: true, id: r.id || 'r1' }),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'keep');
});

test('autoChainOnSave: 当前编辑态与现有规则链不同步时，应追加当前规则避免保存丢失', () => {
  const out = autoChainOnSave({
    chain: [{ id: 'keep', enabled: true, type: 'concatFields', fieldKeys: ['镜框颜色'] }],
    rule: { type: 'valueMap', sourceFieldKey: '镜框颜色', mapping: { '/': '无框' } },
    normalizeEntry: (r) => ({ ...r, enabled: true, id: r.id || 'r1' }),
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'keep');
  assert.equal(out[1].type, 'valueMap');
  assert.deepEqual(out[1].mapping, { '/': '无框' });
});

