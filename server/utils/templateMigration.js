function asStr(v) {
  return v == null ? '' : String(v);
}

function normType(t) {
  const s = asStr(t).trim().toLowerCase();
  if (!s) return '';
  if (s === 'image') return 'img';
  return s;
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeVarMeta(v) {
  const id = asStr(v?.id).trim();
  const psId = numOrNull(v?.psId);
  const key = asStr(v?.key).trim();
  const name = asStr(v?.name || v?.label).trim();
  const path = asStr(v?.path).trim();
  const varType = normType(v?.varType || v?.type);
  const x = numOrNull(v?.x);
  const y = numOrNull(v?.y);
  const width = numOrNull(v?.width);
  const height = numOrNull(v?.height);
  return { raw: v, id, psId, key, name, path, varType, x, y, width, height };
}

function normalizeText(s) {
  return asStr(s)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\u4e00-\u9fff]+/g, '');
}

function buildBigrams(s) {
  const str = normalizeText(s);
  const out = [];
  for (let i = 0; i < str.length - 1; i += 1) out.push(str.slice(i, i + 2));
  if (out.length === 0 && str) out.push(str);
  return out;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

function geomScore(a, b) {
  const ax = a?.x;
  const ay = a?.y;
  const aw = a?.width;
  const ah = a?.height;
  const bx = b?.x;
  const by = b?.y;
  const bw = b?.width;
  const bh = b?.height;
  if ([ax, ay, aw, ah, bx, by, bw, bh].some((n) => n == null)) return 0;
  const acx = ax + aw / 2;
  const acy = ay + ah / 2;
  const bcx = bx + bw / 2;
  const bcy = by + bh / 2;
  const dx = acx - bcx;
  const dy = acy - bcy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const diag = Math.sqrt(Math.max(1, bw) ** 2 + Math.max(1, bh) ** 2);
  const distN = diag > 0 ? Math.min(1, dist / diag) : 1;
  const areaA = Math.max(1, aw) * Math.max(1, ah);
  const areaB = Math.max(1, bw) * Math.max(1, bh);
  const areaN = areaA > 0 && areaB > 0 ? Math.min(1, Math.abs(areaA - areaB) / Math.max(areaA, areaB)) : 1;
  const score = 1 - 0.65 * distN - 0.35 * areaN;
  return Math.max(0, Math.min(1, score));
}

function compatibleType(a, b) {
  const ta = normType(a);
  const tb = normType(b);
  if (!ta || !tb) return true;
  if (ta === tb) return true;
  if (ta === 'text' && tb === 'text') return true;
  if (ta === 'img' && tb === 'img') return true;
  return false;
}

function buildIndex(newVars) {
  const byPsId = new Map();
  const byKeyType = new Map();
  const byPathType = new Map();
  for (const v of newVars) {
    if (!v) continue;
    if (v.psId != null) {
      const list = byPsId.get(v.psId) || [];
      list.push(v);
      byPsId.set(v.psId, list);
    }
    if (v.key) {
      const k = `${v.key}::${v.varType || ''}`;
      const list = byKeyType.get(k) || [];
      list.push(v);
      byKeyType.set(k, list);
    }
    if (v.path) {
      const k = `${v.path}::${v.varType || ''}`;
      const list = byPathType.get(k) || [];
      list.push(v);
      byPathType.set(k, list);
    }
  }
  return { byPsId, byKeyType, byPathType };
}

function pickBest(candidates, oldMeta) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  let best = candidates[0];
  let bestScore = geomScore(oldMeta, best);
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i];
    const s = geomScore(oldMeta, c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

function findMatch({ oldMeta, typeHint, index, pool, usedNewIds }) {
  const psId = oldMeta?.psId;
  if (psId != null) {
    const list = index.byPsId.get(psId) || [];
    const filtered = list.filter((v) => !usedNewIds.has(v.id) && compatibleType(typeHint, v.varType));
    const picked = pickBest(filtered, oldMeta);
    if (picked) return { matched: picked, matchedBy: 'psId', score: 1 };
  }

  if (oldMeta?.key) {
    const key = `${oldMeta.key}::${normType(typeHint) || oldMeta.varType || ''}`;
    const list = index.byKeyType.get(key) || [];
    const filtered = list.filter((v) => !usedNewIds.has(v.id));
    const picked = pickBest(filtered, oldMeta);
    if (picked) return { matched: picked, matchedBy: 'key', score: 0.95 };
  }

  if (oldMeta?.path) {
    const key = `${oldMeta.path}::${normType(typeHint) || oldMeta.varType || ''}`;
    const list = index.byPathType.get(key) || [];
    const filtered = list.filter((v) => !usedNewIds.has(v.id));
    const picked = pickBest(filtered, oldMeta);
    if (picked) return { matched: picked, matchedBy: 'path', score: 0.9 };
  }

  const type = normType(typeHint) || oldMeta.varType || '';
  const geomCandidates = pool.filter((v) => !usedNewIds.has(v.id) && compatibleType(type, v.varType));
  let geomBest = null;
  let geomBestScore = 0;
  for (const c of geomCandidates) {
    const s = geomScore(oldMeta, c);
    if (s > geomBestScore) {
      geomBest = c;
      geomBestScore = s;
    }
  }
  if (geomBest && geomBestScore >= 0.82) return { matched: geomBest, matchedBy: 'geom', score: geomBestScore };

  const oldName = oldMeta?.name;
  if (oldName) {
    const a = buildBigrams(oldName);
    let best = null;
    let bestScore = 0;
    for (const c of geomCandidates) {
      if (!c?.name) continue;
      const s = jaccard(a, buildBigrams(c.name));
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (best && bestScore >= 0.72) return { matched: best, matchedBy: 'fuzzy', score: bestScore };
  }

  return { matched: null, matchedBy: '', score: 0 };
}

function normalizeOldConfigVar(v) {
  const id = asStr(v?.id).trim();
  const psId = numOrNull(v?.psId);
  const type = normType(v?.type || v?.varType);
  return {
    raw: v,
    id,
    psId,
    type,
    excelFieldKey: v?.excelFieldKey ?? null,
    align: v?.align ?? null,
    computedRule: v?.computedRule ?? null,
    computedRules: Array.isArray(v?.computedRules) ? v.computedRules : [],
    name: asStr(v?.name).trim(),
    label: asStr(v?.label).trim(),
  };
}

function normalizeGuidePick(pick) {
  const leftX = Number(pick?.leftX);
  const rightX = Number(pick?.rightX);
  if (!Number.isFinite(leftX) || !Number.isFinite(rightX)) return null;
  const left = Math.round(leftX);
  const right = Math.round(rightX);
  if (right <= left) return null;
  return { leftX: left, rightX: right };
}

export function migrateGuidePicks({ oldGuidePicks, oldVars, newVars, oldPsIdToNew } = {}) {
  const raw = oldGuidePicks && typeof oldGuidePicks === 'object' ? oldGuidePicks : null;
  if (!raw) return {};

  const oldMetaList = (Array.isArray(oldVars) ? oldVars : []).map(normalizeVarMeta);
  const newMetaList = (Array.isArray(newVars) ? newVars : [])
    .map(normalizeVarMeta)
    .filter((v) => v.id && v.psId != null && normType(v.varType) === 'img');
  if (newMetaList.length === 0) return {};

  const newPsIdSet = new Set(newMetaList.map((m) => String(m.psId)));
  const newByPsId = new Map(newMetaList.map((m) => [String(m.psId), m]));
  const oldByPsId = new Map(oldMetaList.filter((m) => m.psId != null && normType(m.varType) === 'img').map((m) => [String(m.psId), m]));
  const index = buildIndex(newMetaList);
  const usedNewIds = new Set();
  const out = {};
  const keys = Object.keys(raw).sort((a, b) => Number(a) - Number(b));

  for (const oldPsIdKey of keys) {
    const pick = normalizeGuidePick(raw[oldPsIdKey]);
    if (!pick) continue;
    const oldPsIdNum = numOrNull(oldPsIdKey);
    if (oldPsIdNum == null) continue;
    let targetMeta = null;

    if (newPsIdSet.has(String(oldPsIdNum))) {
      targetMeta = newByPsId.get(String(oldPsIdNum)) || null;
    }

    if (!targetMeta && oldPsIdToNew && typeof oldPsIdToNew === 'object') {
      const mapped = oldPsIdToNew[String(oldPsIdNum)];
      const mappedPsId = numOrNull(mapped?.psId);
      if (mappedPsId != null && newPsIdSet.has(String(mappedPsId))) {
        targetMeta = newByPsId.get(String(mappedPsId)) || null;
      }
    }

    if (!targetMeta) {
      const oldMeta = oldByPsId.get(String(oldPsIdNum)) || null;
      if (oldMeta) {
        const { matched } = findMatch({
          oldMeta,
          typeHint: 'img',
          index,
          pool: newMetaList,
          usedNewIds,
        });
        if (matched) targetMeta = matched;
      }
    }

    if (!targetMeta || targetMeta.psId == null) continue;
    if (usedNewIds.has(targetMeta.id)) continue;
    usedNewIds.add(targetMeta.id);
    out[String(targetMeta.psId)] = pick;
  }

  return out;
}

export function migrateSlotConfig({ oldVars, newVars, oldConfig, templateId }) {
  const oldMetaList = (Array.isArray(oldVars) ? oldVars : []).map(normalizeVarMeta);
  const newMetaList = (Array.isArray(newVars) ? newVars : []).map(normalizeVarMeta).filter((v) => v.id && v.psId != null);
  const newIndex = buildIndex(newMetaList);
  const usedNewIds = new Set();

  const oldByPsId = new Map();
  const oldById = new Map();
  for (const m of oldMetaList) {
    if (m.psId != null && !oldByPsId.has(m.psId)) oldByPsId.set(m.psId, m);
    if (m.id && !oldById.has(m.id)) oldById.set(m.id, m);
  }

  const report = {
    matchedBy: { psId: 0, key: 0, path: 0, geom: 0, fuzzy: 0 },
    unmatched: [],
    conflicts: [],
    ambiguous: [],
  };

  const mappingOldIdToNew = new Map();
  const mappingOldPsIdToNew = new Map();

  const nextSlots = [];
  const slots = Array.isArray(oldConfig?.slots) ? oldConfig.slots : [];
  for (const s of slots) {
    const slotId = asStr(s?.id).trim();
    const slotName = asStr(s?.name).trim();
    const vars = Array.isArray(s?.variables) ? s.variables : [];
    const nextVars = [];
    for (const v of vars) {
      const ov = normalizeOldConfigVar(v);
      const oldMeta = (ov.psId != null ? oldByPsId.get(ov.psId) : null) || (ov.id ? oldById.get(ov.id) : null) || ov;
      const typeHint = ov.type || oldMeta?.varType || '';

      const { matched, matchedBy } = findMatch({
        oldMeta,
        typeHint,
        index: newIndex,
        pool: newMetaList,
        usedNewIds,
      });

      if (matched) {
        if (usedNewIds.has(matched.id)) {
          report.conflicts.push({
            slotId,
            old: { id: ov.id, psId: ov.psId, type: typeHint, name: ov.name || ov.label || oldMeta?.name || '' },
            new: { id: matched.id, psId: matched.psId, type: matched.varType, name: matched.name || matched.key || '' },
          });
        } else {
          usedNewIds.add(matched.id);
          if (matchedBy && report.matchedBy[matchedBy] != null) report.matchedBy[matchedBy] += 1;
          if (ov.id) mappingOldIdToNew.set(ov.id, matched.id);
          if (ov.psId != null) mappingOldPsIdToNew.set(String(ov.psId), { id: matched.id, psId: matched.psId });

          nextVars.push({
            ...ov.raw,
            id: matched.id,
            psId: matched.psId,
            type: ov.raw?.type || ov.raw?.varType || matched.varType,
            varType: ov.raw?.varType || ov.raw?.type || matched.varType,
            excelFieldKey: ov.excelFieldKey ?? null,
            computedRule: ov.computedRule ?? null,
            computedRules: ov.computedRules,
            align: ov.align ?? null,
          });
          continue;
        }
      }

      report.unmatched.push({
        slotId,
        old: { id: ov.id, psId: ov.psId, type: typeHint, name: ov.name || ov.label || oldMeta?.name || '' },
      });
      nextVars.push(v);
    }
    nextSlots.push({ ...s, id: slotId || s?.id, name: slotName || s?.name, variables: nextVars });
  }

  for (const it of report.conflicts) {
    if (!it) continue;
    report.unmatched.push({ slotId: it.slotId, old: it.old });
  }

  const oldIgnored = Array.isArray(oldConfig?.ignoredVariableIds) ? oldConfig.ignoredVariableIds : [];
  const nextIgnored = [];
  for (const oldId of oldIgnored) {
    const k = asStr(oldId).trim();
    if (!k) continue;
    const mapped = mappingOldIdToNew.get(k);
    if (mapped) nextIgnored.push(mapped);
  }

  const nextConfig = {
    templateId: asStr(templateId || oldConfig?.templateId).trim() || null,
    version: typeof oldConfig?.version === 'number' ? oldConfig.version : 1,
    slots: nextSlots,
    fieldDefinitions: Array.isArray(oldConfig?.fieldDefinitions) ? oldConfig.fieldDefinitions : [],
    ignoredVariableIds: Array.from(new Set(nextIgnored)),
    ignoredFieldKeys: Array.isArray(oldConfig?.ignoredFieldKeys) ? oldConfig.ignoredFieldKeys : [],
  };

  return { config: nextConfig, report, mapping: { oldIdToNewId: Object.fromEntries(mappingOldIdToNew), oldPsIdToNew: Object.fromEntries(mappingOldPsIdToNew) } };
}
