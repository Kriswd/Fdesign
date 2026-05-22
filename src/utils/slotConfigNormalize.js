export function normalizeSlotsAgainstVariables(slots, variables) {
  const slotList = Array.isArray(slots) ? slots : [];
  const varList = Array.isArray(variables) ? variables : [];

  const psIdToVar = new Map();
  for (let i = 0; i < varList.length; i += 1) {
    const v = varList[i];
    const psId = Number(v?.psId);
    if (!Number.isFinite(psId)) continue;
    if (!psIdToVar.has(psId)) psIdToVar.set(psId, v);
  }

  return slotList.map((s) => {
    const vars = Array.isArray(s?.variables) ? s.variables : [];
    const outVars = [];
    const seen = new Set();
    for (let i = 0; i < vars.length; i += 1) {
      const v = vars[i];
      if (!v || typeof v !== 'object') continue;
      const psId = Number(v.psId);
      const hit = Number.isFinite(psId) ? psIdToVar.get(psId) || null : null;
      const normalizedId = hit && hit.id != null ? String(hit.id) : (v.id != null ? String(v.id) : '');
      const key = Number.isFinite(psId) ? `ps:${psId}` : (normalizedId ? `id:${normalizedId}` : '');
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      const varType = hit?.varType || v.type || v.varType || null;
      const nextAlign =
        String(varType || '').toLowerCase() === 'text'
          ? (v.align === 'center' || v.align === 'right' || v.align === 'left' ? v.align : 'left')
          : null;
      outVars.push({
        ...v,
        id: normalizedId,
        psId: Number.isFinite(psId) ? psId : hit?.psId ?? v.psId,
        name: v.name || hit?.name || hit?.key || normalizedId,
        label: v.label || hit?.name || hit?.key || normalizedId,
        type: v.type || v.varType || varType,
        varType: v.varType || v.type || varType,
        ...(nextAlign ? { align: nextAlign } : {}),
      });
    }
    return { ...s, variables: outVars };
  });
}

