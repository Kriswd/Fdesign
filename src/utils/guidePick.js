export function normalizeGuidePick(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const leftX = Number(raw.leftX);
  const rightX = Number(raw.rightX);
  if (!Number.isFinite(leftX) || !Number.isFinite(rightX)) return null;
  if (rightX <= leftX) return null;
  return { leftX: Math.round(leftX), rightX: Math.round(rightX) };
}

export function nextGuidePick(prevPick, pickedX) {
  const px = Math.round(Number(pickedX));
  if (!Number.isFinite(px)) return prevPick || null;
  const prev = prevPick && typeof prevPick === 'object' ? prevPick : {};
  const toIntOrNull = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const prevLeft = toIntOrNull(prev.leftX);
  const prevRight = toIntOrNull(prev.rightX);
  let leftX = prevLeft;
  let rightX = prevRight;

  if (leftX == null && rightX == null) {
    leftX = px;
    rightX = null;
  } else if (leftX != null && rightX == null) {
    rightX = px;
  } else if (leftX == null && rightX != null) {
    leftX = px;
  } else if (leftX != null && rightX != null) {
    const mid = (leftX + rightX) / 2;
    if (px <= mid) leftX = px;
    else rightX = px;
  }

  if (leftX != null && rightX != null && rightX < leftX) {
    const tmp = leftX;
    leftX = rightX;
    rightX = tmp;
  }

  return { leftX, rightX };
}

export function guidePicksObjectToMap(obj) {
  const map = new Map();
  if (!obj || typeof obj !== 'object') return map;
  Object.keys(obj).forEach((key) => {
    const psId = Math.trunc(Number(key));
    if (!Number.isFinite(psId) || psId <= 0) return;
    const pick = normalizeGuidePick(obj[key]);
    if (!pick) return;
    map.set(psId, pick);
  });
  return map;
}

export function guidePicksMapToObject(map) {
  const out = {};
  if (!map || typeof map.forEach !== 'function') return out;
  map.forEach((raw, psId) => {
    const id = Math.trunc(Number(psId));
    if (!Number.isFinite(id) || id <= 0) return;
    const pick = normalizeGuidePick(raw);
    if (!pick) return;
    out[String(id)] = pick;
  });
  return out;
}

export function findFirstSlotVariableOccurrence(slots, variableId) {
  const id = variableId != null ? String(variableId) : '';
  if (!id) return null;
  const list = Array.isArray(slots) ? slots : [];
  for (let i = 0; i < list.length; i += 1) {
    const slot = list[i];
    const vars = Array.isArray(slot?.variables) ? slot.variables : [];
    for (let j = 0; j < vars.length; j += 1) {
      const v = vars[j];
      const vId = v?.id != null ? String(v.id) : '';
      if (vId && vId === id) {
        return { slotId: String(slot?.id || ''), slotIndex: i, variableIndex: j };
      }
    }
  }
  return null;
}
