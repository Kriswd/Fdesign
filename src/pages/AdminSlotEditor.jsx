import React, { useState, useEffect, useRef, useCallback } from 'react';
import TemplateCanvas from '../components/TemplateCanvas';
import HudEditor from '../components/HudEditor';
import SearchableSelect from '../components/SearchableSelect';
import { ArrowLeft, ArrowLeftRight, Plus, Save, Trash2, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { parseExcelFile } from '../utils/excelParser';
import PSDParser from '../utils/psdParser';
import { parsePsdClientSide } from '../utils/psdClientParser';
import { extractTemplateFromPsd, buildVariablesFromCandidates, filterVariablesByLayerRules } from '../utils/templateExtractor';
import { buildSlotConfigPayload } from '../utils/slotConfigPayload';
import { orderBySelectedIds } from '../utils/selectionOrder';
import { normalizeSlotsAgainstVariables } from '../utils/slotConfigNormalize';
import { autoChainOnSave } from '../utils/ruleChainAuto';
import {
  normalizeGuidePick,
  nextGuidePick,
  guidePicksObjectToMap,
  guidePicksMapToObject,
} from '../utils/guidePick';

export default function AdminSlotEditor({ templateId, onBack, onRequireAuth }) {
  const [template, setTemplate] = useState(null);
  const [variables, setVariables] = useState([]);
  const [ignoredVariableIds, setIgnoredVariableIds] = useState([]);
  const [ignoredFieldKeys, setIgnoredFieldKeys] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedVariableIds, setSelectedVariableIds] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [expandedSlotById, setExpandedSlotById] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [excelUploading, setExcelUploading] = useState(false);
  const [excelUploadHint, setExcelUploadHint] = useState('');
  const [excelDropActive, setExcelDropActive] = useState(false);
  const [psdReplacing, setPsdReplacing] = useState(false);
  const [psdReplaceHint, setPsdReplaceHint] = useState('');
  const [psdReplaceReport, setPsdReplaceReport] = useState(null);
  const [showGuides, setShowGuides] = useState(false);
  const [guidePickMode, setGuidePickMode] = useState(false);
  const [templateGuides, setTemplateGuides] = useState(null);
  const [templateGuideLayers, setTemplateGuideLayers] = useState(null);
  const [manualGuidePicks, setManualGuidePicks] = useState(() => new Map());
  const [activeHotspotId, setActiveHotspotId] = useState(null);
  const [flashVariableId, setFlashVariableId] = useState(null);
  const [attentionVariableIds, setAttentionVariableIds] = useState([]);
  const [showRemovedVariables, setShowRemovedVariables] = useState(false);
  const [showRemovedFields, setShowRemovedFields] = useState(false);
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [ruleEditorSlotId, setRuleEditorSlotId] = useState(null);
  const [ruleEditorVarId, setRuleEditorVarId] = useState(null);
  const [ruleEditorVarName, setRuleEditorVarName] = useState('');
  const [ruleEditorMode, setRuleEditorMode] = useState('none');
  const [ruleEditorTemplate, setRuleEditorTemplate] = useState('');
  const [ruleEditorJoiner, setRuleEditorJoiner] = useState('-');
  const [ruleEditorItems, setRuleEditorItems] = useState([{ itemType: 'field', fieldKey: '', literalValue: '', prefix: '', suffix: '', joinerBefore: '', ignoreValues: '', advancedOpen: false, partOverrideRows: [] }]);
  const [ruleEditorGroupByKey, setRuleEditorGroupByKey] = useState('');
  const [ruleEditorPolarFieldKey, setRuleEditorPolarFieldKey] = useState('');
  const [ruleEditorPolarKeyword, setRuleEditorPolarKeyword] = useState('偏光');
  const [ruleEditorKeywordSourceKey, setRuleEditorKeywordSourceKey] = useState('');
  const [ruleEditorKeyword, setRuleEditorKeyword] = useState('偏光');
  const [ruleEditorKeywordTrueText, setRuleEditorKeywordTrueText] = useState('高清偏光镜片');
  const [ruleEditorKeywordFalseText, setRuleEditorKeywordFalseText] = useState('非偏光镜片');
  const [ruleEditorMapSourceKey, setRuleEditorMapSourceKey] = useState('');
  const [ruleEditorMapRows, setRuleEditorMapRows] = useState([{ from: 'TR', to: '高性能尼龙' }]);
  const [ruleEditorMapExactMatchOnly, setRuleEditorMapExactMatchOnly] = useState(false);
  const [ruleEditorRawJson, setRuleEditorRawJson] = useState('');
  const [ruleEditorChain, setRuleEditorChain] = useState([]);
  const [editingChainIndex, setEditingChainIndex] = useState(null);
  const renderServerBaseUrl = import.meta.env.VITE_RENDER_SERVER || '';
  const excelInputRef = useRef(null);
  const excelDragCounterRef = useRef(0);
  const replacePsdInputRef = useRef(null);
  const psdParserRef = useRef(null);
  const backgroundObjectUrlRef = useRef(null);
  const psdAppliedRef = useRef(false);
  const ruleEditorTemplateRef = useRef(null);
  const variableListRef = useRef(null);
  const variableItemRefs = useRef({});
  const slotPanelRef = useRef(null);
  const slotVarRowRefs = useRef(new Map());
  const flashTimerRef = useRef(null);
  const attentionTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const autoSaveInFlightRef = useRef(false);
  const templateRef = useRef(null);
  const slotsRef = useRef([]);
  const manualGuidePicksRef = useRef(new Map());
  const ignoredVariableIdsRef = useRef([]);
  const ignoredFieldKeysRef = useRef([]);
  const fieldDefinitionsRef = useRef([]);

  templateRef.current = template;
  slotsRef.current = slots;
  manualGuidePicksRef.current = manualGuidePicks;
  ignoredVariableIdsRef.current = ignoredVariableIds;
  ignoredFieldKeysRef.current = ignoredFieldKeys;
  fieldDefinitionsRef.current = fieldDefinitions;

  const setSlotsSafe = useCallback((updater) => {
    setSlots((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      slotsRef.current = next;
      return next;
    });
  }, []);

  const setManualGuidePicksSafe = useCallback((updater) => {
    setManualGuidePicks((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      manualGuidePicksRef.current = next;
      return next;
    });
  }, []);

  const setIgnoredVariableIdsSafe = useCallback((updater) => {
    setIgnoredVariableIds((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      ignoredVariableIdsRef.current = next;
      return next;
    });
  }, []);

  const setIgnoredFieldKeysSafe = useCallback((updater) => {
    setIgnoredFieldKeys((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      ignoredFieldKeysRef.current = next;
      return next;
    });
  }, []);

  const setFieldDefinitionsSafe = useCallback((updater) => {
    setFieldDefinitions((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      fieldDefinitionsRef.current = next;
      return next;
    });
  }, []);

  const normalizeFieldDefinitions = useCallback((list) => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item === 'object' && typeof item.key === 'string' && item.key.trim())
      .map((item) => {
        const key = item.key.trim();
        return {
          ...item,
          key,
          label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : key,
          type: typeof item.type === 'string' && item.type.trim() ? item.type.trim() : 'text',
        };
      });
  }, []);

  useEffect(() => {
    return () => {
      if (attentionTimerRef.current) {
        clearTimeout(attentionTimerRef.current);
        attentionTimerRef.current = null;
      }
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  const scheduleAutoSave = useCallback(
    ({ reason, nextIgnoredVariableIds, nextIgnoredFieldKeys } = {}) => {
      const id = templateId != null ? String(templateId) : '';
      if (!id) return;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(async () => {
        if (autoSaveInFlightRef.current) return;
        autoSaveInFlightRef.current = true;
        const payload = buildSlotConfigPayload({
          templateId: id,
          slots: slotsRef.current,
          fieldDefinitions: fieldDefinitionsRef.current,
          ignoredVariableIds: Array.isArray(nextIgnoredVariableIds) ? nextIgnoredVariableIds : ignoredVariableIdsRef.current,
          ignoredFieldKeys: Array.isArray(nextIgnoredFieldKeys) ? nextIgnoredFieldKeys : ignoredFieldKeysRef.current,
        });
        try {
          const resp = await fetch(`${renderServerBaseUrl}/api/template/${id}/slot-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            if (resp.status === 401) onRequireAuth?.();
            throw new Error(data?.message || data?.error || '自动保存失败');
          }
          console.info('[info][slot-config] autosave', {
            templateId: id,
            reason: reason || 'unknown',
            ignoredVariableIds: payload.ignoredVariableIds.length,
            ignoredFieldKeys: payload.ignoredFieldKeys.length,
          });
        } catch (err) {
          console.error('[error][slot-config] autosave failed', {
            templateId: id,
            reason: reason || 'unknown',
            message: err?.message ? String(err.message) : String(err),
          });
        } finally {
          autoSaveInFlightRef.current = false;
        }
      }, 300);
    },
    [onRequireAuth, renderServerBaseUrl, templateId],
  );

  const flashAttentionVariables = useCallback((ids) => {
    const list = Array.isArray(ids) ? ids.map((v) => String(v || '')).filter((v) => v) : [];
    if (attentionTimerRef.current) {
      clearTimeout(attentionTimerRef.current);
      attentionTimerRef.current = null;
    }
    setAttentionVariableIds(list);
    attentionTimerRef.current = setTimeout(() => {
      setAttentionVariableIds([]);
      attentionTimerRef.current = null;
    }, 3200);
  }, []);

  const isSlotExpanded = useCallback(
    (slotId) => {
      const key = slotId != null ? String(slotId) : '';
      if (!key) return false;
      if (Object.prototype.hasOwnProperty.call(expandedSlotById, key)) return expandedSlotById[key] === true;
      return selectedSlotId != null && String(selectedSlotId) === key;
    },
    [expandedSlotById, selectedSlotId],
  );

  const ensureSlotExpanded = useCallback((slotId) => {
    const key = slotId != null ? String(slotId) : '';
    if (!key) return;
    setExpandedSlotById((prev) => (prev && prev[key] === true ? prev : { ...(prev || {}), [key]: true }));
  }, []);

  const findSlotIdByVariableId = useCallback(
    (variableId) => {
      const id = variableId != null ? String(variableId) : '';
      if (!id) return null;
      for (let i = 0; i < slots.length; i += 1) {
        const s = slots[i];
        if (!s || s.id == null) continue;
        const vars = Array.isArray(s.variables) ? s.variables : [];
        for (let j = 0; j < vars.length; j += 1) {
          const v = vars[j];
          if (!v) continue;
          if (String(v.id) === id) return String(s.id);
        }
      }
      return null;
    },
    [slots],
  );

  const summarizeRule = useCallback((rule) => {
    if (rule === null || rule === undefined) return '';
    if (typeof rule === 'string') return rule;
    if (typeof rule !== 'object') return String(rule);
    const type = rule.type != null ? String(rule.type) : '';
    const formatJoiner = (j) => {
      const s = j != null ? String(j) : '';
      if (s === '') return '（空）';
      if (/^\s+$/.test(s)) return '【空格】';
      if (/\s/.test(s)) return JSON.stringify(s);
      return s;
    };
    if (type === 'concatFields') {
      const keys = Array.isArray(rule.fieldKeys) ? rule.fieldKeys : [];
      const types = Array.isArray(rule.fieldTypes) ? rule.fieldTypes : [];
      const literals = Array.isArray(rule.literalValues) ? rule.literalValues : [];
      const partOverrides = Array.isArray(rule.fieldPartOverrides) ? rule.fieldPartOverrides : [];
      const joiner = rule.joiner != null ? String(rule.joiner) : '';
      const label = keys.map((k, idx) => {
        const t = types[idx] != null ? String(types[idx]) : '';
        if (t === 'literal') {
          const lv = literals[idx] != null ? String(literals[idx]) : '';
          return lv ? `固定:${lv}` : '固定:(空)';
        }
        return k;
      });
      const hasPartOverrides = partOverrides.some((mapping) => mapping && typeof mapping === 'object' && Object.keys(mapping).length > 0);
      return `拼接(${label.join(',')}) 连接符号=${formatJoiner(joiner)}${hasPartOverrides ? '，含特殊值覆盖' : ''}`;
    }
    if (type === 'lensTypeSummary') {
      const groupBy = rule.groupByFieldKey != null ? String(rule.groupByFieldKey) : rule.materialFieldKey != null ? String(rule.materialFieldKey) : '';
      const polKey = rule.polarizationFieldKey != null ? String(rule.polarizationFieldKey) : rule.lensTypeFieldKey != null ? String(rule.lensTypeFieldKey) : '';
      return `偏光汇总(${groupBy || '-'} → ${polKey || '-'})`;
    }
    if (type === 'keywordContains') {
      const key = rule.sourceFieldKey != null ? String(rule.sourceFieldKey) : '';
      const keyword = rule.keyword != null ? String(rule.keyword) : '';
      return `关键字(${key || '-'} 包含 ${keyword || '-'})`;
    }
    if (type === 'valueMap') {
      const key = rule.sourceFieldKey != null ? String(rule.sourceFieldKey) : '';
      const exact = rule.exactMatchOnly === true ? '，精确匹配' : '';
      return `映射表(${key || '-'}${exact})`;
    }
    try {
      const s = JSON.stringify(rule);
      return s.length > 60 ? `${s.slice(0, 60)}...` : s;
    } catch (e) {
      void e;
      return '[object]';
    }
  }, []);

  const makeRuleId = useCallback(() => {
    return `r_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
  }, []);

  const normalizeChainEntry = useCallback(
    (rule) => {
      if (rule === null || rule === undefined) return null;
      if (typeof rule === 'string') {
        const s = rule.trim();
        if (!s) return null;
        return { template: s, enabled: true, op: 'derive', id: makeRuleId() };
      }
      if (typeof rule !== 'object') return null;
      const out = { ...rule };
      if (out.enabled !== false) out.enabled = true;
      if (out.op == null) out.op = 'derive';
      if (!out.id) out.id = makeRuleId();
      return out;
    },
    [makeRuleId],
  );

  const buildRuleFromEditorState = useCallback(() => {
    if (ruleEditorMode === 'template') {
      const t = String(ruleEditorTemplate || '').trim();
      return t ? t : null;
    }
    if (ruleEditorMode === 'concatFields') {
      const joiner = String(ruleEditorJoiner ?? '');
      const filtered = (Array.isArray(ruleEditorItems) ? ruleEditorItems : []).filter((it) => {
        if (!it) return false;
        const itemType = it.itemType === 'literal' ? 'literal' : 'field';
        if (itemType === 'literal') return String(it.literalValue ?? '').trim() !== '';
        return String(it.fieldKey || '').trim() !== '';
      });
      const fieldTypes = filtered.map((it) => (it.itemType === 'literal' ? 'literal' : 'field'));
      const fieldKeys = filtered.map((it) => (it.itemType === 'literal' ? '' : String(it.fieldKey || '').trim()));
      const literalValues = filtered.map((it) => (it.itemType === 'literal' ? String(it.literalValue ?? '') : ''));
      const fieldPrefixes = filtered.map((it) => (it.prefix != null ? String(it.prefix) : ''));
      const fieldSuffixes = filtered.map((it) => (it.suffix != null ? String(it.suffix) : ''));
      const fieldJoiners = filtered.map((it, idx) => (idx === 0 ? '' : (it.joinerBefore != null ? String(it.joinerBefore) : '')));
      const fieldIgnoreValues = filtered.map((it) => {
        if (it?.itemType === 'literal') return [];
        const raw = it && it.ignoreValues != null ? String(it.ignoreValues) : '';
        const parts = raw
          .split(/[,，\n]/g)
          .map((s) => s.trim())
          .filter((s) => s);
        return parts;
      });
      const fieldPartOverrides = filtered.map((it) => {
        const rows = Array.isArray(it?.partOverrideRows) ? it.partOverrideRows : [];
        const mapping = {};
        rows.forEach((row) => {
          const from = row && row.from != null ? String(row.from).trim() : '';
          if (!from) return;
          mapping[from] = row.to != null ? String(row.to) : '';
        });
        return mapping;
      });
      const anyIgnore = fieldIgnoreValues.some((arr) => Array.isArray(arr) && arr.length > 0);
      const anyFieldJoiner = fieldJoiners.some((x, idx) => idx > 0 && String(x || '') !== '');
      const anyLiteral = fieldTypes.some((t) => t === 'literal');
      const anyPartOverride = fieldPartOverrides.some((mapping) => mapping && Object.keys(mapping).length > 0);
      return fieldKeys.length > 0
        ? {
            type: 'concatFields',
            fieldKeys,
            fieldPrefixes,
            fieldSuffixes,
            joiner,
            ...(anyLiteral ? { fieldTypes, literalValues } : {}),
            ...(anyFieldJoiner ? { fieldJoiners } : {}),
            ...(anyIgnore ? { fieldIgnoreValues } : {}),
            ...(anyPartOverride ? { fieldPartOverrides } : {}),
          }
        : null;
    }
    if (ruleEditorMode === 'lensTypeSummary') {
      const groupByFieldKey = String(ruleEditorGroupByKey || '').trim();
      const polarizationFieldKey = String(ruleEditorPolarFieldKey || '').trim();
      const polarizationKeyword = String(ruleEditorPolarKeyword || '偏光').trim() || '偏光';
      return groupByFieldKey && polarizationFieldKey
        ? {
            type: 'lensTypeSummary',
            groupByFieldKey,
            polarizationFieldKey,
            polarizationKeyword,
          }
        : null;
    }
    if (ruleEditorMode === 'keywordContains') {
      const sourceFieldKey = String(ruleEditorKeywordSourceKey || '').trim();
      const keyword = String(ruleEditorKeyword || '').trim();
      const trueText = String(ruleEditorKeywordTrueText ?? '');
      const falseText = String(ruleEditorKeywordFalseText ?? '');
      return sourceFieldKey && keyword ? { type: 'keywordContains', sourceFieldKey, keyword, trueText, falseText } : null;
    }
    if (ruleEditorMode === 'valueMap') {
      const sourceFieldKey = String(ruleEditorMapSourceKey || '').trim();
      const rows = Array.isArray(ruleEditorMapRows) ? ruleEditorMapRows : [];
      const mapping = {};
      rows.forEach((r) => {
        const from = r && r.from != null ? String(r.from).trim() : '';
        if (!from) return;
        mapping[from] = r.to != null ? String(r.to) : '';
      });
      return sourceFieldKey && Object.keys(mapping).length > 0
        ? {
            type: 'valueMap',
            sourceFieldKey,
            mapping,
            defaultToSource: true,
            ...(ruleEditorMapExactMatchOnly ? { exactMatchOnly: true } : {}),
          }
        : null;
    }
    if (ruleEditorMode === 'raw') {
      const raw = String(ruleEditorRawJson || '').trim();
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        void e;
        return '__INVALID_JSON__';
      }
    }
    return null;
  }, [
    ruleEditorJoiner,
    ruleEditorItems,
    ruleEditorKeyword,
    ruleEditorKeywordFalseText,
    ruleEditorKeywordSourceKey,
    ruleEditorKeywordTrueText,
    ruleEditorPolarFieldKey,
    ruleEditorMapExactMatchOnly,
    ruleEditorMapRows,
    ruleEditorMapSourceKey,
    ruleEditorGroupByKey,
    ruleEditorMode,
    ruleEditorPolarKeyword,
    ruleEditorRawJson,
    ruleEditorTemplate,
  ]);

  const loadRuleIntoEditor = useCallback((rule) => {
    const defaultGroupByKey = '款号';
    const defaultPolarFieldKey = '是否偏光';
    if (rule === null || rule === undefined) {
      setRuleEditorMode('none');
      setRuleEditorTemplate('');
      setRuleEditorJoiner('-');
      setRuleEditorItems([{ itemType: 'field', fieldKey: '', literalValue: '', prefix: '', suffix: '', joinerBefore: '', ignoreValues: '', advancedOpen: false, partOverrideRows: [] }]);
      setRuleEditorGroupByKey(defaultGroupByKey);
      setRuleEditorPolarFieldKey(defaultPolarFieldKey);
      setRuleEditorPolarKeyword('偏光');
      setRuleEditorKeywordSourceKey('');
      setRuleEditorKeyword('偏光');
      setRuleEditorKeywordTrueText('高清偏光镜片');
      setRuleEditorKeywordFalseText('非偏光镜片');
      setRuleEditorMapSourceKey('');
      setRuleEditorMapRows([{ from: 'TR', to: '高性能尼龙' }]);
      setRuleEditorMapExactMatchOnly(false);
      setRuleEditorRawJson('');
      return;
    }
    if (typeof rule === 'string') {
      setRuleEditorMode('template');
      setRuleEditorTemplate(rule);
      return;
    }
    if (typeof rule === 'object') {
      const type = rule.type != null ? String(rule.type) : '';
      if (type === 'concatFields') {
        const keys = Array.isArray(rule.fieldKeys) ? rule.fieldKeys : [];
        const types = Array.isArray(rule.fieldTypes) ? rule.fieldTypes : [];
        const literals = Array.isArray(rule.literalValues) ? rule.literalValues : [];
        const prefixes = Array.isArray(rule.fieldPrefixes) ? rule.fieldPrefixes : [];
        const suffixes = Array.isArray(rule.fieldSuffixes) ? rule.fieldSuffixes : [];
        const fieldJoiners = Array.isArray(rule.fieldJoiners) ? rule.fieldJoiners : [];
        const perFieldIgnore = Array.isArray(rule.fieldIgnoreValues) ? rule.fieldIgnoreValues : [];
        const perFieldOverrides = Array.isArray(rule.fieldPartOverrides) ? rule.fieldPartOverrides : [];
        const joiner = rule.joiner != null ? String(rule.joiner) : '-';
        setRuleEditorMode('concatFields');
        setRuleEditorJoiner(joiner);
        const maxLen = Math.max(keys.length, prefixes.length, suffixes.length, fieldJoiners.length, perFieldIgnore.length, perFieldOverrides.length, types.length, literals.length);
        const items = Array.from({ length: maxLen }, (_, idx) => {
          const rawType = types[idx] != null ? String(types[idx]) : '';
          const inferredLiteral = literals[idx] != null && String(literals[idx]).trim() !== '' && (keys[idx] == null || String(keys[idx]).trim() === '');
          const itemType = rawType === 'literal' || inferredLiteral ? 'literal' : 'field';
          const overrideMap = perFieldOverrides[idx] && typeof perFieldOverrides[idx] === 'object' ? perFieldOverrides[idx] : {};
          const partOverrideRows = Object.keys(overrideMap).map((from) => ({ from, to: overrideMap[from] != null ? String(overrideMap[from]) : '' }));
          return {
            itemType,
            fieldKey: itemType === 'field' && keys[idx] != null ? String(keys[idx]) : '',
            literalValue: itemType === 'literal' && literals[idx] != null ? String(literals[idx]) : '',
            prefix: prefixes[idx] != null ? String(prefixes[idx]) : '',
            suffix: suffixes[idx] != null ? String(suffixes[idx]) : '',
            joinerBefore: idx === 0 ? '' : fieldJoiners[idx] != null ? String(fieldJoiners[idx]) : joiner,
            ignoreValues: Array.isArray(perFieldIgnore[idx]) ? perFieldIgnore[idx].map((x) => (x == null ? '' : String(x))).join(',') : '',
            advancedOpen: partOverrideRows.length > 0,
            partOverrideRows,
          };
        });
        setRuleEditorItems(items.length ? items : [{ itemType: 'field', fieldKey: '', literalValue: '', prefix: '', suffix: '', joinerBefore: '', ignoreValues: '', advancedOpen: false, partOverrideRows: [] }]);
        return;
      }
      if (type === 'lensTypeSummary') {
        setRuleEditorMode('lensTypeSummary');
        const groupBy =
          rule.groupByFieldKey != null ? String(rule.groupByFieldKey)
            : rule.materialFieldKey != null ? String(rule.materialFieldKey)
              : '';
        const polKey =
          rule.polarizationFieldKey != null ? String(rule.polarizationFieldKey)
            : rule.lensTypeFieldKey != null ? String(rule.lensTypeFieldKey)
              : '';
        setRuleEditorGroupByKey(groupBy || defaultGroupByKey);
        setRuleEditorPolarFieldKey(polKey || defaultPolarFieldKey);
        setRuleEditorPolarKeyword(rule.polarizationKeyword != null ? String(rule.polarizationKeyword) : '偏光');
        return;
      }
      if (type === 'keywordContains') {
        setRuleEditorMode('keywordContains');
        setRuleEditorKeywordSourceKey(rule.sourceFieldKey != null ? String(rule.sourceFieldKey) : '');
        setRuleEditorKeyword(rule.keyword != null ? String(rule.keyword) : '偏光');
        setRuleEditorKeywordTrueText(rule.trueText != null ? String(rule.trueText) : '高清偏光镜片');
        setRuleEditorKeywordFalseText(rule.falseText != null ? String(rule.falseText) : '非偏光镜片');
        return;
      }
      if (type === 'valueMap') {
        setRuleEditorMode('valueMap');
        setRuleEditorMapSourceKey(rule.sourceFieldKey != null ? String(rule.sourceFieldKey) : '');
        const mapping = rule.mapping && typeof rule.mapping === 'object' ? rule.mapping : {};
        const rows = Object.keys(mapping).map((k) => ({ from: k, to: mapping[k] != null ? String(mapping[k]) : '' }));
        setRuleEditorMapRows(rows.length ? rows : [{ from: '', to: '' }]);
        setRuleEditorMapExactMatchOnly(rule.exactMatchOnly === true);
        return;
      }
      setRuleEditorMode('raw');
      try {
        setRuleEditorRawJson(JSON.stringify(rule, null, 2));
      } catch (e) {
        void e;
        setRuleEditorRawJson('');
      }
      return;
    }
    setRuleEditorMode('raw');
    setRuleEditorRawJson(String(rule));
  }, []);

  const openRuleEditor = useCallback(
    (slotId, varId) => {
      const sId = String(slotId || '');
      const vId = String(varId || '');
      const slot = slots.find((s) => s && String(s.id) === sId) || null;
      const v = slot && Array.isArray(slot.variables) ? slot.variables.find((x) => x && String(x.id) === vId) : null;
      const rule = v ? v.computedRule : null;
      const chain = v && Array.isArray(v.computedRules) ? v.computedRules : [];
      const normalizedRule = normalizeChainEntry(rule);
      const serializedRule = normalizedRule
        ? JSON.stringify({ ...normalizedRule, id: undefined, enabled: undefined, op: undefined })
        : null;
      const matchedChainIndex = serializedRule
        ? chain.findIndex((item) => {
            const normalized = normalizeChainEntry(item);
            if (!normalized) return false;
            return JSON.stringify({ ...normalized, id: undefined, enabled: undefined, op: undefined }) === serializedRule;
          })
        : -1;
      setRuleEditorSlotId(sId);
      setRuleEditorVarId(vId);
      setRuleEditorVarName(v ? String(v.label || v.name || v.id || '') : '');
      setRuleEditorChain(chain);
      setEditingChainIndex(matchedChainIndex >= 0 ? matchedChainIndex : null);
      loadRuleIntoEditor(rule);
      setRuleEditorOpen(true);
    },
    [loadRuleIntoEditor, normalizeChainEntry, slots],
  );

  const closeRuleEditor = useCallback(() => {
    setRuleEditorOpen(false);
    setRuleEditorSlotId(null);
    setRuleEditorVarId(null);
    setRuleEditorVarName('');
    setRuleEditorChain([]);
    setEditingChainIndex(null);
  }, []);

  const updateVariableRule = useCallback((slotId, varId, rule) => {
    const targetSlotId = slotId != null ? String(slotId) : '';
    const targetId = varId != null ? String(varId) : '';
    if (!targetSlotId || !targetId) return;
    const nextSlots = (Array.isArray(slotsRef.current) ? slotsRef.current : []).map((s) => {
      if (!s || String(s.id) !== targetSlotId) return s;
      const vars = Array.isArray(s.variables)
        ? s.variables.map((v) => ((v?.id != null ? String(v.id) : '') === targetId ? { ...v, computedRule: rule || null } : v))
        : [];
      return { ...s, variables: vars };
    });
    slotsRef.current = nextSlots;
    setSlotsSafe(nextSlots);
  }, [setSlotsSafe]);

  const updateVariableRuleChain = useCallback((slotId, varId, chain) => {
    const targetSlotId = slotId != null ? String(slotId) : '';
    const targetId = varId != null ? String(varId) : '';
    if (!targetSlotId || !targetId) return;
    const list = Array.isArray(chain) ? chain : [];
    const nextSlots = (Array.isArray(slotsRef.current) ? slotsRef.current : []).map((s) => {
      if (!s || String(s.id) !== targetSlotId) return s;
      const vars = Array.isArray(s.variables)
        ? s.variables.map((v) => ((v?.id != null ? String(v.id) : '') === targetId ? { ...v, computedRules: list } : v))
        : [];
      return { ...s, variables: vars };
    });
    slotsRef.current = nextSlots;
    setSlotsSafe(nextSlots);
  }, [setSlotsSafe]);

  const applyRuleEditor = useCallback(() => {
    if (!ruleEditorSlotId || !ruleEditorVarId) {
      closeRuleEditor();
      return;
    }
    const nextRule = buildRuleFromEditorState();
    if (nextRule === '__INVALID_JSON__') {
      alert('规则 JSON 解析失败，请检查格式');
      return;
    }
    if (ruleEditorMode !== 'none' && nextRule === null) {
      alert('规则未填写完整，无法保存');
      return;
    }
    const targetSlotId = String(ruleEditorSlotId || '');
    const targetVarId = String(ruleEditorVarId || '');
    const slot = (Array.isArray(slotsRef.current) ? slotsRef.current : []).find((s) => s && String(s.id) === targetSlotId) || null;
    const exists = slot && Array.isArray(slot.variables) ? slot.variables.some((v) => (v?.id != null ? String(v.id) : '') === targetVarId) : false;
    if (!exists) {
      alert('保存失败：未找到要更新的变量（可能已被移除）');
      closeRuleEditor();
      return;
    }
    updateVariableRule(ruleEditorSlotId, ruleEditorVarId, nextRule);
    const baseChain = editingChainIndex !== null
      ? (() => {
          const nextChain = [...(Array.isArray(ruleEditorChain) ? ruleEditorChain : [])];
          const nextEntry = normalizeChainEntry(nextRule);
          if (nextEntry && editingChainIndex >= 0 && editingChainIndex < nextChain.length) nextChain[editingChainIndex] = nextEntry;
          return nextChain;
        })()
      : autoChainOnSave({
          chain: ruleEditorChain,
          rule: nextRule,
          normalizeEntry: normalizeChainEntry,
        });
    const normalizedChain = (Array.isArray(baseChain) ? baseChain : [])
      .map((r) => normalizeChainEntry(r))
      .filter(Boolean);
    updateVariableRuleChain(ruleEditorSlotId, ruleEditorVarId, normalizedChain);
    closeRuleEditor();
  }, [
    buildRuleFromEditorState,
    closeRuleEditor,
    normalizeChainEntry,
    ruleEditorChain,
    ruleEditorMode,
    ruleEditorSlotId,
    ruleEditorVarId,
    editingChainIndex,
    updateVariableRuleChain,
    updateVariableRule,
  ]);


  const canvasToObjectUrl = useCallback(async (canvas, parser) => {
    if (!canvas || !parser) return null;
    try {
      if (typeof canvas.convertToBlob === 'function') {
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return URL.createObjectURL(blob);
      }
      if (typeof canvas.toBlob === 'function') {
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => {
            if (!b) reject(new Error('生成背景图失败'));
            else resolve(b);
          }, 'image/png');
        });
        return URL.createObjectURL(blob);
      }
    } catch (error) {
      console.warn('生成背景图失败', error);
    }
    try {
      const dataUrl = parser.canvasToDataURL(canvas);
      return dataUrl || null;
    } catch (error) {
      console.warn('Canvas转DataURL失败', error);
      return null;
    }
  }, []);

  const handleDeleteVariable = useCallback(
    (variableId) => {
      const targetId = variableId != null ? String(variableId) : '';
      if (!targetId) return;
      const nextIgnored = ignoredVariableIdsRef.current.includes(targetId)
        ? ignoredVariableIdsRef.current
        : [...ignoredVariableIdsRef.current, targetId];
      setIgnoredVariableIdsSafe(nextIgnored);
      setSlotsSafe((prevSlots) =>
        prevSlots.map((s) => {
          if (!Array.isArray(s.variables)) return s;
          return {
            ...s,
            variables: s.variables.filter((v) => (v?.id != null ? String(v.id) : '') !== targetId),
          };
        }),
      );
      setSelectedVariableIds((prev) => prev.filter((id) => id !== targetId));
      scheduleAutoSave({ reason: 'remove-variable', nextIgnoredVariableIds: nextIgnored });
    },
    [scheduleAutoSave, setIgnoredVariableIdsSafe, setSlotsSafe],
  );

  // Handle global keydown for delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Delete key or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedVariableIds.length > 0) {
        // Avoid deleting if user is typing in an input
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
          return;
        }
        
        selectedVariableIds.forEach(id => handleDeleteVariable(id));
        setSelectedVariableIds([]); // Clear selection after delete
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteVariable, selectedVariableIds]);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      setShowGuides(false);
      setGuidePickMode(false);
      setTemplateGuides(null);
      setTemplateGuideLayers(null);
      const tplResp = await fetch(`${renderServerBaseUrl}/api/template/${templateId}`);
      if (!tplResp.ok) throw new Error('加载模版失败');
      const tplData = await tplResp.json();
      const frontendConfig = tplData.frontendConfig || {};
      setManualGuidePicksSafe(guidePicksObjectToMap(frontendConfig?.guidePicks));
      const baseWidth = frontendConfig.width || tplData.width || 0;
      const baseHeight = frontendConfig.height || tplData.height || 0;
      let previewUrl = tplData.imageUrl
        ? `${renderServerBaseUrl}${tplData.imageUrl}?t=${Date.now()}`
        : null;
      let canvasWidth = baseWidth;
      let canvasHeight = baseHeight;
      let scaleX = 1;
      let scaleY = 1;
      psdAppliedRef.current = false;

      if (previewUrl) {
        try {
          const size = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const w = img.naturalWidth || img.width || 0;
              const h = img.naturalHeight || img.height || 0;
              resolve({ width: w, height: h });
            };
            img.onerror = (e) => reject(e);
            img.src = previewUrl;
          });

          if (size && size.width > 0 && size.height > 0) {
            const hasBase = baseWidth > 0 && baseHeight > 0;
            scaleX = hasBase ? size.width / baseWidth : 1;
            scaleY = hasBase ? size.height / baseHeight : 1;
            canvasWidth = size.width;
            canvasHeight = size.height;
          }
        } catch (e) {
          console.error(e);
        }
      }

      const savedVariablesSource = Array.isArray(frontendConfig.variables) && frontendConfig.variables.length > 0
        ? frontendConfig.variables
        : Array.isArray(tplData.variables)
          ? tplData.variables
          : [];
      const hasSavedVariables = savedVariablesSource.length > 0;

      let nextVariables = [];

      try {
        const psdUrl = `${renderServerBaseUrl}/templates/${templateId}/source.psd`;
        const psdResp = await fetch(psdUrl);
        if (psdResp.ok) {
          const blob = await psdResp.blob();
          const fileName = tplData.name || 'template.psd';
          const file = new File([blob], fileName, { type: 'image/vnd.adobe.photoshop' });
          try {
            const parsed = await parsePsdClientSide(file);
            setTemplateGuides(parsed?.guides || null);
            setTemplateGuideLayers(parsed?.guideLayers || null);
            if (parsed?.canvasUrl && String(parsed.canvasUrl).startsWith('blob:')) {
              URL.revokeObjectURL(parsed.canvasUrl);
            }
          } catch (e) {
            console.warn('参考线解析失败', e);
            setTemplateGuides(null);
            setTemplateGuideLayers(null);
          }
          let parser = psdParserRef.current;
          if (!parser) {
            parser = new PSDParser();
            psdParserRef.current = parser;
          }
          const result = await parser.parse(file, () => {});
          const tpl = extractTemplateFromPsd({
            layers: result.layers || [],
            canvasWidth: result.width,
            canvasHeight: result.height,
          });
          const savedById = hasSavedVariables
            ? savedVariablesSource.reduce((acc, v) => {
                if (v && v.id) acc[String(v.id)] = v;
                return acc;
              }, {})
            : {};
          const baseVariables = (tpl.variables && tpl.variables.length > 0)
            ? tpl.variables
            : buildVariablesFromCandidates(tpl.candidates);
          const variablesWithHidden = (baseVariables || []).map((v) => {
            const saved = v && v.id ? savedById[String(v.id)] : null;
            return {
              ...v,
              hidden: saved && saved.hidden !== undefined ? saved.hidden : v.hidden !== undefined ? v.hidden : false,
              value: saved && saved.value !== undefined
                ? saved.value
                : v.value != null
                  ? v.value
                  : v.defaultValue != null
                    ? v.defaultValue
                    : '',
            };
          });
          nextVariables = variablesWithHidden;
          try {
            if (result.canvas) {
              const nextUrl = await canvasToObjectUrl(result.canvas, parser);
              if (nextUrl) {
                if (backgroundObjectUrlRef.current && String(backgroundObjectUrlRef.current).startsWith('blob:')) {
                  URL.revokeObjectURL(backgroundObjectUrlRef.current);
                }
                backgroundObjectUrlRef.current = nextUrl;
                previewUrl = nextUrl;
              }
            }
          } catch (error) {
            console.error('生成画布预览失败', error);
          }
          if (result.width && result.height) {
            canvasWidth = result.width;
            canvasHeight = result.height;
            scaleX = 1;
            scaleY = 1;
            psdAppliedRef.current = true;
          }
        }
      } catch (e) {
        console.error(e);
      }

      if (nextVariables.length === 0 && savedVariablesSource.length > 0) {
        nextVariables = savedVariablesSource.map((v) => ({
          ...v,
          hidden: v.hidden !== undefined ? v.hidden : false,
          value: v.value ?? v.defaultValue ?? '',
        }));
      }

      let finalVars = nextVariables;
      if (!psdAppliedRef.current && (scaleX !== 1 || scaleY !== 1)) {
        finalVars = nextVariables.map((v) => ({
          ...v,
          x: typeof v.x === 'number' ? v.x * scaleX : v.x,
          y: typeof v.y === 'number' ? v.y * scaleY : v.y,
          width: typeof v.width === 'number' ? v.width * scaleX : v.width,
          height: typeof v.height === 'number' ? v.height * scaleY : v.height,
        }));
      }
      finalVars = filterVariablesByLayerRules(finalVars);
      finalVars = (Array.isArray(finalVars) ? finalVars : []).map((v) => {
        const id = v?.id != null ? String(v.id) : '';
        const psId = Number(v?.psId);
        return {
          ...v,
          ...(id ? { id } : {}),
          ...(Number.isFinite(psId) ? { psId } : {}),
        };
      });

      setTemplate({
        ...tplData,
        width: canvasWidth || baseWidth,
        height: canvasHeight || baseHeight,
        previewUrl
      });
      setVariables(finalVars);

      // 2. Get Slot Config (Slots + Field Definitions)
      const configResp = await fetch(`${renderServerBaseUrl}/api/template/${templateId}/config`);
      if (configResp.ok) {
        const configData = await configResp.json();
        if (configData && configData.slots) {
          const nextSlots = Array.isArray(configData.slots) ? configData.slots : [];
          const normalizedSlots = normalizeSlotsAgainstVariables(nextSlots, finalVars);
          console.info('[debug][slot-assign] templateId:', templateId, 'slots:', normalizedSlots.map(s => ({ id: s.id, name: s.name, varCount: s.variables?.length, firstPsId: s.variables?.[0]?.psId })));
          console.info('[debug][slot-assign] finalVars count:', finalVars.length, 'psdApplied:', psdAppliedRef.current);
          setSlotsSafe(normalizedSlots);
          setSelectedSlotId((prev) => prev || (nextSlots[0] && nextSlots[0].id) || null);
        }
        if (configData && Array.isArray(configData.fieldDefinitions)) {
          setFieldDefinitionsSafe(normalizeFieldDefinitions(configData.fieldDefinitions));
        } else {
          setFieldDefinitionsSafe([]);
        }
        if (configData && Array.isArray(configData.ignoredVariableIds)) {
          const validIds = configData.ignoredVariableIds.filter((id) => typeof id === 'string');
          setIgnoredVariableIdsSafe(validIds);
        } else {
          setIgnoredVariableIdsSafe([]);
        }
        if (configData && Array.isArray(configData.ignoredFieldKeys)) {
          const validFieldKeys = configData.ignoredFieldKeys.filter((key) => typeof key === 'string');
          setIgnoredFieldKeysSafe(validFieldKeys);
        } else {
          setIgnoredFieldKeysSafe([]);
        }
      }
    } catch (err) {
      console.error(err);
      setLoadError(err?.message ? String(err.message) : '加载数据失败');
      alert('加载数据失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    renderServerBaseUrl,
    templateId,
    canvasToObjectUrl,
    setFieldDefinitionsSafe,
    setIgnoredFieldKeysSafe,
    normalizeFieldDefinitions,
    setIgnoredVariableIdsSafe,
    setLoadError,
    setManualGuidePicksSafe,
    setSlotsSafe,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const replacePsdFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!String(file.name || '').toLowerCase().endsWith('.psd')) {
        alert('请上传 PSD 文件');
        return;
      }
      if (psdReplacing) return;
      try {
        setPsdReplacing(true);
        setPsdReplaceHint('正在替换 PSD 并迁移配置...');
        setPsdReplaceReport(null);
        const formData = new FormData();
        formData.append('psd', file);
        const resp = await fetch(`${renderServerBaseUrl}/api/template/${templateId}/replace-psd`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if (resp.status === 401) onRequireAuth?.();
          throw new Error(data?.message || data?.error || '替换失败');
        }
        setPsdReplaceReport(data?.migrationReport || null);
        setPsdReplaceHint('替换完成，已刷新配置');
        await loadData();
        setTimeout(() => setPsdReplaceHint(''), 2500);
      } catch (e) {
        alert(`替换失败：${e?.message || String(e)}`);
        setPsdReplaceHint('');
      } finally {
        setPsdReplacing(false);
      }
    },
    [loadData, onRequireAuth, psdReplacing, renderServerBaseUrl, templateId],
  );

  const handleReplacePsdClick = useCallback(() => {
    if (psdReplacing) return;
    replacePsdInputRef.current?.click?.();
  }, [psdReplacing]);

  const handleReplacePsdChange = useCallback(
    async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      await replacePsdFile(file);
    },
    [replacePsdFile],
  );

  const canvasRef = useRef(null);
  const viewportRef = useRef(null);

  const scrollToVariable = (variableId) => {
    if (!variableId) return;
    
    // Scroll list
    const el = variableItemRefs.current[variableId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Scroll canvas
    if (canvasRef.current) {
      if (typeof canvasRef.current.panToVariable === 'function') {
        canvasRef.current.panToVariable(variableId);
      } else if (typeof canvasRef.current.zoomToVariable === 'function') {
        canvasRef.current.zoomToVariable(variableId);
      }
    }
  };

  const flashAndScrollToVariable = useCallback(
    (variableId) => {
      const id = variableId != null ? String(variableId) : '';
      if (!id) return;
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      setFlashVariableId(id);
      flashTimerRef.current = setTimeout(() => {
        setFlashVariableId(null);
        flashTimerRef.current = null;
      }, 900);

      requestAnimationFrame(() => {
        variableItemRefs.current?.[id]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        const leftEl = slotVarRowRefs.current?.get?.(id) || null;
        leftEl?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      });
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, []);

  const handleSelectVariableIds = useCallback(
    (ids) => {
      const next = Array.isArray(ids) ? ids.map((v) => String(v)).filter((v) => v) : [];
      setSelectedVariableIds(next);
      const last = next.length > 0 ? next[next.length - 1] : null;
      if (last && next.length === 1) {
        const slotId = findSlotIdByVariableId(last);
        if (slotId) {
          setSelectedSlotId(slotId);
          ensureSlotExpanded(slotId);
        }
      }
      setActiveHotspotId(last);
      if (last) flashAndScrollToVariable(last);
    },
    [ensureSlotExpanded, findSlotIdByVariableId, flashAndScrollToVariable],
  );

  const handleSelectHotspot = useCallback(
    (id, e) => {
      const nextId = id != null ? String(id) : '';
      if (!nextId) {
        setActiveHotspotId(null);
        setSelectedVariableIds([]);
        return;
      }
      const isMulti = !!(e?.ctrlKey || e?.metaKey);
      const prev = Array.isArray(selectedVariableIds) ? selectedVariableIds.map((v) => String(v)).filter((v) => v) : [];
      let next = [];
      if (isMulti) {
        if (prev.includes(nextId)) next = prev.filter((v) => v !== nextId);
        else next = [...prev, nextId];
      } else {
        next = [nextId];
      }
      setSelectedVariableIds(next);
      const active = isMulti ? (next.includes(nextId) ? nextId : (next.length > 0 ? next[next.length - 1] : '')) : nextId;
      setActiveHotspotId(active || null);
      if (active) {
        const slotId = findSlotIdByVariableId(active);
        if (slotId) {
          setSelectedSlotId(slotId);
          ensureSlotExpanded(slotId);
        }
      }
      if (!isMulti) flashAndScrollToVariable(nextId);
    },
    [ensureSlotExpanded, findSlotIdByVariableId, flashAndScrollToVariable, selectedVariableIds],
  );

  const handleSave = async () => {
    const latestSlots = Array.isArray(slotsRef.current) ? slotsRef.current : [];
    const slotNameById = new Map(latestSlots.map((s, idx) => [String(s?.id || ''), String(s?.name || `商品位${idx + 1}`)]));
    const byFieldKey = new Map();
    latestSlots.forEach((slot) => {
      if (!slot || !slot.id) return;
      const slotId = String(slot.id);
      const slotName = slotNameById.get(slotId) || slotId;
      const vars = Array.isArray(slot.variables) ? slot.variables : [];
      vars.forEach((v) => {
        const type = String(v?.varType || v?.type || '').toLowerCase();
        const isImg = type === 'img' || type === 'image';
        if (!isImg) return;
        const fieldKey = v?.excelFieldKey != null ? String(v.excelFieldKey).trim() : '';
        if (!fieldKey) return;
        const psId = Math.trunc(Number(v?.psId));
        if (!Number.isFinite(psId) || psId <= 0) return;
        const pick = normalizeGuidePick(manualGuidePicksRef.current.get(psId));
        const guideKey = pick ? `${pick.leftX},${pick.rightX}` : 'none';
        const entry = byFieldKey.get(fieldKey) || { fieldKey, guideKeySet: new Set(), items: [] };
        entry.guideKeySet.add(guideKey);
        entry.items.push({
          id: v?.id != null ? String(v.id) : null,
          psId,
          name: String(v?.label || v?.name || v?.key || `psId=${psId}`),
          slotId,
          slotName,
          guideKey,
        });
        byFieldKey.set(fieldKey, entry);
      });
    });
    const conflicts = [];
    byFieldKey.forEach((entry) => {
      if (entry.items.length <= 1) return;
      if (entry.guideKeySet.size <= 1) return;
      conflicts.push(entry);
    });
    if (conflicts.length > 0) {
      const ids = Array.from(
        new Set(
          conflicts
            .flatMap((c) => c.items)
            .map((it) => String(it?.id || ''))
            .filter((v) => v),
        ),
      );
      if (ids.length > 0) {
        setSelectedVariableIds(ids);
        setActiveHotspotId(ids[0]);
        flashAndScrollToVariable(ids[0]);
        flashAttentionVariables(ids);
      }
      const lines = conflicts.slice(0, 4).flatMap((c) => {
        const header = `字段「${c.fieldKey}」`;
        const items = c.items.slice(0, 10).map((it) => `${it.slotName} ${it.name}（psId=${it.psId}，参考线:${it.guideKey}）`);
        return [header, ...items, ''];
      });
      alert(`保存失败：同一 Excel 图片字段被多个图片变量复用，但参考线绑定不一致。\n\n${lines.join('\n')}\n请为每个图片变量分别配置图片字段，或确保参考线绑定一致。`);
      return;
    }

    try {
      setSaving(true);
      const payload = buildSlotConfigPayload({
        templateId,
        slots: slotsRef.current,
        fieldDefinitions: fieldDefinitionsRef.current,
        ignoredVariableIds: ignoredVariableIdsRef.current,
        ignoredFieldKeys: ignoredFieldKeysRef.current,
      });
      const requestSummary = {
        slotCount: Array.isArray(payload?.slots) ? payload.slots.length : 0,
        variableCount: Array.isArray(payload?.slots)
          ? payload.slots.reduce((sum, slot) => sum + (Array.isArray(slot?.variables) ? slot.variables.length : 0), 0)
          : 0,
        fieldDefinitionKeys: Array.isArray(payload?.fieldDefinitions)
          ? payload.fieldDefinitions.map((item) => (item?.key != null ? String(item.key) : '')).filter((key) => key)
          : [],
        ignoredVariableIds: Array.isArray(payload?.ignoredVariableIds) ? payload.ignoredVariableIds : [],
        ignoredFieldKeys: Array.isArray(payload?.ignoredFieldKeys) ? payload.ignoredFieldKeys : [],
        ruleChainLengths: Array.isArray(payload?.slots)
          ? payload.slots.flatMap((slot) => {
              const slotId = slot?.id != null ? String(slot.id) : '';
              const vars = Array.isArray(slot?.variables) ? slot.variables : [];
              return vars
                .map((variable) => {
                  const chain = Array.isArray(variable?.computedRules) ? variable.computedRules : [];
                  if (chain.length <= 0) return null;
                  const psId = Number(variable?.psId);
                  return {
                    slotId,
                    variableId: variable?.id != null ? String(variable.id) : '',
                    psId: Number.isFinite(psId) ? psId : null,
                    length: chain.length,
                  };
                })
                .filter(Boolean);
            })
          : [],
      };
      console.info('[debug][slot-config] manual-save request', requestSummary);

      const resp = await fetch(`${renderServerBaseUrl}/api/template/${templateId}/slot-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      console.info('[debug][slot-config] manual-save response', {
        status: resp.status,
        ok: resp.ok,
        slotCount: Array.isArray(data?.slots) ? data.slots.length : 0,
        fieldDefinitionKeys: Array.isArray(data?.fieldDefinitions)
          ? data.fieldDefinitions.map((item) => (item?.key != null ? String(item.key) : '')).filter((key) => key)
          : [],
        ruleChainLengths: Array.isArray(data?.slots)
          ? data.slots.flatMap((slot) => {
              const slotId = slot?.id != null ? String(slot.id) : '';
              const vars = Array.isArray(slot?.variables) ? slot.variables : [];
              return vars
                .map((variable) => {
                  const chain = Array.isArray(variable?.computedRules) ? variable.computedRules : [];
                  if (chain.length <= 0) return null;
                  const psId = Number(variable?.psId);
                  return {
                    slotId,
                    variableId: variable?.id != null ? String(variable.id) : '',
                    psId: Number.isFinite(psId) ? psId : null,
                    length: chain.length,
                  };
                })
                .filter(Boolean);
            })
          : [],
      });
      if (!resp.ok) {
        if (resp.status === 401) {
          onRequireAuth?.();
          throw new Error('未登录或登录已失效，请先登录');
        }
        throw new Error(data?.message || data?.error || '保存配置失败');
      }

      const safeName = String(templateRef.current?.name || '').trim() || `未命名模版_${String(templateId || '').slice(0, 6)}`;
      const baseConfig =
        templateRef.current?.frontendConfig && typeof templateRef.current.frontendConfig === 'object' ? templateRef.current.frontendConfig : {};
      const config = { ...baseConfig, guidePicks: guidePicksMapToObject(manualGuidePicksRef.current) };
      const resp2 = await fetch(`${renderServerBaseUrl}/api/template/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId, name: safeName, config }),
      });
      if (!resp2.ok) {
        const err = await resp2.json().catch(() => ({}));
        if (resp2.status === 401) {
          onRequireAuth?.();
          throw new Error('未登录或登录已失效，请先登录');
        }
        throw new Error(err?.message || err?.error || '保存参考线绑定失败');
      }
      const slotCount = Array.isArray(payload?.slots) ? payload.slots.length : 0;
      const varCount = Array.isArray(payload?.slots)
        ? payload.slots.reduce((acc, s) => acc + (Array.isArray(s?.variables) ? s.variables.length : 0), 0)
        : 0;
      const ruleCount = Array.isArray(payload?.slots)
        ? payload.slots.reduce((acc, s) => {
          const vars = Array.isArray(s?.variables) ? s.variables : [];
          return acc + vars.reduce((a2, v) => {
            const chainLen = Array.isArray(v?.computedRules) ? v.computedRules.length : 0;
            if (chainLen > 0) return a2 + chainLen;
            return a2 + (v?.computedRule ? 1 : 0);
          }, 0);
        }, 0)
        : 0;
      alert(`保存成功（商品位 ${slotCount}，变量 ${varCount}，规则 ${ruleCount}）`);
    } catch (err) {
      alert('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addSlot = () => {
    const newId = `slot_${Date.now()}`;
    setSlotsSafe((prev) => [...prev, { id: newId, name: `商品位 ${prev.length + 1}`, variables: [] }]);
    setSelectedSlotId(newId);
  };

  const removeSlot = (id) => {
    if (confirm('确定删除此商品位吗？')) {
      setSlotsSafe((prev) => prev.filter((s) => !s || String(s.id) !== String(id)));
      if (String(selectedSlotId || '') === String(id || '')) setSelectedSlotId(null);
    }
  };

  const assignVariablesToSlot = () => {
    if (!selectedSlotId) return alert('请先选择一个商品位');
    if (selectedVariableIds.length === 0) return alert('请先在画布上选择变量');

    const targetSlotIndex = slots.findIndex((s) => s && String(s.id) === String(selectedSlotId));
    if (targetSlotIndex === -1) return;

    const newSlots = [...slots];
    const slot = { ...newSlots[targetSlotIndex] };
    
    // Add selected variables (avoid duplicates)
    const currentKeys = new Set();
    (slot.variables || []).forEach((v) => {
      const id = v?.id != null ? String(v.id) : '';
      if (id) currentKeys.add(`id:${id}`);
      const psId = Number(v?.psId);
      if (Number.isFinite(psId)) currentKeys.add(`ps:${psId}`);
    });
    const varsToAdd = orderBySelectedIds(variables, selectedVariableIds).filter((v) => {
      const id = v?.id != null ? String(v.id) : '';
      const psId = Number(v?.psId);
      if (id && currentKeys.has(`id:${id}`)) return false;
      if (Number.isFinite(psId) && currentKeys.has(`ps:${psId}`)) return false;
      return true;
    });
    
    if (varsToAdd.length === 0) return alert('选中的变量已存在于该商品位中');

    slot.variables = [
      ...slot.variables,
      ...varsToAdd.map((v) => ({
        id: v?.id != null ? String(v.id) : '',
        psId: Number.isFinite(Number(v?.psId)) ? Number(v.psId) : v?.psId,
        name: v?.name || v?.key,
        type: v?.varType,
        label: v?.name || v?.key,
        ...(String(v?.varType || '').toLowerCase() === 'text' ? { align: 'left' } : {}),
      })),
    ];

    newSlots[targetSlotIndex] = slot;
    setSlotsSafe(newSlots);
    setSelectedVariableIds([]); // Clear selection
  };

  const handleRestoreVariable = (variableId) => {
    const targetId = variableId != null ? String(variableId) : '';
    if (!targetId) return;
    const nextIgnored = ignoredVariableIdsRef.current.filter((id) => id !== targetId);
    setIgnoredVariableIdsSafe(nextIgnored);
    scheduleAutoSave({ reason: 'restore-variable', nextIgnoredVariableIds: nextIgnored });
  };
  
  const removeVariableFromSlot = (slotId, varId) => {
      const targetId = varId != null ? String(varId) : '';
      if (!targetId) return;
      setSlotsSafe((prev) =>
        prev.map((s) => {
          if (!s || String(s.id) !== String(slotId)) return s;
          return {
            ...s,
            variables: Array.isArray(s.variables) ? s.variables.filter((v) => (v?.id != null ? String(v.id) : '') !== targetId) : [],
          };
        }),
      );
  };

  const updateSlotName = (id, name) => {
      setSlotsSafe((prev) => prev.map((s) => (s && String(s.id) === String(id) ? { ...s, name } : s)));
  };

  const updateVariableField = (slotId, varId, fieldKey) => {
    const targetId = varId != null ? String(varId) : '';
    if (!targetId) return;
    setSlotsSafe((prevSlots) =>
      prevSlots.map((s) => {
        if (!s || String(s.id) !== String(slotId)) return s;
        const vars = Array.isArray(s.variables)
          ? s.variables.map((v) => ((v?.id != null ? String(v.id) : '') === targetId ? { ...v, excelFieldKey: fieldKey || null } : v))
          : [];
        return { ...s, variables: vars };
      }),
    );
  };

  const updateVariableAlign = (slotId, varId, align) => {
    const targetId = varId != null ? String(varId) : '';
    if (!targetId) return;
    const nextAlign = align === 'left' || align === 'center' || align === 'right' ? align : 'left';
    setSlotsSafe((prevSlots) =>
      prevSlots.map((s) => {
        if (!s || String(s.id) !== String(slotId)) return s;
        const vars = Array.isArray(s.variables)
          ? s.variables.map((v) => ((v?.id != null ? String(v.id) : '') === targetId ? { ...v, align: nextAlign } : v))
          : [];
        return { ...s, variables: vars };
      }),
    );
  };

  const handleExcelClick = useCallback(() => {
    if (excelInputRef.current) {
      excelInputRef.current.click();
    }
  }, []);

  const handleExcelFile = useCallback(async (file) => {
    if (excelUploading) return;
    const name = String(file?.name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setExcelUploadHint('请拖入 Excel 文件');
      return;
    }
    try {
      setExcelUploading(true);
      setExcelUploadHint('正在解析 Excel 并提取字段...');
      const result = await parseExcelFile(file);
      const headers = (result && result.headers) || [];
      const defs = headers.map((h) => ({
        key: h,
        label: h,
        type: 'text',
      }));
      setFieldDefinitions(defs);
    } catch (err) {
      console.error('解析 Excel 失败:', err);
      alert(`解析 Excel 失败: ${err.message || err}`);
    } finally {
      setExcelUploading(false);
      setExcelUploadHint('');
    }
  }, [excelUploading]);

  const handleExcelChange = useCallback(
    async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await handleExcelFile(file);
      if (e.target) {
        e.target.value = '';
      }
    },
    [handleExcelFile],
  );

  const handleExcelDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    excelDragCounterRef.current += 1;
    if (!excelUploading) setExcelDropActive(true);
  }, [excelUploading]);

  const handleExcelDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleExcelDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    excelDragCounterRef.current -= 1;
    if (excelDragCounterRef.current <= 0) {
      setExcelDropActive(false);
    }
  }, []);

  const handleExcelDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    excelDragCounterRef.current = 0;
    setExcelDropActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await handleExcelFile(file);
  }, [handleExcelFile]);

  const insertTemplateToken = useCallback((fieldKey) => {
    const key = String(fieldKey || '').trim();
    if (!key) return;
    const token = `{{${key}}}`;
    const el = ruleEditorTemplateRef.current;
    if (!el) {
      setRuleEditorTemplate((prev) => `${prev}${token}`);
      return;
    }
    const start = Number.isFinite(el.selectionStart) ? el.selectionStart : el.value.length;
    const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : start;
    const next = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
    setRuleEditorTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }, []);

  const handleDeleteField = (fieldKey) => {
    const key = fieldKey != null ? String(fieldKey) : '';
    if (!key) return;
    const nextIgnored = ignoredFieldKeysRef.current.includes(key)
      ? ignoredFieldKeysRef.current
      : [...ignoredFieldKeysRef.current, key];
    setIgnoredFieldKeysSafe(nextIgnored);
    scheduleAutoSave({ reason: 'remove-field', nextIgnoredFieldKeys: nextIgnored });
  };

  const handleRestoreField = (fieldKey) => {
    const key = fieldKey != null ? String(fieldKey) : '';
    if (!key) return;
    const nextIgnored = ignoredFieldKeysRef.current.filter((k) => k !== key);
    setIgnoredFieldKeysSafe(nextIgnored);
    scheduleAutoSave({ reason: 'restore-field', nextIgnoredFieldKeys: nextIgnored });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="px-6 py-4 rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-2xl flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-50">正在载入模版配置</span>
            <span className="text-xs text-slate-400 mt-0.5">请稍候，正在同步 PSD 结构与商品位数据...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6">
        <div className="max-w-md w-full rounded-2xl border border-rose-400/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6">
          <div className="text-lg font-semibold text-rose-200">加载失败</div>
          <div className="mt-2 text-sm text-slate-300">{loadError || '模版配置不存在或已损坏'}</div>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10"
          >
            返回模板列表
          </button>
        </div>
      </div>
    );
  }

  const activeVariables = variables.filter((v) => !ignoredVariableIds.includes(v?.id != null ? String(v.id) : ''));
  const removedVariables = variables.filter((v) => ignoredVariableIds.includes(v?.id != null ? String(v.id) : ''));
  const activeFieldDefinitions = fieldDefinitions.filter((f) => !ignoredFieldKeys.includes(f.key));
  const removedFieldDefinitions = fieldDefinitions.filter((f) => ignoredFieldKeys.includes(f.key));
  const filteredFieldDefinitions = activeFieldDefinitions;
  const templatePreview = String(ruleEditorTemplate || '')
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
      const key = String(k || '').trim();
      return key ? `【${key}】` : '';
    })
    .trim();
  const concatPreview = (() => {
    if (ruleEditorMode !== 'concatFields') return '';
    const joiner = String(ruleEditorJoiner ?? '');
    const list = Array.isArray(ruleEditorItems) ? ruleEditorItems : [];
    let out = '';
    let hasPart = false;
    for (let i = 0; i < list.length; i += 1) {
      const it = list[i];
      if (!it) continue;
      const itemType = it.itemType === 'literal' ? 'literal' : 'field';
      const core = itemType === 'literal'
        ? String(it.literalValue ?? '').trim()
        : (it.fieldKey ? `【${String(it.fieldKey)}】` : '');
      if (!core) continue;
      const pfx = it.prefix != null ? String(it.prefix) : '';
      const sfx = it.suffix != null ? String(it.suffix) : '';
      const part = `${pfx}${core}${sfx}`;
      if (!part) continue;
      if (!hasPart) {
        out = part;
        hasPart = true;
        continue;
      }
      const sep = it.joinerBefore != null ? String(it.joinerBefore) : joiner;
      out += `${sep}${part}`;
    }
    return out;
  })();
  const selectedSlotIndex = selectedSlotId ? slots.findIndex((s) => s && String(s.id) === String(selectedSlotId)) : -1;
  const selectedSlotLabel = selectedSlotIndex >= 0 ? `商品位${selectedSlotIndex + 1}` : '';
  const variableById = (() => {
    const map = new Map();
    (activeVariables || []).forEach((v) => {
      const id = v?.id != null ? String(v.id) : '';
      if (!id) return;
      map.set(id, v);
    });
    return map;
  })();
  const activeImageVariable = (() => {
    if (!Array.isArray(selectedVariableIds) || selectedVariableIds.length === 0) return null;
    for (let i = selectedVariableIds.length - 1; i >= 0; i -= 1) {
      const id = selectedVariableIds[i] != null ? String(selectedVariableIds[i]) : '';
      if (!id) continue;
      const v = variableById.get(id) || null;
      if (!v) continue;
      if (String(v.varType || '').toLowerCase() !== 'img') continue;
      const psId = Math.trunc(Number(v.psId));
      if (!Number.isFinite(psId)) continue;
      return v;
    }
    return null;
  })();
  const activeVariablePsId = activeImageVariable ? Math.trunc(Number(activeImageVariable.psId)) : NaN;
  const selectedImagePsIds = (() => {
    const out = [];
    const seen = new Set();
    if (!Array.isArray(selectedVariableIds) || selectedVariableIds.length === 0) return out;
    for (let i = 0; i < selectedVariableIds.length; i += 1) {
      const id = selectedVariableIds[i] != null ? String(selectedVariableIds[i]) : '';
      if (!id) continue;
      const v = variableById.get(id) || null;
      if (!v) continue;
      if (String(v.varType || '').toLowerCase() !== 'img') continue;
      const psId = Math.trunc(Number(v.psId));
      if (!Number.isFinite(psId)) continue;
      const key = String(psId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(psId);
    }
    return out;
  })();
  const activePickDraft = Number.isFinite(activeVariablePsId) ? manualGuidePicksRef.current.get(activeVariablePsId) || null : null;
  const activePickResolved = normalizeGuidePick(activePickDraft);
  const hasGuideSource = (() => {
    const v = Array.isArray(templateGuides?.vertical) ? templateGuides.vertical : [];
    const h = Array.isArray(templateGuides?.horizontal) ? templateGuides.horizontal : [];
    const all = Array.isArray(templateGuideLayers?.all) ? templateGuideLayers.all : [];
    const leftX = templateGuideLayers?.leftX;
    const rightX = templateGuideLayers?.rightX;
    return (
      v.length > 0 ||
      h.length > 0 ||
      all.length > 0 ||
      Number.isFinite(Number(leftX)) ||
      Number.isFinite(Number(rightX))
    );
  })();
  const canBindGuides = !!(hasGuideSource && showGuides && activeImageVariable && Number.isFinite(activeVariablePsId) && selectedImagePsIds.length > 0);
  const activePickText = (() => {
    if (selectedImagePsIds.length === 0 || !activeImageVariable || !Number.isFinite(activeVariablePsId)) return '未选择图片变量';
    if (activePickResolved) return `已选 ${selectedImagePsIds.length} 个图片变量：左 ${activePickResolved.leftX}px，右 ${activePickResolved.rightX}px`;
    const leftX = activePickDraft && Number.isFinite(Number(activePickDraft.leftX)) ? Math.round(Number(activePickDraft.leftX)) : null;
    const rightX = activePickDraft && Number.isFinite(Number(activePickDraft.rightX)) ? Math.round(Number(activePickDraft.rightX)) : null;
    if (leftX != null && rightX == null) return `已选 ${selectedImagePsIds.length} 个图片变量：左 ${leftX}px，右 未选`;
    if (leftX == null && rightX != null) return `已选 ${selectedImagePsIds.length} 个图片变量：左 未选，右 ${rightX}px`;
    return '未绑定';
  })();
  const guidePicker = (() => {
    if (!canBindGuides) return null;
    if (!guidePickMode) return null;
    const x = Number(activeImageVariable?.x);
    const w = Number(activeImageVariable?.width);
    if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 1) return null;
    const rect = { left: Math.round(x), right: Math.round(x + w) };
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right) || rect.right <= rect.left) return null;
    const selected = activePickDraft && typeof activePickDraft === 'object' ? { ...activePickDraft } : {};
    return {
      enabled: true,
      rect,
      selected,
      sources: ['native', 'layer'],
      onPick: (pickedX) => {
        setManualGuidePicksSafe((prev) => {
          const next = new Map(prev);
          const prevPick = next.get(activeVariablePsId) || null;
          const nextPick = nextGuidePick(prevPick, pickedX);
          if (!nextPick) return next;
          selectedImagePsIds.forEach((psId) => {
            if (!Number.isFinite(Number(psId))) return;
            next.set(Math.trunc(Number(psId)), nextPick);
          });
          return next;
        });
      },
    };
  })();
  const handleClearActivePick = () => {
    if (selectedImagePsIds.length === 0) return;
    setManualGuidePicksSafe((prev) => {
      const next = new Map(prev);
      selectedImagePsIds.forEach((psId) => {
        if (!Number.isFinite(Number(psId))) return;
        next.delete(Math.trunc(Number(psId)));
      });
      return next;
    });
  };

  const persistGuidePicksOnly = async () => {
    if (selectedImagePsIds.length === 0) {
      alert('请先选中至少 1 个图片变量');
      return false;
    }
    const idToVar = new Map();
    if (Array.isArray(selectedVariableIds)) {
      selectedVariableIds.forEach((idRaw) => {
        const id = idRaw != null ? String(idRaw) : '';
        if (!id) return;
        const v = variableById.get(id) || null;
        if (!v) return;
        if (String(v.varType || '').toLowerCase() !== 'img') return;
        const psId = Math.trunc(Number(v.psId));
        if (!Number.isFinite(psId)) return;
        if (!idToVar.has(psId)) idToVar.set(psId, v);
      });
    }

    const eps = 2;
    const invalid = [];
    const missing = [];
    for (let i = 0; i < selectedImagePsIds.length; i += 1) {
      const psId = Math.trunc(Number(selectedImagePsIds[i]));
      if (!Number.isFinite(psId)) continue;
      const v = idToVar.get(psId) || null;
      const pick = normalizeGuidePick(manualGuidePicksRef.current.get(psId));
      if (!pick) {
        missing.push(String(v?.name || v?.key || psId));
        continue;
      }
      const x = Math.round(Number(v?.x));
      const w = Number(v?.width);
      const rectLeft = Number.isFinite(x) ? x : NaN;
      const rectRight = Number.isFinite(rectLeft) && Number.isFinite(w) ? Math.round(rectLeft + Number(w)) : NaN;
      if (!Number.isFinite(rectLeft) || !Number.isFinite(rectRight) || rectRight <= rectLeft) {
        invalid.push(String(v?.name || v?.key || psId));
        continue;
      }
      const withinAbs = pick.leftX >= rectLeft - eps && pick.rightX <= rectRight + eps && pick.rightX > pick.leftX;
      if (withinAbs) continue;
      const width = rectRight - rectLeft;
      const withinRel =
        pick.leftX >= -eps &&
        pick.rightX <= width + eps &&
        pick.rightX > pick.leftX &&
        rectLeft + pick.leftX >= rectLeft - eps &&
        rectLeft + pick.rightX <= rectRight + eps;
      if (withinRel) continue;
      invalid.push(String(v?.name || v?.key || psId));
    }

    if (missing.length > 0) {
      const shown = missing.slice(0, 8).join('、');
      alert(`以下图片变量未完成参考线绑定：${shown}${missing.length > 8 ? '…' : ''}`);
      return false;
    }
    if (invalid.length > 0) {
      const shown = invalid.slice(0, 8).join('、');
      alert(`以下图片变量参考线不在图片矩形内，请重新绑定：${shown}${invalid.length > 8 ? '…' : ''}`);
      return false;
    }
    try {
      setSaving(true);
      const safeName = String(templateRef.current?.name || '').trim() || `未命名模版_${String(templateId || '').slice(0, 6)}`;
      const baseConfig =
        templateRef.current?.frontendConfig && typeof templateRef.current.frontendConfig === 'object' ? templateRef.current.frontendConfig : {};
      const config = { ...baseConfig, guidePicks: guidePicksMapToObject(manualGuidePicksRef.current) };
      const resp = await fetch(`${renderServerBaseUrl}/api/template/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId, name: safeName, config }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          onRequireAuth?.();
          throw new Error('未登录或登录已失效，请先登录');
        }
        throw new Error(err?.message || err?.error || '保存参考线绑定失败');
      }
      setTemplate((prev) => (prev ? { ...prev, frontendConfig: config } : prev));
      return true;
    } catch (e) {
      alert(`保存绑定失败: ${e.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden text-slate-50">
      {/* Sidebar */}
      <div className="w-80 bg-slate-900/70 border-r border-white/10 flex flex-col z-10 shadow-2xl backdrop-blur-2xl">
        <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-slate-900/80">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-800/80 text-slate-300 hover:text-slate-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h2 className="font-semibold text-slate-50 tracking-tight">模版配置</h2>
            <div className="text-[11px] text-slate-400 mt-0.5">
              绑定 Excel 字段，并将变量分组为商品位
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleReplacePsdClick}
              disabled={psdReplacing}
              className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 border border-amber-500/30 transition-colors text-[11px] disabled:opacity-60 disabled:cursor-not-allowed"
              title="用新 PSD 覆盖源文件并尝试迁移现有配置"
            >
              {psdReplacing ? '替换中...' : '替换PSD'}
            </button>
            <input
              ref={replacePsdInputRef}
              type="file"
              accept=".psd"
              className="hidden"
              onChange={handleReplacePsdChange}
              disabled={psdReplacing}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={slotPanelRef}>
            {psdReplaceHint ? (
              <div className="px-3 py-2 rounded-2xl bg-amber-500/10 border border-amber-400/20 text-[11px] text-amber-100">
                {psdReplaceHint}
              </div>
            ) : null}
            {psdReplaceReport ? (
              <div className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[11px] text-slate-200 space-y-1">
                <div className="text-slate-100 font-medium">迁移报告</div>
                <div className="text-slate-400">
                  命中：psId {Number(psdReplaceReport?.matchedBy?.psId || 0)} / key {Number(psdReplaceReport?.matchedBy?.key || 0)} / path {Number(psdReplaceReport?.matchedBy?.path || 0)} / geom {Number(psdReplaceReport?.matchedBy?.geom || 0)} / fuzzy {Number(psdReplaceReport?.matchedBy?.fuzzy || 0)}
                </div>
                <div className="text-slate-400">
                  未匹配 {Array.isArray(psdReplaceReport?.unmatched) ? psdReplaceReport.unmatched.length : 0}，冲突 {Array.isArray(psdReplaceReport?.conflicts) ? psdReplaceReport.conflicts.length : 0}
                </div>
              </div>
            ) : null}
            <div
              className="mb-4 p-3 rounded-2xl border border-dashed border-white/10 bg-slate-900/60 shadow-inner relative"
              onDragEnter={handleExcelDragEnter}
              onDragOver={handleExcelDragOver}
              onDragLeave={handleExcelDragLeave}
              onDrop={handleExcelDrop}
            >
              {excelDropActive && !excelUploading ? (
                <div className="absolute inset-2 rounded-2xl border border-emerald-400/40 bg-black/40 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none">
                  <div className="text-xs text-emerald-100 px-3 py-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10">
                    松开即可上传 Excel
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <h3 className="text-xs font-semibold text-slate-100 tracking-wide">Excel 字段配置</h3>
                </div>
                <button
                  type="button"
                  onClick={handleExcelClick}
                  className="text-xs px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 border border-sky-500/40 transition-colors"
                  disabled={excelUploading}
                >
                  {excelUploading ? '解析中...' : '上传 Excel'}
                </button>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleExcelChange}
                />
              </div>
              {excelUploadHint && (
                <div className="text-[11px] text-slate-400 mb-1">{excelUploadHint}</div>
              )}
              {fieldDefinitions && fieldDefinitions.length > 0 ? (
                <div className="mt-1 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {activeFieldDefinitions.length > 0 ? (
                      activeFieldDefinitions.map((f) => (
                        <span
                          key={f.key}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-slate-900/80 border border-white/10 text-slate-200"
                        >
                          <span className="truncate max-w-[96px]">{f.label || f.key}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteField(f.key)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                            title="从当前模版配置中移除该字段"
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        所有字段均已移除，请在下方列表中恢复需要使用的字段
                      </span>
                    )}
                  </div>
                  {removedFieldDefinitions.length > 0 && (
                    <div className="border-t border-white/5 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowRemovedFields(!showRemovedFields)}
                        className="flex items-center justify-between w-full text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <span>
                          已移除字段
                          <span className="ml-1 text-slate-500">
                            ({removedFieldDefinitions.length})
                          </span>
                        </span>
                        <span className="text-xs">
                          {showRemovedFields ? '收起' : '展开'}
                        </span>
                      </button>
                      {showRemovedFields && (
                        <div className="mt-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-1">
                          {removedFieldDefinitions.map((f) => (
                            <span
                              key={f.key}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-slate-950/80 border border-white/5 text-slate-500"
                            >
                              <span className="truncate max-w-[96px]">{f.label || f.key}</span>
                              <button
                                type="button"
                                onClick={() => handleRestoreField(f.key)}
                                className="text-emerald-400 hover:text-emerald-300 transition-colors"
                              >
                                恢复
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  暂无字段，请上传示例 Excel 用于建立变量映射
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.18em]">商品位列表</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = {};
                      (slots || []).forEach((s) => {
                        if (!s || s.id == null) return;
                        next[String(s.id)] = true;
                      });
                      setExpandedSlotById(next);
                    }}
                    className="px-2 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-200 hover:bg-white/10 transition-colors"
                  >
                    全部展开
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedSlotById({})}
                    className="px-2 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-200 hover:bg-white/10 transition-colors"
                  >
                    收起其它
                  </button>
                  <button
                    onClick={addSlot}
                    className="p-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30 hover:text-emerald-50 border border-emerald-400/40 transition-colors"
                  >
                      <Plus className="w-4 h-4" />
                  </button>
                </div>
            </div>
            
            {slots.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs border-2 border-dashed border-white/10 rounded-2xl bg-slate-900/60">
                    暂无商品位，点击右上角 + 创建
                </div>
            )}

            {slots.map(slot => (
                <div 
                    key={slot.id} 
                    className={`border rounded-2xl p-3 transition-all cursor-pointer ${
                      selectedSlotId === slot.id
                        ? 'border-sky-500/80 bg-sky-500/10 shadow-[0_12px_30px_rgba(56,189,248,0.25)]'
                        : 'border-white/10 bg-slate-900/50 hover:border-sky-400/70 hover:bg-slate-900/80'
                    }`}
                    onClick={() => {
                      setSelectedSlotId(slot.id);
                      ensureSlotExpanded(slot.id);
                    }}
                >
                    <div className="flex justify-between items-center mb-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const key = slot && slot.id != null ? String(slot.id) : '';
                            if (!key) return;
                            setSelectedSlotId(key);
                            setExpandedSlotById((prev) => {
                              const current = isSlotExpanded(key);
                              return { ...(prev || {}), [key]: !current };
                            });
                          }}
                          className="mr-2 w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-slate-50 transition-colors"
                          title={isSlotExpanded(slot.id) ? '收起' : '展开'}
                        >
                          {isSlotExpanded(slot.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <input 
                            value={slot.name}
                            onChange={(e) => updateSlotName(slot.id, e.target.value)}
                            className="bg-transparent font-medium text-slate-50 text-sm focus:outline-none focus:border-b focus:border-sky-400 w-full mr-2"
                            placeholder="商品位名称"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeSlot(slot.id); }}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    
                    {isSlotExpanded(slot.id) ? (
                    <div className="space-y-1">
                        {slot.variables.map(v => (
                            <div
                              key={v.id}
                              ref={(el) => {
                                const id = v?.id != null ? String(v.id) : '';
                                if (!id) return;
                                if (el) slotVarRowRefs.current.set(id, el);
                                else slotVarRowRefs.current.delete(id);
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSlotId(slot.id);
                                ensureSlotExpanded(slot.id);
                                const id = v?.id != null ? String(v.id) : '';
                                if (!id) return;
                                handleSelectVariableIds([id]);
                                scrollToVariable(id);
                              }}
                              className={[
                                'flex flex-col gap-1 text-[11px] px-2 py-1.5 rounded-lg border transition-all cursor-pointer',
                                selectedVariableIds.includes(String(v.id))
                                  ? 'bg-emerald-500/15 border-emerald-400/25 text-emerald-100'
                                  : 'bg-slate-900/70 border-white/5 hover:bg-slate-900/85',
                                flashVariableId && String(v.id) === String(flashVariableId)
                                  ? 'ring-2 ring-amber-400/50 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]'
                                  : '',
                              ].join(' ')}
                            >
                              <div className="flex items-center gap-2">
                                <span className="truncate flex-1 min-w-0 text-slate-100" title={String(v.label || v.name || v.key || v.id || '')}>
                                  {String(v.label || v.name || v.key || v.id || '')}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeVariableFromSlot(slot.id, v.id); }}
                                  className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                                  title="从商品位移除"
                                >
                                  ×
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex-1" onMouseDown={(e) => e.stopPropagation()}>
                                  <SearchableSelect
                                    value={v.excelFieldKey || ''}
                                    placeholder={activeFieldDefinitions.length > 0 ? '选择字段' : '无可用字段'}
                                    searchPlaceholder="搜索字段…"
                                    disabled={activeFieldDefinitions.length === 0}
                                    options={activeFieldDefinitions.map((f) => ({ value: f.key, label: f.label || f.key }))}
                                    onChange={(val) => updateVariableField(slot.id, v.id, val)}
                                  />
                                </div>
                                {String(v.type || v.varType || '').toLowerCase() === 'text' ? (
                                  <select
                                    className="w-20 border border-white/10 rounded px-1.5 py-0.5 bg-slate-900/90 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-400"
                                    value={v.align === 'center' || v.align === 'right' || v.align === 'left' ? v.align : 'left'}
                                    onChange={(e) => updateVariableAlign(slot.id, v.id, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="left">左对齐</option>
                                    <option value="center">居中</option>
                                    <option value="right">右对齐</option>
                                  </select>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRuleEditor(slot.id, v.id);
                                  }}
                                  className={[
                                    'px-2 py-0.5 rounded border transition-colors shrink-0',
                                    (Array.isArray(v.computedRules) && v.computedRules.length > 0) || v.computedRule
                                      ? 'border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
                                      : 'border-white/10 bg-slate-900/80 text-slate-300 hover:bg-slate-800/80',
                                  ].join(' ')}
                                  title={
                                    (Array.isArray(v.computedRules) && v.computedRules.length > 0)
                                      ? `规则链 x${v.computedRules.length}`
                                      : v.computedRule
                                        ? summarizeRule(v.computedRule)
                                        : '设置特殊规则'
                                  }
                                >
                                  规则{Array.isArray(v.computedRules) && v.computedRules.length > 0 ? `(${v.computedRules.length})` : ''}
                                </button>
                              </div>
                            </div>
                        ))}
                        {slot.variables.length === 0 && (
                            <div className="text-[11px] text-slate-500 italic">空 (请在右侧选择变量添加)</div>
                        )}
                    </div>
                    ) : (
                      <div className="text-[11px] text-slate-500">
                        已收起（{Array.isArray(slot.variables) ? slot.variables.length : 0} 个变量）
                      </div>
                    )}
                </div>
            ))}
        </div>

        <div className="p-4 border-t border-white/10 bg-slate-900/80">
           <button 
             onClick={handleSave} 
             disabled={saving}
             className="w-full flex items-center justify-center gap-2 bg-apple-blue text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-500 transition-colors shadow-lg shadow-sky-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
           >
             <Save className="w-4 h-4" />
             {saving ? '保存中...' : '保存配置'}
           </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex flex-col min-w-0 min-h-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950">
        {/* Toolbar overlay */}
        <div className="absolute top-4 left-4 right-4 z-20">
          <div className="bg-slate-900/80 backdrop-blur-xl shadow-xl border border-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-3 flex-nowrap overflow-hidden">
            <div
              className="text-xs font-medium text-slate-100 flex-1 min-w-0 truncate"
              title={
                guidePickMode
                  ? `参考线绑定模式：将绑定到 ${selectedImagePsIds.length} 个图片变量（在绿色框内依次点击两条竖向参考线：左→右）`
                  : selectedVariableIds.length > 0
                    ? selectedSlotLabel
                      ? `已选中 ${selectedVariableIds.length} 个变量，添加到${selectedSlotLabel}`
                      : `已选中 ${selectedVariableIds.length} 个变量，请先选择商品位`
                    : '在画布上点击变量即可多选，批量加入商品位'
              }
            >
              {guidePickMode
                ? `参考线绑定模式：将绑定到 ${selectedImagePsIds.length} 个图片变量（在绿色框内依次点击两条竖向参考线：左→右）`
                : selectedVariableIds.length > 0
                  ? selectedSlotLabel
                    ? `已选中 ${selectedVariableIds.length} 个变量，添加到${selectedSlotLabel}`
                    : `已选中 ${selectedVariableIds.length} 个变量，请先选择商品位`
                  : '在画布上点击变量即可多选，批量加入商品位'}
            </div>

            <button
              type="button"
              disabled={!hasGuideSource}
              onClick={() => {
                if (!hasGuideSource) return;
                setShowGuides((v) => {
                  const next = !v;
                  if (!next) setGuidePickMode(false);
                  return next;
                });
              }}
              className={[
                'px-3 py-1 rounded-full border text-xs transition-colors whitespace-nowrap shrink-0',
                !hasGuideSource
                  ? 'bg-white/5 border-white/10 text-slate-500 opacity-60 cursor-not-allowed'
                  : showGuides
                    ? 'bg-amber-500/15 border-amber-400/25 text-amber-100 hover:bg-amber-500/20'
                    : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10',
              ].join(' ')}
            >
              {showGuides ? '参考线：开' : '参考线：关'}
            </button>

            <button
              type="button"
              disabled={!hasGuideSource || selectedImagePsIds.length === 0}
              onClick={async () => {
                if (!hasGuideSource) return;
                if (selectedImagePsIds.length === 0) return alert('请先选中至少 1 个图片变量');
                if (guidePickMode) {
                  const ok = await persistGuidePicksOnly();
                  if (!ok) return;
                  setGuidePickMode(false);
                  setShowGuides(false);
                  flashAndScrollToVariable(activeImageVariable?.id);
                  return;
                }
                const vp = canvasRef.current?.getViewport?.();
                if (vp && typeof vp === 'object') viewportRef.current = vp;
                setShowGuides(true);
                setGuidePickMode(true);
              }}
              className={[
                'inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs transition-colors whitespace-nowrap shrink-0',
                !hasGuideSource || selectedImagePsIds.length === 0
                  ? 'bg-white/5 border-white/10 text-slate-500 opacity-60 cursor-not-allowed'
                  : guidePickMode
                    ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25'
                    : 'bg-indigo-500/25 border-indigo-400/40 text-indigo-100 hover:bg-indigo-500/30 hover:border-indigo-300/45',
              ].join(' ')}
            >
              <ArrowLeftRight className="w-4 h-4" />
              {guidePickMode ? '保存绑定' : '绑定参考线'}
            </button>

            {guidePickMode ? (
              <>
                <div className="text-[11px] text-slate-300 whitespace-nowrap shrink-0" title={activePickText}>
                  {activePickText}
                </div>
                <button
                  type="button"
                  disabled={selectedImagePsIds.length === 0}
                  onClick={handleClearActivePick}
                  className={[
                    'px-3 py-1 rounded-full border text-xs transition-colors whitespace-nowrap shrink-0',
                    selectedImagePsIds.length > 0
                      ? 'bg-rose-500/10 border-rose-400/20 text-rose-100 hover:bg-rose-500/15'
                      : 'bg-white/5 border-white/10 text-slate-500 opacity-60 cursor-not-allowed',
                  ].join(' ')}
                >
                  清除绑定
                </button>
              </>
            ) : null}

            {!guidePickMode && selectedVariableIds.length > 0 ? (
              <button
                onClick={assignVariablesToSlot}
                disabled={!selectedSlotLabel}
                className={[
                  'px-3 py-1 text-white text-xs font-semibold rounded-full transition-colors shadow-md whitespace-nowrap shrink-0',
                  selectedSlotLabel
                    ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/40'
                    : 'bg-slate-600/70 cursor-not-allowed shadow-transparent',
                ].join(' ')}
              >
                {selectedSlotLabel ? `添加到${selectedSlotLabel}` : '请选择商品位'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-6 md:p-8 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0 min-h-0">
            <div className="w-full h-full min-h-0 bg-slate-900/70 rounded-[24px] shadow-[0_32px_120px_rgba(15,23,42,0.95)] overflow-hidden relative border border-white/10 backdrop-blur-2xl">
              {guidePickMode ? (
                <HudEditor
                  width={template.width}
                  height={template.height}
                  referenceImage={template.previewUrl || null}
                  showGuides={showGuides}
                  guides={templateGuides}
                  guideLayers={templateGuideLayers}
                  guidePicker={guidePicker}
                  initialViewport={viewportRef.current}
                  onViewportChange={(state) => {
                    const scale = state && Number.isFinite(Number(state.scale)) ? Number(state.scale) : null;
                    const positionX = state && Number.isFinite(Number(state.positionX)) ? Number(state.positionX) : null;
                    const positionY = state && Number.isFinite(Number(state.positionY)) ? Number(state.positionY) : null;
                    if (scale == null || positionX == null || positionY == null) return;
                    viewportRef.current = { scale, positionX, positionY };
                  }}
                  hotspots={activeVariables
                    .filter((v) => v && v.varType === 'img' && v.psId)
                    .map((v) => ({
                      ...v,
                      type: 'image',
                      rect: { x: v.x, y: v.y, w: v.width, h: v.height },
                    }))}
                  selectedId={activeHotspotId}
                  highlightedIds={selectedVariableIds
                    .map((id) => String(id || ''))
                    .filter((id) => id && id !== String(activeHotspotId || ''))
                    .filter((id) => {
                      const v = variableById.get(id) || null;
                      return v && String(v.varType || '').toLowerCase() === 'img';
                    })}
                  attentionIds={attentionVariableIds}
                  onSelect={handleSelectHotspot}
                  sliceLines={[]}
                  showSliceLines={false}
                  onCanvasReady={() => {}}
                  showSidePanel={false}
                  showActiveHotspotLabel={false}
                />
              ) : (
                <TemplateCanvas
                  ref={canvasRef}
                  width={template.width}
                  height={template.height}
                  backgroundImage={template.previewUrl || null}
                  guidePick={!guidePickMode && activePickResolved ? activePickResolved : null}
                  showGuides={showGuides}
                  guides={templateGuides}
                  guideLayers={templateGuideLayers}
                  initialViewport={viewportRef.current}
                  onViewportChange={(state) => {
                    const scale = state && Number.isFinite(Number(state.scale)) ? Number(state.scale) : null;
                    const positionX = state && Number.isFinite(Number(state.positionX)) ? Number(state.positionX) : null;
                    const positionY = state && Number.isFinite(Number(state.positionY)) ? Number(state.positionY) : null;
                    if (scale == null || positionX == null || positionY == null) return;
                    viewportRef.current = { scale, positionX, positionY };
                  }}
                  enableImageUpload={false}
                  variables={activeVariables}
                  sliceLines={[]}
                  showSliceLines={false}
                  showVariableLabels={false}
                  selectedVariableIds={selectedVariableIds}
                  attentionVariableIds={attentionVariableIds}
                  onSelectVariableIds={handleSelectVariableIds}
                  onVariableChange={() => {}}
                  onCanvasReady={() => {}}
                />
              )}
            </div>
          </div>

          <div className="w-full lg:w-80 shrink-0 flex flex-col min-h-0 h-[42vh] md:h-[45vh] lg:h-auto">
            <div className="bg-slate-900/70 border border-white/10 rounded-3xl backdrop-blur-2xl shadow-2xl p-4 flex flex-col min-h-0 h-full">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <div className="text-xs font-semibold text-slate-100 tracking-wide">变量列表</div>
                </div>
                <div className="text-[10px] text-slate-400">
                  {activeVariables.filter(v => !v.hidden).length}/{variables.length}
                </div>
              </div>

              <div className="flex-1 min-h-0 flex flex-col">
                {activeVariables.length > 0 ? (
                  <div
                    className="space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-1 relative flex-1 min-h-0"
                    ref={variableListRef}
                    data-admin-variable-list
                  >
                    {activeVariables.map((v) => (
                      <div
                        key={v.id}
                        ref={el => { variableItemRefs.current[v.id] = el; }}
                        data-variable-id={v.id}
                        className={[
                          'flex items-center justify-between text-xs px-2 py-1.5 rounded-xl transition-all border',
                          selectedVariableIds.includes(v?.id != null ? String(v.id) : '')
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-white/5 border-transparent hover:bg-white/10 text-slate-400 hover:text-slate-200',
                          flashVariableId && String(v.id) === String(flashVariableId)
                            ? 'ring-2 ring-amber-400/50 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]'
                            : '',
                        ].join(' ')}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const id = v?.id != null ? String(v.id) : '';
                            if (!id) return;
                            const isMulti = e.ctrlKey || e.metaKey;
                            if (isMulti) {
                              const set = new Set(selectedVariableIds.map((x) => String(x)));
                              if (set.has(id)) set.delete(id);
                              else set.add(id);
                              handleSelectVariableIds(Array.from(set));
                            } else {
                              handleSelectVariableIds([id]);
                            }
                            scrollToVariable(id);
                          }}
                          className="flex-1 text-left truncate min-w-0"
                          title={v.key || v.name}
                        >
                          <span className="opacity-70 mr-1 text-[10px]">
                            {v.varType === 'text' ? 'T' : 'IMG'}
                          </span>
                          {v.key || v.name}
                          {v.hidden && <span className="ml-1 text-slate-600 italic">(隐)</span>}
                        </button>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {selectedVariableIds.includes(v?.id != null ? String(v.id) : '') && (
                            <span className="text-[10px] text-emerald-400">已选</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVariable(v?.id != null ? String(v.id) : '');
                            }}
                            className="ml-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="从当前模版配置中移除该变量"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <Layers className="w-10 h-10 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">暂无变量</p>
                    </div>
                  </div>
                )}

                {removedVariables.length > 0 && (
                  <div className="border-t border-white/5 pt-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowRemovedVariables(!showRemovedVariables)}
                      className="flex items-center justify-between w-full text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <span>
                        已移除变量
                        <span className="ml-1 text-slate-500">
                          ({removedVariables.length})
                        </span>
                      </span>
                      <span className="text-xs">
                        {showRemovedVariables ? '收起' : '展开'}
                      </span>
                    </button>
                    {showRemovedVariables && (
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-1">
                        {removedVariables.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between text-[11px] px-2 py-1 rounded-lg bg-slate-950/70 border border-white/5 text-slate-500"
                          >
                            <div className="truncate max-w-[120px]">
                              <span className="opacity-70 mr-1 text-[10px]">
                                {v.varType === 'text' ? 'T' : 'IMG'}
                              </span>
                              {v.key || v.name}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRestoreVariable(v.id)}
                              className="ml-2 text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                              恢复
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {ruleEditorOpen && (
        <div
          className="fixed inset-0 z-[999] bg-black/70 flex items-center justify-center p-4"
          onMouseDown={closeRuleEditor}
        >
          <div
            className="w-full max-w-[1120px] max-h-[90vh] overflow-hidden flex flex-col rounded-[2rem] bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 shrink-0 pb-4 border-b border-white/10">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-50 truncate">特殊规则</div>
                <div className="text-[11px] text-slate-400 mt-1 truncate">{ruleEditorVarName || '未命名变量'}</div>
              </div>
              <button
                type="button"
                onClick={closeRuleEditor}
                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-300 w-20 shrink-0">规则类型</div>
                <select
                  value={ruleEditorMode}
                  onChange={(e) => setRuleEditorMode(String(e.target.value || 'none'))}
                  className="flex-1 border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                >
                  <option value="none">无</option>
                  <option value="template">模板拼句（点字段插入）</option>
                  <option value="concatFields">字段拼接（如：款号+色号）</option>
                  <option value="lensTypeSummary">偏光摘要汇总（按款号）</option>
                  <option value="keywordContains">关键字判断（偏光/非偏光）</option>
                  <option value="valueMap">值映射表（查字典）</option>
                  <option value="raw">高级（原始 JSON）</option>
                </select>
              </div>

              {ruleEditorMode === 'template' && (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-300">像拼句子一样写：点字段按钮就能插入</div>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredFieldDefinitions.length > 0 ? (
                      filteredFieldDefinitions.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => insertTemplateToken(f.key)}
                          className="px-2 py-1 rounded-lg text-[11px] bg-slate-900/80 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                        >
                          {f.label || f.key}
                        </button>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-500">未找到匹配字段</span>
                    )}
                  </div>
                  <textarea
                    ref={ruleEditorTemplateRef}
                    value={ruleEditorTemplate}
                    onChange={(e) => setRuleEditorTemplate(e.target.value)}
                    className="w-full min-h-24 border border-white/10 rounded-2xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                    placeholder="示例：款号{{款号}}-{{色号}}"
                  />
                  <div className="text-[11px] text-slate-400">
                    {templatePreview ? `预览：${templatePreview}` : '预览：请先输入或点击字段'}
                  </div>
                </div>
              )}

              {ruleEditorMode === 'concatFields' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">默认连接符</div>
                    <input
                      value={ruleEditorJoiner}
                      onChange={(e) => setRuleEditorJoiner(e.target.value)}
                      className="flex-1 border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                      placeholder="未单独配置时使用"
                    />
                  </div>
                  <div className="space-y-2">
                    {ruleEditorItems.map((it, idx) => (
                      <div
                        key={idx}
                        className="bg-white/5 border border-white/10 rounded-2xl p-2 space-y-2"
                      >
                        <div className="grid grid-cols-12 gap-2 md:grid-cols-[90px_minmax(180px,1.7fr)_minmax(95px,1fr)_minmax(95px,1fr)_minmax(95px,1fr)_minmax(120px,1fr)_42px]">
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400 mb-1">类型</div>
                          <select
                            value={it.itemType === 'literal' ? 'literal' : 'field'}
                            onChange={(e) => {
                              const v = e.target.value === 'literal' ? 'literal' : 'field';
                              setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, itemType: v } : x)));
                            }}
                            className="w-full border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          >
                            <option value="field">字段</option>
                            <option value="literal">固定文案</option>
                          </select>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400 mb-1">{it.itemType === 'literal' ? '文案' : '字段'}</div>
                          {it.itemType === 'literal' ? (
                            <input
                              value={it.literalValue ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, literalValue: v } : x)));
                              }}
                              className="w-full border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                              placeholder="如：镜腿"
                            />
                          ) : (
                            <SearchableSelect
                              value={it.fieldKey || ''}
                              placeholder="选择字段"
                              searchPlaceholder="搜索字段…"
                              options={filteredFieldDefinitions.map((f) => ({ value: f.key, label: f.label || f.key }))}
                              onChange={(v) => {
                                setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, fieldKey: v } : x)));
                              }}
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400 mb-1">前缀</div>
                          <input
                            value={it.prefix}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, prefix: v } : x)));
                            }}
                            className="w-full border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                            placeholder="前缀"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400 mb-1">连接符</div>
                          <input
                            value={it.joinerBefore ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, joinerBefore: v } : x)));
                            }}
                            disabled={idx === 0}
                            className="w-full border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50"
                            placeholder={idx === 0 ? '首项' : '连接符'}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400 mb-1">后缀</div>
                          <input
                            value={it.suffix}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, suffix: v } : x)));
                            }}
                            className="w-full border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                            placeholder="后缀"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-400 mb-1">过滤值</div>
                          <input
                            value={it.ignoreValues ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ignoreValues: v } : x)));
                            }}
                            disabled={it.itemType === 'literal'}
                            className="w-full border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50"
                            placeholder="如 /，／"
                          />
                        </div>
                        <div className="flex items-end justify-end">
                          <button
                            type="button"
                            onClick={() => setRuleEditorItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                            title="移除"
                          >
                            ×
                          </button>
                        </div>
                        </div>
                        <div className="border-t border-white/10 pt-2">
                          <button
                            type="button"
                            onClick={() => setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, advancedOpen: !x.advancedOpen } : x)))}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white transition-colors"
                          >
                            {it.advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            高级设置
                          </button>
                          {it.advancedOpen && (
                            <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-slate-950/30 p-2">
                              <div className="text-[11px] font-medium text-slate-200">特殊值覆盖</div>
                              <div className="text-[11px] text-slate-400">命中后直接使用整段输出，不再拼接前缀/后缀</div>
                              {it.itemType === 'literal' ? (
                                <div className="text-[11px] text-slate-500">固定文案项不需要特殊值覆盖</div>
                              ) : (
                                <div className="space-y-2">
                                  {(Array.isArray(it.partOverrideRows) ? it.partOverrideRows : []).map((row, rowIdx) => (
                                    <div key={rowIdx} className="flex items-center gap-2">
                                      <input
                                        value={row.from ?? ''}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setRuleEditorItems((prev) => prev.map((x, i) => {
                                            if (i !== idx) return x;
                                            const rows = Array.isArray(x.partOverrideRows) ? x.partOverrideRows : [];
                                            return { ...x, partOverrideRows: rows.map((r, j) => (j === rowIdx ? { ...r, from: v } : r)) };
                                          }));
                                        }}
                                        className="w-32 border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                                        placeholder="例如：无框"
                                      />
                                      <input
                                        value={row.to ?? ''}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setRuleEditorItems((prev) => prev.map((x, i) => {
                                            if (i !== idx) return x;
                                            const rows = Array.isArray(x.partOverrideRows) ? x.partOverrideRows : [];
                                            return { ...x, partOverrideRows: rows.map((r, j) => (j === rowIdx ? { ...r, to: v } : r)) };
                                          }));
                                        }}
                                        className="flex-1 border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                                        placeholder="例如：无框"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setRuleEditorItems((prev) => prev.map((x, i) => {
                                          if (i !== idx) return x;
                                          const rows = Array.isArray(x.partOverrideRows) ? x.partOverrideRows : [];
                                          return { ...x, partOverrideRows: rows.filter((_, j) => j !== rowIdx) };
                                        }))}
                                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                                        title="移除覆盖"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setRuleEditorItems((prev) => prev.map((x, i) => (i === idx ? { ...x, partOverrideRows: [...(Array.isArray(x.partOverrideRows) ? x.partOverrideRows : []), { from: '', to: '' }] } : x)))}
                                    className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-200 hover:bg-white/10 transition-colors"
                                  >
                                    添加覆盖
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRuleEditorItems((prev) => [...prev, { itemType: 'field', fieldKey: '', literalValue: '', prefix: '', suffix: '', joinerBefore: ruleEditorJoiner, ignoreValues: '', advancedOpen: false, partOverrideRows: [] }])}
                      className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 hover:bg-white/10 transition-colors"
                    >
                      添加字段
                    </button>
                    <button
                      type="button"
                      onClick={() => setRuleEditorItems((prev) => [...prev, { itemType: 'literal', fieldKey: '', literalValue: '镜腿', prefix: '', suffix: '', joinerBefore: ruleEditorJoiner, ignoreValues: '', advancedOpen: false, partOverrideRows: [] }])}
                      className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 hover:bg-white/10 transition-colors"
                    >
                      添加固定文案
                    </button>
                    <div className="text-[11px] text-slate-400">
                      {concatPreview ? `拼接预览：${concatPreview}` : '拼接预览：请至少配置一个字段或固定文案'}
                    </div>
                  </div>
                </div>
              )}

              {ruleEditorMode === 'lensTypeSummary' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">分组字段</div>
                    <div className="flex-1" onMouseDown={(e) => e.stopPropagation()}>
                      <SearchableSelect
                        value={ruleEditorGroupByKey}
                        placeholder={filteredFieldDefinitions.length > 0 ? '例如：款号' : '未找到匹配字段'}
                        searchPlaceholder="搜索字段…"
                        disabled={filteredFieldDefinitions.length === 0}
                        options={filteredFieldDefinitions.map((f) => ({ value: f.key, label: f.label || f.key }))}
                        onChange={(v) => setRuleEditorGroupByKey(v)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">偏光字段</div>
                    <div className="flex-1" onMouseDown={(e) => e.stopPropagation()}>
                      <SearchableSelect
                        value={ruleEditorPolarFieldKey}
                        placeholder={filteredFieldDefinitions.length > 0 ? '例如：是否偏光' : '未找到匹配字段'}
                        searchPlaceholder="搜索字段…"
                        disabled={filteredFieldDefinitions.length === 0}
                        options={filteredFieldDefinitions.map((f) => ({ value: f.key, label: f.label || f.key }))}
                        onChange={(v) => setRuleEditorPolarFieldKey(v)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">偏光关键词</div>
                    <input
                      value={ruleEditorPolarKeyword}
                      onChange={(e) => setRuleEditorPolarKeyword(e.target.value)}
                      className="flex-1 border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                      placeholder="偏光"
                    />
                  </div>
                  <div className="text-[11px] text-slate-400">按分组字段汇总同款所有行的偏光字段，输出：高清偏光 / 高清非偏光 / 高清偏光/非偏光（高级 JSON 可用 polarizedText/unpolarizedText/bothText 自定义）</div>
                </div>
              )}

              {ruleEditorMode === 'keywordContains' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">来源字段</div>
                    <div className="flex-1" onMouseDown={(e) => e.stopPropagation()}>
                      <SearchableSelect
                        value={ruleEditorKeywordSourceKey}
                        placeholder={filteredFieldDefinitions.length > 0 ? '选择字段' : '未找到匹配字段'}
                        searchPlaceholder="搜索字段…"
                        disabled={filteredFieldDefinitions.length === 0}
                        options={filteredFieldDefinitions.map((f) => ({ value: f.key, label: f.label || f.key }))}
                        onChange={(v) => setRuleEditorKeywordSourceKey(v)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">关键字</div>
                    <input
                      value={ruleEditorKeyword}
                      onChange={(e) => setRuleEditorKeyword(e.target.value)}
                      className="flex-1 border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                      placeholder="偏光"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">命中文案</div>
                    <input
                      value={ruleEditorKeywordTrueText}
                      onChange={(e) => setRuleEditorKeywordTrueText(e.target.value)}
                      className="flex-1 border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                      placeholder="高清偏光镜片"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">未命中文案</div>
                    <input
                      value={ruleEditorKeywordFalseText}
                      onChange={(e) => setRuleEditorKeywordFalseText(e.target.value)}
                      className="flex-1 border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                      placeholder="非偏光镜片"
                    />
                  </div>
                </div>
              )}

              {ruleEditorMode === 'valueMap' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 w-20 shrink-0">来源字段</div>
                    <div className="flex-1" onMouseDown={(e) => e.stopPropagation()}>
                      <SearchableSelect
                        value={ruleEditorMapSourceKey}
                        placeholder={filteredFieldDefinitions.length > 0 ? '选择字段' : '未找到匹配字段'}
                        searchPlaceholder="搜索字段…"
                        disabled={filteredFieldDefinitions.length === 0}
                        options={filteredFieldDefinitions.map((f) => ({ value: f.key, label: f.label || f.key }))}
                        onChange={(v) => setRuleEditorMapSourceKey(v)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ruleEditorMapRows.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2">
                        <input
                          value={r.from}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRuleEditorMapRows((prev) => prev.map((x, i) => (i === idx ? { ...x, from: v } : x)));
                          }}
                          className="w-36 border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          placeholder="原值"
                        />
                        <input
                          value={r.to}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRuleEditorMapRows((prev) => prev.map((x, i) => (i === idx ? { ...x, to: v } : x)));
                          }}
                          className="flex-1 border border-white/10 rounded-xl px-2 py-1.5 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                          placeholder="显示值"
                        />
                        <button
                          type="button"
                          onClick={() => setRuleEditorMapRows((prev) => prev.filter((_, i) => i !== idx))}
                          className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                          title="移除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRuleEditorMapRows((prev) => [...prev, { from: '', to: '' }])}
                      className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 hover:bg-white/10 transition-colors"
                    >
                      添加映射
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={ruleEditorMapExactMatchOnly}
                      onChange={(e) => setRuleEditorMapExactMatchOnly(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-slate-900/70 text-sky-400 focus:ring-sky-400/50"
                    />
                    开启精确匹配（仅整值命中，不做组合值部分替换）
                  </label>
                  <div className="text-[11px] text-slate-400">未命中映射时保持原样</div>
                </div>
              )}

              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-300">规则链（按顺序串行执行）</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const draft = buildRuleFromEditorState();
                        if (draft === '__INVALID_JSON__') {
                          alert('规则 JSON 解析失败，请检查格式');
                          return;
                        }
                        if (draft === null) {
                          alert('当前规则未填写完整，无法加入规则链');
                          return;
                        }
                        const entry = normalizeChainEntry(draft);
                        if (!entry) {
                          alert('当前规则未填写完整，无法加入规则链');
                          return;
                        }
                        setRuleEditorChain((prev) => [...(Array.isArray(prev) ? prev : []), entry]);
                      }}
                      className={[
                        'px-3 py-1.5 rounded-xl border text-[11px] transition-colors shadow-sm',
                        (Array.isArray(ruleEditorChain) ? ruleEditorChain : []).length === 0
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/25'
                          : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10',
                      ].join(' ')}
                      title="把当前编辑的规则加入规则链"
                    >
                      加入规则链（继续）
                    </button>
                    <button
                      type="button"
                      onClick={() => setRuleEditorChain([])}
                      className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-200 hover:bg-white/10 transition-colors"
                    >
                      清空规则链
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-400">点“编辑”可修改该条规则，点“加入规则链（继续）”会新增一条</div>
                {ruleEditorChain.length === 0 ? (
                  <div className="mt-2 text-[11px] text-slate-500">暂无规则链（仅使用“单条规则”或字段绑定）</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {ruleEditorChain.map((r, idx) => {
                      const enabled = !(r && r.enabled === false);
                      const label = summarizeRule(r);
                      return (
                        <div
                          key={r && r.id ? String(r.id) : `rule_${idx}`}
                          className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setRuleEditorChain((prev) =>
                                (Array.isArray(prev) ? prev : []).map((x, i) => {
                                  if (i !== idx) return x;
                                  if (!x || typeof x !== 'object') return x;
                                  const isEnabled = !(x.enabled === false);
                                  return { ...x, enabled: !isEnabled };
                                }),
                              )
                            }
                            className={[
                              'px-2 py-1 rounded-lg border text-[10px] transition-colors',
                              enabled ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-slate-950/40 text-slate-400',
                            ].join(' ')}
                            title={enabled ? '点击禁用' : '点击启用'}
                          >
                            {enabled ? '启用' : '禁用'}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-slate-200 truncate">{label || '(未命名规则)'}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const target = r && typeof r === 'object' ? r : String(r || '');
                                setEditingChainIndex(idx);
                                loadRuleIntoEditor(target);
                              }}
                              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                              title="编辑"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() =>
                                setRuleEditorChain((prev) => {
                                  const list = [...(Array.isArray(prev) ? prev : [])];
                                  if (idx <= 0 || idx >= list.length) return list;
                                  const tmp = list[idx - 1];
                                  list[idx - 1] = list[idx];
                                  list[idx] = tmp;
                                  return list;
                                })
                              }
                              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-white/5"
                              title="上移"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === ruleEditorChain.length - 1}
                              onClick={() =>
                                setRuleEditorChain((prev) => {
                                  const list = [...(Array.isArray(prev) ? prev : [])];
                                  if (idx < 0 || idx >= list.length - 1) return list;
                                  const tmp = list[idx + 1];
                                  list[idx + 1] = list[idx];
                                  list[idx] = tmp;
                                  return list;
                                })
                              }
                              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-white/5"
                              title="下移"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => setRuleEditorChain((prev) => (Array.isArray(prev) ? prev : []).filter((_, i) => i !== idx))}
                              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                              title="删除"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {ruleEditorMode === 'raw' && (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400">直接编辑 computedRule JSON</div>
                  <textarea
                    value={ruleEditorRawJson}
                    onChange={(e) => setRuleEditorRawJson(e.target.value)}
                    className="w-full min-h-32 border border-white/10 rounded-2xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400 font-mono"
                    placeholder='{"type":"concatFields","fieldKeys":["款号","色号"],"joiner":"-"}'
                  />
                </div>
              )}
            </div>

            <div className="shrink-0 mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
              {editingChainIndex !== null && (
                <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
                  当前正在编辑：规则链第 {editingChainIndex + 1} 条。保存后会覆盖这条规则。
                </div>
              )}
              <button
                type="button"
                onClick={() => setRuleEditorMode('none')}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 hover:bg-white/10 transition-colors"
              >
                清空规则
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeRuleEditor}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={applyRuleEditor}
                  className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-xs text-emerald-100 hover:bg-emerald-500/30 transition-colors"
                >
                  {editingChainIndex !== null ? '更新此条规则' : '保存规则'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
