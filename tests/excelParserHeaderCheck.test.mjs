import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseExcelFile } from '../src/utils/excelParser.js';
import { useDataStore } from '../src/store/dataStore.js';

function makeExcelArrayBuffer(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

test('parseExcelFile header mismatch should not throw and should set excelHeaderCheck', async () => {
  useDataStore.getState().resetData();
  const ab = makeExcelArrayBuffer([{ A: '1', B: '2' }]);
  const file = {
    name: 't.xlsx',
    arrayBuffer: async () => ab,
  };

  await parseExcelFile(file, { expectedHeaders: ['A', 'C'] });

  const st = useDataStore.getState();
  assert.deepEqual(st.rawHeaders, ['A', 'B']);
  assert.ok(st.excelHeaderCheck);
  assert.equal(st.excelHeaderCheck.ok, false);
  assert.deepEqual(st.excelHeaderCheck.missing, ['C']);
  assert.deepEqual(st.excelHeaderCheck.extra, ['B']);
});

test('parseExcelFile should normalize BOM headers and row keys', async () => {
  useDataStore.getState().resetData();
  const ab = makeExcelArrayBuffer([{ '\uFEFF是否偏光': '偏光', '款号': 'BL3096' }]);
  const file = {
    name: 't.xlsx',
    arrayBuffer: async () => ab,
  };

  await parseExcelFile(file);

  const st = useDataStore.getState();
  assert.ok(st.rawHeaders.includes('是否偏光'));
  assert.ok(st.rawHeaders.includes('款号'));
  assert.equal(st.rows[0]['是否偏光'], '偏光');
  assert.equal(st.rows[0]['款号'], 'BL3096');
});
