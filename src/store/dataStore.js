import { create } from 'zustand';

const lensTypeSummaryAggCache = new WeakMap();

/**
 * 数据状态管理 Store
 * 用于管理Excel数据、字段配置和图层绑定关系
 */

/**
 * 创建数据Store
 */
export const useDataStore = create((set) => ({
  // 初始状态
  rawHeaders: [],
  activeHeaders: [],
  excelHeaderCheck: null,
  rows: [],
  primaryKey: '',
  currentRow: null,
  selectedLayerIds: [],
  editingLayerId: null,
  slots: [],
  fieldDefinitions: [],
  slotRecordMapping: {},
  ignoredVariableIds: [],
  ignoredFieldKeys: [],

  // 设置原始表头
  setRawHeaders: (headers) => set({ rawHeaders: headers }),

  // 设置激活的表头（用户清洗后的）
  setActiveHeaders: (headers) => set({ activeHeaders: headers }),

  setExcelHeaderCheck: (check) => set({ excelHeaderCheck: check || null }),

  // 设置Excel数据行
  setRows: (rows) => set({ rows }),

  setSlots: (slots) => set({ slots: slots || [] }),

  setFieldDefinitions: (fieldDefinitions) => set({ fieldDefinitions: fieldDefinitions || [] }),

  setSlotRecordMapping: (mapping) => set({ slotRecordMapping: mapping || {} }),

  setIgnoredVariableIds: (ids) => set({ ignoredVariableIds: Array.isArray(ids) ? ids : [] }),

  setIgnoredFieldKeys: (keys) => set({ ignoredFieldKeys: Array.isArray(keys) ? keys : [] }),

  setSlotRecord: (slotId, recordIndex) => set((state) => {
    const next = { ...state.slotRecordMapping };
    if (recordIndex === null || recordIndex === undefined) {
      delete next[slotId];
    } else {
      next[slotId] = recordIndex;
    }
    return { slotRecordMapping: next };
  }),

  // 设置主键（用于查询）
  setPrimaryKey: (key) => set({ primaryKey: key }),

  // 设置当前查询到的数据行
  setCurrentRow: (row) => set({ currentRow: row }),

  /**
   * 设置当前选中的图层ID列表（支持多选）
   * @param {string[]} layerIds - 图层ID数组
   */
  setSelectedLayerIds: (layerIds) => set({ selectedLayerIds: layerIds }),

  /**
   * 设置当前正在编辑的文字图层ID（contentEditable）
   * @param {string|null} layerId - 图层ID
   */
  setEditingLayerId: (layerId) => set({ editingLayerId: layerId }),

  // 重置所有数据
  resetData: () => set({
    rawHeaders: [],
    activeHeaders: [],
    excelHeaderCheck: null,
    rows: [],
    primaryKey: '',
    currentRow: null,
    selectedLayerIds: [],
    editingLayerId: null,
    slots: [],
    fieldDefinitions: [],
    slotRecordMapping: {},
    ignoredVariableIds: [],
    ignoredFieldKeys: [],
  }),

  resetExcelData: () => set({
    rawHeaders: [],
    activeHeaders: [],
    excelHeaderCheck: null,
    rows: [],
    primaryKey: '',
    currentRow: null,
    selectedLayerIds: [],
    editingLayerId: null,
    slotRecordMapping: {},
  })
}));

export const buildSlotUpdates = ({ slots, slotRecordMapping, rows }) => {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  const mapping = slotRecordMapping || {};
  const dataRows = Array.isArray(rows) ? rows : [];
  if (!dataRows.length) return [];
  const updates = [];
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot || !slot.id) continue;
    const key = String(slot.id);
    if (!Object.prototype.hasOwnProperty.call(mapping, key)) continue;
    const recordIndexRaw = mapping[key];
    if (recordIndexRaw === null || recordIndexRaw === undefined) continue;
    const recordIndex = Number(recordIndexRaw);
    if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= dataRows.length) continue;
    const row = dataRows[recordIndex];
    if (!row || typeof row !== 'object') continue;
    const variables = Array.isArray(slot.variables) ? slot.variables : [];
    for (let j = 0; j < variables.length; j += 1) {
      const v = variables[j];
      if (!v || v.psId === null || v.psId === undefined) continue;
      const fieldKey = v.excelFieldKey;
      if (!fieldKey) continue;
      const type = v.type === 'image' || v.type === 'img' || v.varType === 'img' ? 'img' : 'text';
      const computedValue = computeVariableValueByRules({ slotVar: v, row, allRows: dataRows });
      const hasRules = !!(v.computedRule || (Array.isArray(v.computedRules) && v.computedRules.length > 0));
      const rawValue = hasRules ? computedValue : Object.prototype.hasOwnProperty.call(row, fieldKey) ? row[fieldKey] : null;
      if (rawValue === null || rawValue === undefined || rawValue === '') continue;
      const value = type === 'text' ? String(rawValue) : rawValue;
      const rawAlign = v.align != null ? String(v.align) : '';
      const align = rawAlign === 'center' || rawAlign === 'right' || rawAlign === 'left' ? rawAlign : 'left';
      updates.push({
        psId: v.psId,
        varType: type,
        value,
        ...(type === 'text' ? { align } : {}),
        name: v.label || v.name || fieldKey,
        id: v.id || String(v.psId),
        slotId: slot.id,
      });
    }
  }
  return updates;
};

export const computeVariableValueByRule = ({ rule, slotVar, row, allRows }) => {
  if (rule === null || rule === undefined) return null;
  const dataRow = row && typeof row === 'object' ? row : null;
  const rows = Array.isArray(allRows) ? allRows : [];

  const normalizeKey = (k) => String(k || '').replace(/[\uFEFF\u200B\u200C\u200D]/g, '').trim();

  const getField = (key) => {
    if (!dataRow) return null;
    if (key === null || key === undefined) return null;
    const s = normalizeKey(key);
    if (!s) return null;
    if (Object.prototype.hasOwnProperty.call(dataRow, s)) return dataRow[s];
    const hit = Object.keys(dataRow).find((k) => normalizeKey(k) === s);
    return hit ? dataRow[hit] : null;
  };

  const evalRule = (r) => {
    if (r === null || r === undefined) return null;
    if (typeof r === 'string') {
      const raw = r.trim();
      if (!raw) return null;
      const replaced = raw
        .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
          const v = getField(k);
          return v === null || v === undefined ? '' : String(v);
        })
        .replace(/\$\{\s*([^}]+?)\s*\}/g, (_, k) => {
          const v = getField(k);
          return v === null || v === undefined ? '' : String(v);
        });
      return replaced;
    }

    if (typeof r !== 'object') return null;

    const type = r.type != null ? String(r.type) : '';
    if (type === 'constant') return r.value ?? null;
    if (type === 'field') return getField(r.field);
    if (type === 'concatFields') {
      const keys = Array.isArray(r.fieldKeys) ? r.fieldKeys : [];
      const fieldTypes = Array.isArray(r.fieldTypes) ? r.fieldTypes : [];
      const literalValues = Array.isArray(r.literalValues) ? r.literalValues : [];
      const prefixes = Array.isArray(r.fieldPrefixes) ? r.fieldPrefixes : [];
      const suffixes = Array.isArray(r.fieldSuffixes) ? r.fieldSuffixes : [];
      const joiner = r.joiner != null ? String(r.joiner) : '';
      const fieldJoiners = Array.isArray(r.fieldJoiners) ? r.fieldJoiners : [];
      const fieldPartOverrides = Array.isArray(r.fieldPartOverrides) ? r.fieldPartOverrides : [];
      const globalIgnoreValues = (() => {
        if (Array.isArray(r.ignoreValues)) return r.ignoreValues.map((x) => (x == null ? null : String(x).trim())).filter((x) => x !== null && x !== '');
        if (r.ignoreValues != null && typeof r.ignoreValues !== 'object') {
          const s = String(r.ignoreValues).trim();
          return s ? [s] : [];
        }
        return [];
      })();
      const perFieldIgnoreValues = (() => {
        const raw = r.fieldIgnoreValues;
        if (!Array.isArray(raw)) return null;
        return raw.map((entry) => {
          if (Array.isArray(entry)) return entry.map((x) => (x == null ? null : String(x).trim())).filter((x) => x !== null && x !== '');
          if (entry == null) return [];
          const s = String(entry).trim();
          return s ? [s] : [];
        });
      })();
      let outText = '';
      let hasPart = false;
      const maxLen = Math.max(keys.length, prefixes.length, suffixes.length, fieldJoiners.length, fieldTypes.length, literalValues.length, fieldPartOverrides.length);
      for (let i = 0; i < maxLen; i += 1) {
        const typeAt = fieldTypes[i] != null ? String(fieldTypes[i]) : '';
        const isLiteral = typeAt === 'literal';
        let core = '';
        if (isLiteral) {
          const lv = literalValues[i];
          if (lv === null || lv === undefined) continue;
          core = String(lv).trim();
          if (!core) continue;
        } else {
          const k = keys[i];
          if (k === null || k === undefined) continue;
          const v = getField(k);
          if (v === null || v === undefined) continue;
          core = String(v).trim();
          if (!core) continue;
          const localIgnore = perFieldIgnoreValues && Array.isArray(perFieldIgnoreValues[i]) ? perFieldIgnoreValues[i] : null;
          const ignoreList = localIgnore ? localIgnore : globalIgnoreValues;
          if (ignoreList && ignoreList.length > 0) {
            const hit = ignoreList.some((ig) => ig === core);
            if (hit) continue;
          }
        }
        const overrideMap = !isLiteral && fieldPartOverrides[i] && typeof fieldPartOverrides[i] === 'object' ? fieldPartOverrides[i] : null;
        const overridePart = overrideMap && Object.prototype.hasOwnProperty.call(overrideMap, core) ? overrideMap[core] : undefined;
        const pfx = prefixes[i] != null ? String(prefixes[i]) : '';
        const sfx = suffixes[i] != null ? String(suffixes[i]) : '';
        const part = overridePart === null || overridePart === undefined ? `${pfx}${core}${sfx}` : String(overridePart);
        if (!part) continue;
        if (!hasPart) {
          outText = part;
          hasPart = true;
          continue;
        }
        const sep = fieldJoiners[i] != null ? String(fieldJoiners[i]) : joiner;
        outText += `${sep}${part}`;
      }
      return hasPart ? outText : null;
    }
    if (type === 'lensTypeSummary') {
      const polarizationKeyword = r.polarizationKeyword != null ? String(r.polarizationKeyword) : '偏光';
      const polarizedText = r.polarizedText ?? r.trueText ?? '高清偏光';
      const unpolarizedText = r.unpolarizedText ?? r.falseText ?? '高清非偏光';
      const bothText = r.bothText;
      const key = String(polarizationKeyword || '偏光').trim();
      const norm = (s) => String(s || '').trim();
      const neutral = key ? `不${key}` : '';
      const neg = key ? `非${key}` : '';
      const detectState = (raw) => {
        let hay = norm(raw);
        if (!hay) return { hasPolar: false, hasUnpolar: false };
        if (neutral && hay.includes(neutral)) hay = hay.split(neutral).join(' ');
        const hasUnpolar = !!(neg && hay.includes(neg));
        const hayNoNeg = hasUnpolar && neg ? hay.split(neg).join(' ') : hay;
        const hasPolar = !!(key && hayNoNeg.includes(key));
        return { hasPolar, hasUnpolar };
      };

      const stripHighDefPrefix = (s) => {
        const str = s == null ? '' : String(s);
        return str.startsWith('高清') ? str.slice(2) : str;
      };

      const groupByFieldKey =
        r.groupByFieldKey != null ? String(r.groupByFieldKey)
          : r.sourceFieldKey != null ? String(r.sourceFieldKey)
            : r.materialFieldKey != null ? String(r.materialFieldKey)
            : '';
      const polarizationFieldKey =
        r.polarizationFieldKey != null ? String(r.polarizationFieldKey)
          : r.polarFieldKey != null ? String(r.polarFieldKey)
            : r.lensTypeFieldKey != null ? String(r.lensTypeFieldKey)
            : slotVar && slotVar.excelFieldKey != null ? String(slotVar.excelFieldKey)
              : '';

      const groupByKey = groupByFieldKey.trim();
      const polKey = polarizationFieldKey.trim();

      const getRowField = (rr, fieldKey) => {
        if (!rr || typeof rr !== 'object') return null;
        const s = normalizeKey(fieldKey);
        if (!s) return null;
        if (Object.prototype.hasOwnProperty.call(rr, s)) return rr[s];
        const hit = Object.keys(rr).find((k) => normalizeKey(k) === s);
        return hit ? rr[hit] : null;
      };

      const toYesNo = (raw) => {
        const t = norm(raw);
        if (!t) return null;
        if (t === '是' || t === 'Y' || t === 'YES' || t === 'true' || t === '1') return true;
        if (t === '否' || t === 'N' || t === 'NO' || t === 'false' || t === '0') return false;
        return null;
      };

      const emit = ({ hasPolar, hasUnpolar }) => {
        if (hasPolar && hasUnpolar) {
          if (bothText != null && String(bothText).trim()) return String(bothText);
          const tail = stripHighDefPrefix(unpolarizedText);
          return `${String(polarizedText)}/${tail || '非偏光'}`;
        }
        if (hasPolar) return String(polarizedText);
        return String(unpolarizedText);
      };

      if (groupByKey && polKey && rows.length > 0) {
        const groupValRaw = getField(groupByKey);
        const groupVal = groupValRaw === null || groupValRaw === undefined ? '' : String(groupValRaw).trim();
        if (groupVal) {
          let perRowsCache = lensTypeSummaryAggCache.get(rows);
          if (!perRowsCache) {
            perRowsCache = new Map();
            lensTypeSummaryAggCache.set(rows, perRowsCache);
          }
          const cacheKey = `${groupByKey}||${polKey}||${key}`;
          let groupMap = perRowsCache.get(cacheKey);
          if (!groupMap) {
            groupMap = new Map();
            for (let i = 0; i < rows.length; i += 1) {
              const rr = rows[i];
              if (!rr || typeof rr !== 'object') continue;
              const gRaw = getRowField(rr, groupByKey);
              const g = gRaw === null || gRaw === undefined ? '' : String(gRaw).trim();
              if (!g) continue;
              const prev = groupMap.get(g) || { hasPolar: false, hasUnpolar: false };
              let hasPolar = !!prev.hasPolar;
              let hasUnpolar = !!prev.hasUnpolar;
              const polRaw = getRowField(rr, polKey);
              const yn = toYesNo(polRaw);
              if (yn === true) hasPolar = true;
              if (yn === false) hasUnpolar = true;
              const st = detectState(polRaw);
              if (st.hasPolar) hasPolar = true;
              if (st.hasUnpolar) hasUnpolar = true;
              groupMap.set(g, { hasPolar, hasUnpolar });
            }
            perRowsCache.set(cacheKey, groupMap);
          }
          const flags = groupMap.get(groupVal) || { hasPolar: false, hasUnpolar: false };
          return emit(flags);
        }
      }

      const rawExcel = polKey ? getField(polKey) : null;
      const sExcel = rawExcel === null || rawExcel === undefined ? '' : String(rawExcel);
      const st = detectState(sExcel);
      let hasPolar = st.hasPolar;
      let hasUnpolar = st.hasUnpolar;
      const yn = toYesNo(sExcel);
      if (yn === true) hasPolar = true;
      if (yn === false) hasUnpolar = true;

      return emit({ hasPolar, hasUnpolar });
    }
    if (type === 'keywordContains') {
      const sourceFieldKey = r.sourceFieldKey != null ? String(r.sourceFieldKey) : r.fieldKey != null ? String(r.fieldKey) : '';
      const excelKey = slotVar && slotVar.excelFieldKey != null ? String(slotVar.excelFieldKey) : '';
      const raw = sourceFieldKey ? getField(sourceFieldKey) : excelKey ? getField(excelKey) : null;
      const keyword = r.keyword != null ? String(r.keyword).trim() : '';
      if (!keyword) return null;
      const ignoreCase = r.ignoreCase !== false;
      const hay = raw === null || raw === undefined ? '' : String(raw);
      const hayNorm0 = ignoreCase ? hay.toLowerCase() : hay;
      const kwNorm = ignoreCase ? keyword.toLowerCase() : keyword;
      const negKeyword2 = kwNorm ? (ignoreCase ? `非${kwNorm}` : `非${keyword}`) : '';
      const neutralKeyword = kwNorm ? (ignoreCase ? `不${kwNorm}` : `不${keyword}`) : '';
      const hayNorm = neutralKeyword && hayNorm0.includes(neutralKeyword) ? hayNorm0.split(neutralKeyword).join(' ') : hayNorm0;
      const hit = hayNorm.includes(kwNorm);
      const negHit = (negKeyword2 && hayNorm.includes(negKeyword2));
      const ok = hit && !negHit;
      const trueText = r.trueText ?? r.hitText ?? r.onTrue ?? r.trueValue ?? '';
      const falseText = r.falseText ?? r.missText ?? r.onFalse ?? r.falseValue ?? '';
      const out = ok ? trueText : falseText;
      if (out === null || out === undefined) return null;
      const s = String(out);
      return s.trim() ? s : null;
    }
    if (type === 'valueMap') {
      const sourceFieldKey = r.sourceFieldKey != null ? String(r.sourceFieldKey) : r.fieldKey != null ? String(r.fieldKey) : '';
      const excelKey = slotVar && slotVar.excelFieldKey != null ? String(slotVar.excelFieldKey) : '';
      const raw = sourceFieldKey ? getField(sourceFieldKey) : excelKey ? getField(excelKey) : null;
      if (raw === null || raw === undefined) return null;
      const key = String(raw).trim();
      if (!key) return null;
      const mapping = r.mapping && typeof r.mapping === 'object' ? r.mapping : r.map && typeof r.map === 'object' ? r.map : null;
      if (mapping && Object.prototype.hasOwnProperty.call(mapping, key)) {
        const mapped = mapping[key];
        if (mapped === null || mapped === undefined) return null;
        const s = String(mapped);
        return s.trim() ? s : null;
      }
      if (r.exactMatchOnly === true) {
        if (r.defaultToSource === false) return null;
        return String(raw);
      }
      if (mapping) {
        const entries = Object.entries(mapping)
          .map(([from, to]) => [String(from).trim(), to])
          .filter(([from]) => from);
        if (entries.length > 0) {
          const ordered = entries.sort((a, b) => b[0].length - a[0].length);
          let replaced = String(raw);
          let changed = false;
          for (let i = 0; i < ordered.length; i += 1) {
            const [from, to] = ordered[i];
            if (!from || to === null || to === undefined) continue;
            const toText = String(to);
            if (!replaced.includes(from)) continue;
            replaced = replaced.split(from).join(toText);
            changed = true;
          }
          if (changed) {
            const s = String(replaced);
            return s.trim() ? s : null;
          }
        }
      }
      if (r.defaultToSource === false) return null;
      return String(raw);
    }
    if (type === 'concat') {
      const parts = Array.isArray(r.parts) ? r.parts : [];
      const out = parts
        .map((p) => evalRule(p))
        .filter((v) => v !== null && v !== undefined && String(v) !== '');
      return out.length ? out.join(r.sep != null ? String(r.sep) : '') : null;
    }
    if (type === 'lookup') {
      const fromKey = r.fromKey != null ? String(r.fromKey) : '';
      const fromValue = fromKey ? getField(fromKey) : null;
      if (fromValue === null || fromValue === undefined) return null;
      const matchField = r.matchField != null ? String(r.matchField) : '';
      const pickField = r.pickField != null ? String(r.pickField) : '';
      if (!matchField || !pickField) return null;
      const found = rows.find((rr) => rr && typeof rr === 'object' && String(rr[matchField] ?? '').trim() === String(fromValue).trim());
      if (!found) return null;
      return found[pickField] ?? null;
    }

    if (r.template != null) return evalRule(String(r.template));
    return null;
  };

  const computed = evalRule(rule);
  if (computed === null || computed === undefined) return null;
  if (typeof computed === 'string' && computed.trim() === '') return null;
  if (computed === '') return null;
  if (slotVar && slotVar.varType === 'img') return computed;
  return computed;
};

export const computeVariableValueByRules = ({ slotVar, row, allRows }) => {
  const v = slotVar && typeof slotVar === 'object' ? slotVar : null;
  if (!v) return null;

  const normalizeKey = (k) => String(k || '').replace(/[\uFEFF\u200B\u200C\u200D]/g, '').trim();
  const resolveActualKey = (dataRow, key) => {
    if (!dataRow || typeof dataRow !== 'object') return null;
    const s = normalizeKey(key);
    if (!s) return null;
    if (Object.prototype.hasOwnProperty.call(dataRow, s)) return s;
    const hit = Object.keys(dataRow).find((k) => normalizeKey(k) === s);
    return hit || null;
  };
  const buildDerivedRow = (dataRow, rule, value) => {
    const candidateKeys = [];
    const pushKey = (key) => {
      const s = normalizeKey(key);
      if (s) candidateKeys.push(s);
    };
    pushKey(v.excelFieldKey);
    if (rule && typeof rule === 'object') {
      pushKey(rule.sourceFieldKey);
      pushKey(rule.fieldKey);
      pushKey(rule.field);
      pushKey(rule.fromKey);
    }
    if (candidateKeys.length === 0) return dataRow;
    const nextRow = dataRow && typeof dataRow === 'object' ? { ...dataRow } : {};
    const seen = new Set();
    for (let i = 0; i < candidateKeys.length; i += 1) {
      const key = candidateKeys[i];
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const actualKey = resolveActualKey(nextRow, key) || key;
      nextRow[actualKey] = value;
    }
    return nextRow;
  };

  const rules = Array.isArray(v.computedRules) ? v.computedRules : [];
  let workingRow = row && typeof row === 'object' ? row : null;
  let lastComputed = null;
  let hasComputed = false;
  for (let i = 0; i < rules.length; i += 1) {
    const r = rules[i];
    if (!r) continue;
    if (r.enabled === false) continue;
    const computed = computeVariableValueByRule({ rule: r, slotVar: v, row: workingRow, allRows });
    if (computed === null || computed === undefined || String(computed) === '') continue;
    lastComputed = computed;
    hasComputed = true;
    workingRow = buildDerivedRow(workingRow || row, r, computed);
  }
  if (hasComputed) return lastComputed;
  const single = v.computedRule !== undefined ? v.computedRule : null;
  return computeVariableValueByRule({ rule: single, slotVar: v, row, allRows });
};
