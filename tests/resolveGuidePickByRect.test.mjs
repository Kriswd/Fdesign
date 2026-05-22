import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGuidePickByRect } from '../src/utils/resolveGuidePickByRect.js';

test('resolveGuidePickByRect should propagate guidePick to same-rect variables', () => {
  const variables = [
    { psId: 668, varType: 'img', x: -9, y: 175, width: 799, height: 449, name: 'C90' },
    { psId: 669, varType: 'img', x: -9, y: 175, width: 799, height: 449, name: 'C10' },
    { psId: 670, varType: 'img', x: -9, y: 175, width: 799, height: 449, name: 'C20' },
  ];

  const manual = new Map([[668, { leftX: 64, rightX: 737 }]]);
  const out = resolveGuidePickByRect({ variables, manualGuidePicksByPsId: manual, tolerancePx: 2 });

  assert.deepEqual(out.get(668), { leftX: 64, rightX: 737 });
  assert.deepEqual(out.get(669), { leftX: 64, rightX: 737 });
  assert.deepEqual(out.get(670), { leftX: 64, rightX: 737 });
});

