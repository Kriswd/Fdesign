import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPsdGuides } from '../src/utils/psdClientParser.js';

test('extractPsdGuides should not divide by 32 when location is within canvas', () => {
  const psd = {
    imageResources: {
      gridAndGuidesInformation: {
        guides: [
          { location: 64, direction: 'vertical' },
          { location: 737, direction: 'vertical' },
          { location: 400, direction: 'horizontal' },
        ],
      },
    },
  };

  const out = extractPsdGuides(psd, 800, 800);
  assert.deepEqual(out.vertical, [64, 737]);
  assert.deepEqual(out.horizontal, [400]);
});

