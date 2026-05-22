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

function isValidGuidePick(p) {
  const leftX = Number(p?.leftX);
  const rightX = Number(p?.rightX);
  return Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX;
}

export function resolveGuidePickByRect({ variables, manualGuidePicksByPsId, tolerancePx = 2 }) {
  const vars = Array.isArray(variables) ? variables : [];
  const manual = manualGuidePicksByPsId instanceof Map ? manualGuidePicksByPsId : new Map();
  const out = new Map();

  const imageVars = vars.filter((v) => String(v?.varType || v?.type || '').toLowerCase() === 'img');
  const picks = [];
  for (const v of imageVars) {
    const psId = Number(v?.psId);
    if (!Number.isFinite(psId)) continue;
    const p = manual.get(psId);
    if (!isValidGuidePick(p)) continue;
    picks.push({ v, psId, pick: { leftX: Number(p.leftX), rightX: Number(p.rightX) } });
  }

  for (const v of imageVars) {
    const psId = Number(v?.psId);
    if (!Number.isFinite(psId)) continue;
    const own = manual.get(psId);
    if (isValidGuidePick(own)) {
      out.set(psId, { leftX: Number(own.leftX), rightX: Number(own.rightX) });
      continue;
    }
    for (const p of picks) {
      if (sameRect(v, p.v, tolerancePx)) {
        out.set(psId, p.pick);
        break;
      }
    }
  }

  return out;
}

