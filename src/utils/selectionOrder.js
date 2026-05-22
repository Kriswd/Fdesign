export function orderBySelectedIds(variables, selectedIds) {
  const list = Array.isArray(variables) ? variables : [];
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  const byId = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const v = list[i];
    const id = v && v.id != null ? String(v.id) : '';
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, v);
  }

  const out = [];
  const seen = new Set();
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i] != null ? String(ids[i]) : '';
    if (!id) continue;
    if (seen.has(id)) continue;
    const v = byId.get(id);
    if (!v) continue;
    seen.add(id);
    out.push(v);
  }
  return out;
}

