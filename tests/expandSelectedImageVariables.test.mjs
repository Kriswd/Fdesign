import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSelectedImageVariables } from '../src/utils/expandSelectedImageVariables.js';

test('expandSelectedImageVariables should include same-rect alternates', () => {
  const variables = [
    { psId: 668, varType: 'img', x: -9, y: 175, width: 799, height: 449, name: 'C90' },
    { psId: 669, varType: 'img', x: -9, y: 175, width: 799, height: 449, name: 'C10' },
    { psId: 670, varType: 'img', x: -9, y: 175, width: 799, height: 449, name: 'C20' },
    { psId: 900, varType: 'img', x: 10, y: 10, width: 100, height: 100, name: 'other' },
  ];

  const out = expandSelectedImageVariables({
    variables,
    selectedPsIds: [668],
  });

  assert.deepEqual(
    out.map((v) => v.psId).sort((a, b) => a - b),
    [668, 669, 670],
  );
});

