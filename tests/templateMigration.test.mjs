import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateGuidePicks, migrateSlotConfig } from '../server/utils/templateMigration.js';

test('migrateSlotConfig should migrate by key when psId changes', () => {
  const oldVars = [
    { id: '1', psId: 10, key: 'title', varType: 'text', path: 'A/B', x: 10, y: 10, width: 100, height: 20 },
    { id: '2', psId: 11, key: 'img1', varType: 'img', path: 'A/C', x: 10, y: 50, width: 200, height: 200 },
  ];
  const newVars = [
    { id: 'n1', psId: 110, key: 'title', varType: 'text', path: 'A/B', x: 10, y: 10, width: 100, height: 20 },
    { id: 'n2', psId: 111, key: 'img1', varType: 'img', path: 'A/C', x: 10, y: 50, width: 200, height: 200 },
  ];
  const oldConfig = {
    templateId: 't',
    version: 1,
    fieldDefinitions: [{ key: 'TITLE', label: '标题', type: 'text' }],
    ignoredVariableIds: ['2'],
    ignoredFieldKeys: [],
    slots: [
      {
        id: 's1',
        name: 'S1',
        variables: [
          { id: '1', psId: 10, type: 'text', excelFieldKey: 'TITLE', computedRule: 'x', computedRules: [] },
          {
            id: '2',
            psId: 11,
            type: 'img',
            excelFieldKey: 'PIC',
            computedRule: null,
            computedRules: [{ type: 'concatFields', fieldKeys: ['A'] }],
          },
        ],
      },
    ],
  };

  const out = migrateSlotConfig({ oldVars, newVars, oldConfig, templateId: 't' });
  assert.equal(out.config.slots[0].variables[0].psId, 110);
  assert.equal(out.config.slots[0].variables[0].excelFieldKey, 'TITLE');
  assert.equal(out.config.slots[0].variables[1].psId, 111);
  assert.deepEqual(out.config.ignoredVariableIds, ['n2']);
  assert.equal(out.report.matchedBy.key, 2);
});

test('migrateSlotConfig should keep unmatched entries and report them', () => {
  const oldVars = [{ id: '1', psId: 10, key: 'a', varType: 'text', path: 'A', x: 10, y: 10, width: 100, height: 20 }];
  const newVars = [{ id: 'n1', psId: 110, key: 'a', varType: 'text', path: 'A', x: 10, y: 10, width: 100, height: 20 }];
  const oldConfig = {
    templateId: 't',
    version: 1,
    fieldDefinitions: [],
    ignoredVariableIds: [],
    ignoredFieldKeys: [],
    slots: [
      {
        id: 's1',
        name: 'S1',
        variables: [
          { id: '1', psId: 10, type: 'text', excelFieldKey: 'X', computedRule: null, computedRules: [] },
          { id: '2', psId: 20, type: 'text', excelFieldKey: 'Y', computedRule: null, computedRules: [] },
        ],
      },
    ],
  };

  const out = migrateSlotConfig({ oldVars, newVars, oldConfig, templateId: 't' });
  assert.equal(out.config.slots[0].variables.length, 2);
  assert.equal(out.config.slots[0].variables[0].psId, 110);
  assert.equal(out.config.slots[0].variables[1].psId, 20);
  assert.ok(out.report.unmatched.some((u) => u && u.old && u.old.psId === 20));
});

test('migrateGuidePicks should remap old psId keys to new psId by key/path', () => {
  const oldVars = [
    { id: '1', psId: 11, key: 'img_main', varType: 'img', path: 'A/主图' },
    { id: '2', psId: 22, key: 'img_side', varType: 'img', path: 'A/侧图' },
  ];
  const newVars = [
    { id: 'n1', psId: 111, key: 'img_main', varType: 'img', path: 'A/主图' },
    { id: 'n2', psId: 222, key: 'img_side', varType: 'img', path: 'A/侧图' },
  ];
  const oldGuidePicks = {
    '11': { leftX: 100, rightX: 300 },
    '22': { leftX: 120, rightX: 320 },
  };

  const out = migrateGuidePicks({ oldGuidePicks, oldVars, newVars });
  assert.deepEqual(out, {
    '111': { leftX: 100, rightX: 300 },
    '222': { leftX: 120, rightX: 320 },
  });
});

test('migrateGuidePicks should keep same psId when it still exists', () => {
  const oldVars = [{ id: '1', psId: 11, key: 'img_main', varType: 'img', path: 'A/主图' }];
  const newVars = [{ id: 'n1', psId: 11, key: 'img_main', varType: 'img', path: 'A/主图' }];
  const oldGuidePicks = { '11': { leftX: 100, rightX: 300 } };
  const out = migrateGuidePicks({ oldGuidePicks, oldVars, newVars });
  assert.deepEqual(out, { '11': { leftX: 100, rightX: 300 } });
});
