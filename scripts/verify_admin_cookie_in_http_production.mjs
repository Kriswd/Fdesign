const baseUrl = 'http://127.0.0.1:3016';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(retries = 30) {
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
  process.env.PORT = '3016';
  process.env.NODE_ENV = 'production';
  process.env.DISABLE_SCHEDULED_CLEANUP = 'true';

  const mod = await import('../server/index.js');
  const server = mod?.server;

  const ok = await waitForHealth();
  if (!ok) throw new Error('服务器未就绪');

  const password = String(process.env.ADMIN_TEST_PASSWORD || '').trim();
  if (!password) {
    if (server && typeof server.close === 'function') {
      await new Promise((resolve) => server.close(resolve));
    }
    console.log('SKIP');
    return;
  }

  const resp = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const rawCookie = resp.headers.get('set-cookie') || '';
  if (!resp.ok) {
    const data = await resp.text().catch(() => '');
    throw new Error(`登录失败: ${resp.status} ${data}`);
  }
  if (!rawCookie.includes('fdesign_admin=')) throw new Error('未返回管理员 cookie');
  if (/;\s*Secure\b/i.test(rawCookie)) throw new Error('HTTP 下不应设置 Secure cookie');

  if (server && typeof server.close === 'function') {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('PASS');
}

run().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exitCode = 1;
});
