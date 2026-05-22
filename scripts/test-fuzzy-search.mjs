import assert from 'node:assert/strict';
import { buildHaystackLower, tokenizeQuery, filterRowsByQuery } from '../src/utils/fuzzySearch.mjs';

const headers = ['品牌', '型号', '色号', '价格'];
const rows = [
  { 品牌: 'Nike', 型号: 'Air Max', 色号: 'C90', 价格: 199 },
  { 品牌: 'BOLON', 型号: 'BL3209', 色号: 'C90', 价格: 139 },
  { 品牌: null, 型号: 'X', 色号: undefined, 价格: '' },
];

assert.deepEqual(tokenizeQuery('  BL3209   C90  '), ['bl3209', 'c90']);

const index = rows.map((row) => buildHaystackLower(row, headers));
assert.equal(index[0].includes('nike'), true);
assert.equal(index[1].includes('bl3209'), true);

assert.equal(filterRowsByQuery(rows, headers, 'nike').length, 1);
assert.equal(filterRowsByQuery(rows, headers, 'c90').length, 2);
assert.equal(filterRowsByQuery(rows, headers, 'bl3209 c90').length, 1);
assert.equal(filterRowsByQuery(rows, headers, '').length, 3);

console.log('ok');

