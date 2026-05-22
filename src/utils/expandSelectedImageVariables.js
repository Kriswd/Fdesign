function isFiniteNumber(v) {
  return Number.isFinite(Number(v));
}

function sameRect(a, b, tol) {
  const t = Number.isFinite(Number(tol)) ? Number(tol) : 1;
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const aw = Number(a?.width);
  const ah = Number(a?.height);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  const bw = Number(b?.width);
  const bh = Number(b?.height);
  if (![ax, ay, aw, ah, bx, by, bw, bh].every((n) => Number.isFinite(n))) return false;
  return (
    Math.abs(ax - bx) <= t &&
    Math.abs(ay - by) <= t &&
    Math.abs(aw - bw) <= t &&
    Math.abs(ah - bh) <= t
  );
}

export function expandSelectedImageVariables({ variables, selectedPsIds, tolerancePx = 2 }) {
  const vars = Array.isArray(variables) ? variables : [];
  const selected = Array.isArray(selectedPsIds) ? selectedPsIds : [];
  const selectedSet = new Set(selected.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
  if (selectedSet.size === 0) return [];

  const imageVars = vars.filter((v) => String(v?.varType || v?.type || '').toLowerCase() === 'img');
  const selectedVars = imageVars.filter((v) => isFiniteNumber(v?.psId) && selectedSet.has(Number(v.psId)));
  if (selectedVars.length === 0) return [];

  const expanded = new Map();
  for (const v of selectedVars) {
    const psId = Number(v.psId);
    expanded.set(psId, v);
  }

  for (const v of imageVars) {
    const psId = Number(v?.psId);
    if (!Number.isFinite(psId)) continue;
    if (expanded.has(psId)) continue;
    for (const base of selectedVars) {
      if (sameRect(v, base, tolerancePx)) {
        expanded.set(psId, v);
        break;
      }
    }
  }

  return Array.from(expanded.values());
}

