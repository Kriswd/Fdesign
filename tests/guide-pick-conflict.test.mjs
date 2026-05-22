import test from 'node:test';
import assert from 'node:assert/strict';

import { findDuplicateImageGuideMismatches } from '../src/utils/imageGuideMismatch.js';
import { createDuplicateImageGuideGuard } from '../server/services/photoshopIngest.js';

test('findDuplicateImageGuideMismatches: same imageKey with same guideKey is ok', () => {
  const mismatches = findDuplicateImageGuideMismatches([
    { imageKey: 'https://a/b.png', guideKey: '10,20', psId: 1, name: 'A' },
    { imageKey: 'https://a/b.png', guideKey: '10,20', psId: 2, name: 'B' },
  ]);
  assert.deepEqual(mismatches, []);
});

test('findDuplicateImageGuideMismatches: different guideKey triggers mismatch', () => {
  const mismatches = findDuplicateImageGuideMismatches([
    { imageKey: 'https://a/b.png', guideKey: '10,20', psId: 1, name: 'A' },
    { imageKey: 'https://a/b.png', guideKey: '11,20', psId: 2, name: 'B' },
  ]);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].imageKey, 'https://a/b.png');
  assert.equal(mismatches[0].items.length, 2);
});

test('findDuplicateImageGuideMismatches: none vs defined triggers mismatch', () => {
  const mismatches = findDuplicateImageGuideMismatches([
    { imageKey: 'x', guideKey: 'none', psId: 1, name: 'A' },
    { imageKey: 'x', guideKey: '10,20', psId: 2, name: 'B' },
  ]);
  assert.equal(mismatches.length, 1);
});

test('createDuplicateImageGuideGuard: mismatch should throw by default', () => {
  const guard = createDuplicateImageGuideGuard();
  guard.register({ imageKey: 'x', guideKey: '10,20', psId: 1, name: 'A' });
  assert.throws(() => {
    guard.register({ imageKey: 'x', guideKey: '11,20', psId: 2, name: 'B' });
  });
});

test('createDuplicateImageGuideGuard: allowMismatch should not throw', () => {
  const guard = createDuplicateImageGuideGuard({ allowMismatch: true });
  guard.register({ imageKey: 'x', guideKey: '10,20', psId: 1, name: 'A' });
  guard.register({ imageKey: 'x', guideKey: '11,20', psId: 2, name: 'B' });
  assert.ok(true);
});
