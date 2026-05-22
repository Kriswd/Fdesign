export const tokenizeQuery = (query) => {
  const raw = typeof query === 'string' ? query : query == null ? '' : String(query);
  const tokens = raw
    .trim()
    .toLowerCase()
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t);
  return tokens;
};

export const buildHaystackLower = (row, headers) => {
  const r = row && typeof row === 'object' ? row : {};
  const cols = Array.isArray(headers) && headers.length > 0 ? headers : Object.keys(r);
  let out = '';
  for (let i = 0; i < cols.length; i += 1) {
    const k = cols[i];
    if (k == null) continue;
    const v = r[k];
    if (v == null) continue;
    const s = typeof v === 'string' ? v : String(v);
    if (!s) continue;
    out += `${s} `;
  }
  return out.trim().toLowerCase();
};

export const rowMatchesTokens = (haystackLower, tokens) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return true;
  const hay = typeof haystackLower === 'string' ? haystackLower : String(haystackLower || '');
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!t) continue;
    if (!hay.includes(t)) return false;
  }
  return true;
};

export const filterRowsByQuery = (rows, headers, query) => {
  const list = Array.isArray(rows) ? rows : [];
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return list;
  const cols = Array.isArray(headers) && headers.length > 0 ? headers : null;
  return list.filter((row) => {
    const hay = buildHaystackLower(row, cols);
    return rowMatchesTokens(hay, tokens);
  });
};

