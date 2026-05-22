import test from 'node:test';
import assert from 'node:assert/strict';

import { waitForFirstExistingPath } from '../server/services/exportResultResolver.js';

test('waitForFirstExistingPath 在轮询窗口内返回首个存在文件', async () => {
  let checks = 0;
  const fakeFs = {
    existsSync(filePath) {
      checks += 1;
      if (filePath === 'a.psd') return checks >= 3;
      return false;
    },
    statSync() {
      return { isFile: () => true, size: 128 };
    },
  };

  const hit = await waitForFirstExistingPath({
    fs: fakeFs,
    candidates: ['a.psd', 'b.psd'],
    maxWaitMs: 100,
    pollIntervalMs: 10,
    minBytes: 32,
  });

  assert.equal(hit, 'a.psd');
});

test('waitForFirstExistingPath 超时返回 null', async () => {
  const fakeFs = {
    existsSync() {
      return false;
    },
    statSync() {
      return { isFile: () => true, size: 128 };
    },
  };

  const hit = await waitForFirstExistingPath({
    fs: fakeFs,
    candidates: ['a.psd'],
    maxWaitMs: 30,
    pollIntervalMs: 10,
    minBytes: 32,
  });

  assert.equal(hit, null);
});
