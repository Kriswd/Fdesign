const baseUrl = 'http://127.0.0.1:3001';

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
    await sleep(300);
  }
  return false;
}

async function run() {
  process.env.PORT = '3001';
  process.env.DISABLE_SCHEDULED_CLEANUP = 'true';
  const mod = await import('./index.js');
  const server = mod?.server;
  const ok = await waitForHealth();
  if (!ok) throw new Error('服务器未就绪');

  const failures = [];

  const adminMeRes = await fetch(`${baseUrl}/api/admin/me`);
  if (adminMeRes.status !== 200) {
    failures.push(`/api/admin/me 期望 200，实际 ${adminMeRes.status}`);
  } else {
    const data = await adminMeRes.json().catch(() => null);
    if (!data || data.authenticated !== false) {
      failures.push(`/api/admin/me 期望 authenticated=false`);
    }
  }

  const exportVarRes = await fetch(`${baseUrl}/api/template/export-variable-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId: 'invalid' }),
  });
  if (exportVarRes.status !== 400) {
    failures.push(`/api/template/export-variable-images 期望 400，实际 ${exportVarRes.status}`);
  }

  if (failures.length > 0) {
    throw new Error(failures.join(' | '));
  }

  console.log('✅ PASS');
  if (server && typeof server.close === 'function') {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error('❌ FAIL', err.message || err);
  process.exitCode = 1;
});
