import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyPublicSurface } from '../scripts/verify_public_surface.mjs';

test('public-facing launch surfaces should not expose internal launch material or concrete private data categories', () => {
  const result = verifyPublicSurface(process.cwd());

  assert.deepEqual(result.missingFiles, []);
  assert.deepEqual(result.internalPathHits, []);
  assert.deepEqual(result.phraseHits, []);
  assert.equal(result.ok, true);
});
