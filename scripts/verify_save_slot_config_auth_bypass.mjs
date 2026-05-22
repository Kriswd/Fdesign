const baseUrl = 'http://127.0.0.1:3015';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(retries = 20) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await sleep(200);
  }
  return false;
}

async function run() {
  process.env.PORT = '3015';
  process.env.DISABLE_SCHEDULED_CLEANUP = 'true';
  const mod = await import('../server/index.js');
  const server = mod?.server;

  const ok = await waitForHealth();
  if (!ok) throw new Error('服务器未就绪');

  const res = await fetch(`${baseUrl}/api/template/invalid/slot-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId: 'invalid', slots: [], fieldDefinitions: [] }),
  });

  if (res.status !== 400) {
    const data = await res.text().catch(() => '');
    throw new Error(`期望 400，实际 ${res.status} ${data}`);
  }

  if (server && typeof server.close === 'function') {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('PASS');
}

run().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exitCode = 1;
});

