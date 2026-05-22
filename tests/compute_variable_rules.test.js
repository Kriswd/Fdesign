import test from 'node:test';
import assert from 'node:assert/strict';

import { computeVariableValueByRules } from '../src/store/dataStore.js';

test('lensTypeSummary: should treat 非偏光 as unpolarized', () => {
  const rule = { type: 'lensTypeSummary', polarizationKeyword: '偏光' };
  const row = { 是否偏光: '非偏光' };
  const slotVar = { excelFieldKey: '是否偏光', varType: 'text', computedRule: rule };
  const out = computeVariableValueByRules({ slotVar, row, allRows: [] });
  assert.equal(out, '高清非偏光');
});

test('lensTypeSummary: should treat 偏光 as polarized', () => {
  const rule = { type: 'lensTypeSummary', polarizationKeyword: '偏光' };
  const row = { 是否偏光: '偏光' };
  const slotVar = { excelFieldKey: '是否偏光', varType: 'text', computedRule: rule };
  const out = computeVariableValueByRules({ slotVar, row, allRows: [] });
  assert.equal(out, '高清偏光');
});

test('lensTypeSummary: 偏光与非偏光同时存在应输出组合摘要', () => {
  const rule = { type: 'lensTypeSummary', polarizationKeyword: '偏光' };
  const row = { 是否偏光: '偏光/非偏光' };
  const slotVar = { excelFieldKey: '是否偏光', varType: 'text', computedRule: rule };
  const out = computeVariableValueByRules({ slotVar, row, allRows: [] });
  assert.equal(out, '高清偏光/非偏光');
});

test('lensTypeSummary: 按款号汇总多行偏光状态（偏光+非偏光）', () => {
  const rule = { type: 'lensTypeSummary', polarizationKeyword: '偏光', groupByFieldKey: '款号', polarizationFieldKey: '是否偏光' };
  const allRows = [
    { 款号: 'BJ3205', 是否偏光: '偏光' },
    { 款号: 'BJ3205', 是否偏光: '非偏光' },
    { 款号: 'BJ9999', 是否偏光: '偏光' },
  ];
  const row = allRows[0];
  const slotVar = { excelFieldKey: '镜片摘要', varType: 'text', computedRule: rule };
  const out = computeVariableValueByRules({ slotVar, row, allRows });
  assert.equal(out, '高清偏光/非偏光');
});

test('lensTypeSummary: 按款号汇总多行偏光状态（仅偏光）', () => {
  const rule = { type: 'lensTypeSummary', polarizationKeyword: '偏光', groupByFieldKey: '款号', polarizationFieldKey: '是否偏光' };
  const allRows = [
    { 款号: 'BJ3205', 是否偏光: '偏光' },
    { 款号: 'BJ3205', 是否偏光: '' },
  ];
  const row = allRows[0];
  const slotVar = { excelFieldKey: '镜片摘要', varType: 'text', computedRule: rule };
  const out = computeVariableValueByRules({ slotVar, row, allRows });
  assert.equal(out, '高清偏光');
});

test('keywordContains: should treat 非偏光 as not hit for 偏光 keyword', () => {
  const rule = { type: 'keywordContains', sourceFieldKey: '是否偏光', keyword: '偏光', trueText: 'T', falseText: 'F' };
  const row = { 是否偏光: '非偏光' };
  const slotVar = { excelFieldKey: '是否偏光', varType: 'text', computedRule: rule };
  const out = computeVariableValueByRules({ slotVar, row, allRows: [] });
  assert.equal(out, 'F');
});

test('keywordContains: 不偏光不应被当作命中偏光', () => {
  const rule = { type: 'keywordContains', sourceFieldKey: '是否偏光', keyword: '偏光', trueText: 'T', falseText: 'F' };
  const row = { 是否偏光: '不偏光' };
  const slotVar = { excelFieldKey: '是否偏光', varType: 'text', computedRule: rule };
  const out = computeVariableValueByRules({ slotVar, row, allRows: [] });
  assert.equal(out, 'F');
});

test('computeVariableValueByRules: 规则链应按顺序串行执行并让后续规则读取前一步结果', () => {
  const slotVar = {
    excelFieldKey: '材质',
    varType: 'text',
    computedRules: [
      {
        type: 'valueMap',
        sourceFieldKey: '材质',
        mapping: { TR: '高性能尼龙' },
        defaultToSource: true,
      },
      {
        type: 'concatFields',
        fieldTypes: ['field', 'literal'],
        fieldKeys: ['材质', ''],
        literalValues: ['', '镜框'],
        fieldPrefixes: ['', ''],
        fieldSuffixes: ['', ''],
        joiner: '',
      },
    ],
    computedRule: { type: 'constant', value: '不应回退到单条规则' },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 材质: 'TR' }, allRows: [] });
  assert.equal(out, '高性能尼龙镜框');
});

test('computeVariableValueByRules: concatFields 的连接符号支持空格', () => {
  const slotVar = {
    varType: 'text',
    computedRule: { type: 'concatFields', fieldKeys: ['a', 'b'], fieldPrefixes: ['', ''], fieldSuffixes: ['', ''], joiner: ' ' },
  };
  const out = computeVariableValueByRules({ slotVar, row: { a: 'AA', b: 'BB' }, allRows: [] });
  assert.equal(out, 'AA BB');
});

test('concatFields: 镜框颜色为 / 时应跳过镜框与连接符', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'concatFields',
      fieldKeys: ['镜框颜色', '镜片颜色'],
      fieldPrefixes: ['', ''],
      fieldSuffixes: ['镜框', '镜片'],
      joiner: '+',
      fieldIgnoreValues: [['/', '／'], ['/', '／']],
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 镜框颜色: '/', 镜片颜色: '淡茶渐近' }, allRows: [] });
  assert.equal(out, '淡茶渐近镜片');
});

test('concatFields: 正常拼接镜框与镜片后缀', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'concatFields',
      fieldKeys: ['镜框颜色', '镜片颜色'],
      fieldPrefixes: ['', ''],
      fieldSuffixes: ['镜框', '镜片'],
      joiner: '+',
      fieldIgnoreValues: [['/', '／'], ['/', '／']],
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 镜框颜色: '亮黑色', 镜片颜色: '深灰色' }, allRows: [] });
  assert.equal(out, '亮黑色镜框+深灰色镜片');
});

test('valueMap: 组合值应支持部分替换', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'valueMap',
      sourceFieldKey: '材质',
      mapping: {
        TR: '高性能尼龙',
      },
      defaultToSource: true,
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 材质: 'TR+合金' }, allRows: [] });
  assert.equal(out, '高性能尼龙+合金');
});

test('valueMap: 完全命中映射时保持原有行为', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'valueMap',
      sourceFieldKey: '材质',
      mapping: {
        TR: '高性能尼龙',
      },
      defaultToSource: true,
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 材质: 'TR' }, allRows: [] });
  assert.equal(out, '高性能尼龙');
});

test('valueMap: 开启精确匹配后不应对组合值做部分替换', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'valueMap',
      sourceFieldKey: '材质',
      mapping: {
        TR: '高性能尼龙',
      },
      exactMatchOnly: true,
      defaultToSource: true,
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 材质: 'TR+合金' }, allRows: [] });
  assert.equal(out, 'TR+合金');
});

test('concatFields: 支持按字段配置不同连接符', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'concatFields',
      fieldKeys: ['款号', '色号', '角度'],
      fieldPrefixes: ['', '', ''],
      fieldSuffixes: ['', '', ''],
      fieldJoiners: ['', '-', '/'],
      joiner: '+',
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 款号: 'BL5108', 色号: 'C90', 角度: '45' }, allRows: [] });
  assert.equal(out, 'BL5108-C90/45');
});

test('concatFields: 中间字段被过滤后应使用后续字段自己的连接符', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'concatFields',
      fieldKeys: ['镜框颜色', '镜片颜色', '角度'],
      fieldPrefixes: ['', '', ''],
      fieldSuffixes: ['', '', ''],
      fieldJoiners: ['', '+', '/'],
      fieldIgnoreValues: [['/', '／'], ['/', '／'], []],
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 镜框颜色: '亮黑', 镜片颜色: '/', 角度: '45' }, allRows: [] });
  assert.equal(out, '亮黑/45');
});

test('concatFields: 支持固定文案并兼容可选字段过滤', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'concatFields',
      fieldTypes: ['field', 'field', 'literal'],
      fieldKeys: ['原本镜腿', '腿套', ''],
      literalValues: ['', '', '镜腿'],
      fieldPrefixes: ['', '', ''],
      fieldSuffixes: ['', '', ''],
      fieldJoiners: ['', '', ''],
      fieldIgnoreValues: [[], ['/', '／'], []],
      joiner: '',
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 原本镜腿: '金属', 腿套: '/' }, allRows: [] });
  assert.equal(out, '金属镜腿');
});

test('concatFields: 固定文案与可选字段都存在时应完整拼接', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'concatFields',
      fieldTypes: ['field', 'field', 'literal'],
      fieldKeys: ['原本镜腿', '腿套', ''],
      literalValues: ['', '', '镜腿'],
      fieldPrefixes: ['', '', ''],
      fieldSuffixes: ['', '', ''],
      fieldJoiners: ['', '', ''],
      fieldIgnoreValues: [[], ['/', '／'], []],
      joiner: '',
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 原本镜腿: '金属', 腿套: '硅胶' }, allRows: [] });
  assert.equal(out, '金属硅胶镜腿');
});

test('computeVariableValueByRules: 规则链支持按字段值覆盖 concatFields 单段输出', () => {
  const slotVar = {
    excelFieldKey: '镜框颜色',
    varType: 'text',
    computedRules: [
      {
        type: 'valueMap',
        sourceFieldKey: '镜框颜色',
        mapping: { '/': '无框', '／': '无框' },
        defaultToSource: true,
      },
      {
        type: 'concatFields',
        fieldKeys: ['镜框颜色', '镜片颜色'],
        fieldPrefixes: ['', ''],
        fieldSuffixes: ['镜框', '镜片'],
        fieldJoiners: ['', '+'],
        fieldPartOverrides: [{ 无框: '无框' }, {}],
      },
    ],
  };
  const out = computeVariableValueByRules({ slotVar, row: { 镜框颜色: '/', 镜片颜色: '淡茶渐近' }, allRows: [] });
  assert.equal(out, '无框+淡茶渐近镜片');
});

test('concatFields: 未命中字段覆盖映射时保持原有后缀拼接', () => {
  const slotVar = {
    varType: 'text',
    computedRule: {
      type: 'concatFields',
      fieldKeys: ['镜框颜色', '镜片颜色'],
      fieldPrefixes: ['', ''],
      fieldSuffixes: ['镜框', '镜片'],
      fieldJoiners: ['', '+'],
      fieldPartOverrides: [{ 无框: '无框' }, {}],
    },
  };
  const out = computeVariableValueByRules({ slotVar, row: { 镜框颜色: '亮黑色', 镜片颜色: '深灰色' }, allRows: [] });
  assert.equal(out, '亮黑色镜框+深灰色镜片');
});
