export function autoChainOnSave({ chain, rule, normalizeEntry }) {
  const list = Array.isArray(chain) ? chain : [];
  if (!normalizeEntry || typeof normalizeEntry !== 'function') return list;
  const entry = normalizeEntry(rule);
  if (!entry) return list;
  if (list.length === 0) return [entry];
  const serializedEntry = JSON.stringify({ ...entry, id: undefined, enabled: undefined, op: undefined });
  const exists = list.some((item) => {
    const normalized = normalizeEntry(item);
    if (!normalized) return false;
    return JSON.stringify({ ...normalized, id: undefined, enabled: undefined, op: undefined }) === serializedEntry;
  });
  return exists ? list : [...list, entry];
}

