export function normalizeBaseUrl(input) {
  const raw = typeof input === 'string' ? input : '';
  return raw.trim().replace(/\/+$/g, '');
}

export function getApiBaseCandidates(renderServerBaseUrl) {
  const base = normalizeBaseUrl(renderServerBaseUrl);
  const candidates = [];
  if (base) candidates.push(base);
  if (typeof window !== 'undefined') {
    const origin = window.location?.origin || '';
    if (origin) candidates.push(origin);
    const protocol = window.location?.protocol || 'http:';
    const hostname = window.location?.hostname || '';
    if (hostname) candidates.push(`${protocol}//${hostname}:3001`);
  }
  candidates.push('http://localhost:3001');
  return Array.from(new Set(candidates.map((c) => normalizeBaseUrl(c)).filter(Boolean)));
}

export function buildApiUrl(base, p) {
  const baseUrl = normalizeBaseUrl(base);
  const path = String(p || '');
  if (!path) return baseUrl || '';
  if (baseUrl) return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  return path.startsWith('/') ? path : `/${path}`;
}

export function resolveDownloadUrl(relativeUrl, apiBaseCandidates, preferredBase) {
  const raw = String(relativeUrl || '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = normalizeBaseUrl(preferredBase) || (Array.isArray(apiBaseCandidates) ? apiBaseCandidates[0] : '') || '';
  if (base) {
    try {
      return new URL(raw, base).toString();
    } catch {
      return `${base}${raw}`;
    }
  }
  return raw;
}

function pickAssetBase(raw, preferredBase, apiBaseCandidates) {
  const preferred = normalizeBaseUrl(preferredBase);
  if (preferred) return preferred;
  const list = Array.isArray(apiBaseCandidates) ? apiBaseCandidates.map((c) => normalizeBaseUrl(c)).filter(Boolean) : [];
  if (list.length === 0) return '';
  if (raw.startsWith('/output')) {
    const byPort = list.find((c) => {
      try {
        const u = new URL(c);
        return String(u.port || '') === '3001';
      } catch {
        return /:3001($|\/)/.test(c);
      }
    });
    if (byPort) return byPort;
  }
  return list[0];
}

export function resolveAssetUrl(value, preferredBase, apiBaseCandidates) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:') || /^https?:\/\//i.test(raw)) return raw;
  const base = pickAssetBase(raw, preferredBase, apiBaseCandidates);
  if (!base) return raw;
  try {
    return new URL(raw, base).toString();
  } catch {
    return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }
}

export async function readJsonSafely(res) {
  if (!res) return null;
  try {
    return await res.clone().json();
  } catch {
    try {
      const text = await res.clone().text();
      const snippet = String(text || '').trim().slice(0, 800);
      if (!snippet) return null;
      return { error: '非JSON响应', message: snippet };
    } catch {
      return null;
    }
  }
}

export function createApiClient(renderServerBaseUrl) {
  const apiBaseCandidates = getApiBaseCandidates(renderServerBaseUrl);
  const fetchWithFallback = async (path, options) => {
    const attempts = [];
    let lastError = null;
    let lastResponse = null;
    const bases = apiBaseCandidates.length > 0 ? apiBaseCandidates : [''];
    const origin = typeof window !== 'undefined' ? normalizeBaseUrl(window.location?.origin || '') : '';
    for (const base of bases) {
      const url = buildApiUrl(base, path);
      try {
        const res = await fetch(url, options);
        attempts.push({ url, status: res.status, ok: res.ok });
        lastResponse = res;
        if (res.status === 404) {
          continue;
        }
        const normalizedBase = normalizeBaseUrl(base);
        if (origin && normalizedBase === origin && res.status >= 500) {
          const ct = String(res.headers.get('content-type') || '').toLowerCase();
          const looksLikeJson = ct.includes('application/json') || ct.includes('application/problem+json');
          if (!looksLikeJson) {
            continue;
          }
        }
        if (res.status !== 404) {
          return { res, meta: { url, attempts } };
        }
      } catch (err) {
        lastError = err;
        attempts.push({ url, error: err ? String(err.message || err) : 'error' });
      }
    }
    if (lastResponse) return { res: lastResponse, meta: { url: attempts[attempts.length - 1]?.url || '', attempts } };
    const fallbackError = lastError || new Error('请求失败');
    fallbackError.attempts = attempts;
    throw fallbackError;
  };

  return {
    apiBaseCandidates,
    buildApiUrl,
    fetchWithFallback,
    resolveDownloadUrl: (relativeUrl, preferredBase) => resolveDownloadUrl(relativeUrl, apiBaseCandidates, preferredBase),
    resolveAssetUrl: (value, preferredBase) => resolveAssetUrl(value, preferredBase, apiBaseCandidates),
    readJsonSafely,
  };
}
