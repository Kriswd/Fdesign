import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Check, ChevronDown, Download, Plus, RefreshCw, Save, Search, Trash2, Upload } from 'lucide-react';
import HudEditor from '../components/HudEditor';
import { createApiClient } from '../utils/apiClient';

function toSafeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGuidePick(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const leftX = toSafeNumber(raw.leftX);
  const rightX = toSafeNumber(raw.rightX);
  if (!Number.isFinite(leftX) || !Number.isFinite(rightX)) return null;
  if (rightX <= leftX) return null;
  return { leftX: Math.round(leftX), rightX: Math.round(rightX) };
}

function defaultExportFormatsFromPsdName(name) {
  const raw = String(name || '');
  return /png/i.test(raw) ? ['png'] : ['jpeg', 'psd'];
}

function normalizeExportFormats(rawExportFormats, fallbackExportFormats) {
  const fallback = Array.isArray(fallbackExportFormats) ? fallbackExportFormats : [];
  const list =
    rawExportFormats == null ? fallback : Array.isArray(rawExportFormats) ? rawExportFormats : [rawExportFormats];
  const allowed = new Set(['png', 'jpeg', 'psd']);
  const outSet = new Set();
  for (let i = 0; i < list.length; i += 1) {
    let fmt = String(list[i] || '')
      .trim()
      .toLowerCase();
    if (!fmt) continue;
    if (fmt === 'jpg') fmt = 'jpeg';
    if (!allowed.has(fmt)) continue;
    outSet.add(fmt);
  }
  if (outSet.size === 0) {
    for (let i = 0; i < fallback.length; i += 1) {
      let fmt = String(fallback[i] || '')
        .trim()
        .toLowerCase();
      if (!fmt) continue;
      if (fmt === 'jpg') fmt = 'jpeg';
      if (!allowed.has(fmt)) continue;
      outSet.add(fmt);
    }
  }
  if (outSet.size === 0) outSet.add('png');
  const order = ['png', 'jpeg', 'psd'];
  const out = Array.from(outSet.values());
  out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return out;
}

import { parsePsdClientSide } from '../utils/psdClientParser';

export default function AdminTaskTemplateTab({ renderServerBaseUrl, onRequireAuth }) {
  const apiClient = useMemo(() => createApiClient(renderServerBaseUrl), [renderServerBaseUrl]);
  const getOriginFromUrl = useCallback((u) => {
    try {
      return new URL(String(u || '')).origin;
    } catch {
      return '';
    }
  }, []);

  const [taskTemplates, setTaskTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeTaskTemplateId, setActiveTaskTemplateId] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [variableQuery, setVariableQuery] = useState('');

  const [templateId, setTemplateId] = useState('');
  const [tplLoading, setTplLoading] = useState(false);
  const [tplData, setTplData] = useState(null);
  const [stableVariables, setStableVariables] = useState([]);
  const stableVariablesTemplateIdRef = useRef('');

  const [slotConfigBase, setSlotConfigBase] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [ignoredVariableIds, setIgnoredVariableIds] = useState([]);
  const [showRemovedVariables, setShowRemovedVariables] = useState(false);
  const pendingPersistIgnoredRef = useRef(false);

  const [showGuides, setShowGuides] = useState(true);
  const [guidePickMode, setGuidePickMode] = useState(false);
  const [activeHotspotId, setActiveHotspotId] = useState(null);
  const [selectedPsIds, setSelectedPsIds] = useState(() => new Set());
  const [manualGuidePicks, setManualGuidePicks] = useState(() => new Map());
  const [exportFormats, setExportFormats] = useState(() => ['jpeg', 'psd']);
  const selectedPsIdsRef = useRef(new Set());
  const manualGuidePicksRef = useRef(new Map());

  selectedPsIdsRef.current = selectedPsIds;
  manualGuidePicksRef.current = manualGuidePicks;

  const setSelectedPsIdsSafe = useCallback((updater) => {
    setSelectedPsIds((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      selectedPsIdsRef.current = next;
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

  const newUploadRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadHint, setUploadHint] = useState('');
  const [psdDropActive, setPsdDropActive] = useState(false);
  const psdDragDepthRef = useRef(0);
  const configRef = useRef(null);
  const scrollToConfigRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const [page, setPage] = useState('list');
  const sessionKey = useMemo(() => 'fdesign_admin_task_template_draft_v1', []);

  useEffect(() => {
    const id = String(templateId || '').trim();
    const prev = String(stableVariablesTemplateIdRef.current || '');
    if (id === prev) return;
    if (!id) {
      stableVariablesTemplateIdRef.current = '';
      setStableVariables([]);
      return;
    }
    if (!prev && stableVariables.length > 0) {
      stableVariablesTemplateIdRef.current = id;
      return;
    }
    stableVariablesTemplateIdRef.current = id;
    setStableVariables([]);
  }, [stableVariables.length, templateId]);

  const buildUserErrorText = useCallback((err, fallback) => {
    const base = String(fallback || '操作失败').trim() || '操作失败';
    const raw = err && typeof err === 'object' && 'message' in err ? String(err.message || '') : '';
    const msg = raw.trim();
    const name = err && typeof err === 'object' && 'name' in err ? String(err.name || '') : '';
    const looksLikeNetwork =
      name === 'TypeError' ||
      /failed to fetch/i.test(msg) ||
      /networkerror/i.test(msg) ||
      /err_connection_refused/i.test(msg);
    if (looksLikeNetwork) {
      const host = typeof window !== 'undefined' ? String(window.location.hostname || '') : '';
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
      const netMsg = isLocal
        ? '无法连接到服务端，请确认后端服务已启动且端口可用'
        : '网络异常，无法连接到服务端，请稍后重试';
      return `${base}：${netMsg}`;
    }
    if (!msg) return base;
    if (msg.startsWith(base)) return msg;
    return `${base}：${msg}`;
  }, []);

  const loadTemplateConfig = useCallback(
    async (nextTemplateId) => {
      const id = String(nextTemplateId || '').trim();
      if (!id) {
        setSlotConfigBase(null);
        setIgnoredVariableIds([]);
        return;
      }
      try {
        setConfigLoading(true);
        const { res: resp } = await apiClient.fetchWithFallback(`/api/template/${encodeURIComponent(id)}/config`, {
          credentials: 'include',
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if (resp.status === 401) onRequireAuth?.();
          throw new Error(data?.message || data?.error || '加载模版配置失败');
        }
        const base = {
          version: typeof data?.version === 'number' ? data.version : 1,
          slots: Array.isArray(data?.slots) ? data.slots : [],
          fieldDefinitions: Array.isArray(data?.fieldDefinitions) ? data.fieldDefinitions : [],
          ignoredFieldKeys: Array.isArray(data?.ignoredFieldKeys) ? data.ignoredFieldKeys : [],
        };
        const remoteIgnored = Array.isArray(data?.ignoredVariableIds)
          ? data.ignoredVariableIds.map((v) => (v != null ? String(v) : '')).filter((v) => v)
          : [];
        setSlotConfigBase(base);
        setIgnoredVariableIds((prev) => {
          if (pendingPersistIgnoredRef.current && Array.isArray(prev) && prev.length > 0) {
            const s = new Set(remoteIgnored);
            for (let i = 0; i < prev.length; i += 1) {
              const v = prev[i] != null ? String(prev[i]) : '';
              if (v) s.add(v);
            }
            return Array.from(s);
          }
          return remoteIgnored;
        });
      } catch (e) {
        setSlotConfigBase(null);
        alert(buildUserErrorText(e, '加载模版配置失败'));
      } finally {
        setConfigLoading(false);
      }
    },
    [apiClient, buildUserErrorText, onRequireAuth],
  );

  const persistIgnoredVariableIds = useCallback(
    async (nextIgnored) => {
      const id = String(templateId || '').trim();
      if (!id) return;
      const base = slotConfigBase && typeof slotConfigBase === 'object' ? slotConfigBase : null;
      if (!base) return;
      const payload = {
        version: typeof base.version === 'number' ? base.version : 1,
        slots: Array.isArray(base.slots) ? base.slots : [],
        fieldDefinitions: Array.isArray(base.fieldDefinitions) ? base.fieldDefinitions : [],
        ignoredVariableIds: Array.isArray(nextIgnored)
          ? nextIgnored.map((v) => (v != null ? String(v) : '')).filter((v) => v)
          : [],
        ignoredFieldKeys: Array.isArray(base.ignoredFieldKeys) ? base.ignoredFieldKeys : [],
      };
      try {
        setConfigSaving(true);
        const { res: resp } = await apiClient.fetchWithFallback(`/api/template/${encodeURIComponent(id)}/slot-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if (resp.status === 401) onRequireAuth?.();
          throw new Error(data?.message || data?.error || '保存变量移除状态失败');
        }
      } catch (e) {
        alert(buildUserErrorText(e, '保存变量移除状态失败'));
      } finally {
        setConfigSaving(false);
      }
    },
    [apiClient, buildUserErrorText, onRequireAuth, slotConfigBase, templateId],
  );

  const refreshTaskTemplates = useCallback(async () => {
    try {
      setLoadingList(true);
      const { res: resp } = await apiClient.fetchWithFallback('/api/task-templates', { credentials: 'include' });
      if (!resp.ok) {
        if (resp.status === 401) onRequireAuth?.();
        throw new Error('获取任务模版失败');
      }
      const data = await resp.json().catch(() => []);
      setTaskTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(buildUserErrorText(e, '获取任务模版失败'));
    } finally {
      setLoadingList(false);
    }
  }, [apiClient, buildUserErrorText, onRequireAuth]);

  const handleExportAll = useCallback(async () => {
    try {
      const { res: resp } = await apiClient.fetchWithFallback('/api/task-templates/export-all', {
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('导出失败');
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `task_templates_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(buildUserErrorText(e, '导出失败'));
    }
  }, [apiClient, buildUserErrorText]);

  const handleImportAll = useCallback(
    async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      e.target.value = '';
      const confirmed = window.confirm('导入将覆盖当前全部任务模版,确认继续?');
      if (!confirmed) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const { res: resp } = await apiClient.fetchWithFallback('/api/task-templates/import-all', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(result.error || result.message || '导入失败');
        alert(`导入成功,共导入 ${result.imported || 0} 个任务模版`);
        await refreshTaskTemplates();
      } catch (err) {
        alert(buildUserErrorText(err, '导入失败'));
      }
    },
    [apiClient, buildUserErrorText, refreshTaskTemplates],
  );

  const resetEditingState = useCallback(() => {
    setActiveTaskTemplateId(null);
    setName('');
    setTemplateId('');
    setTplData(null);
    setStableVariables([]);
    stableVariablesTemplateIdRef.current = '';
    setSlotConfigBase(null);
    setIgnoredVariableIds([]);
    setShowRemovedVariables(false);
    pendingPersistIgnoredRef.current = false;
    setActiveHotspotId(null);
    setSelectedPsIdsSafe(new Set());
    setManualGuidePicksSafe(new Map());
    setGuidePickMode(false);
    setCreating(true);
  }, [setManualGuidePicksSafe, setSelectedPsIdsSafe]);

  const handleDeleteTaskTemplate = useCallback(
    async (taskTemplateId) => {
      const tid = Number(taskTemplateId);
      if (!Number.isInteger(tid) || tid <= 0) return;
      const yes = window.confirm('确定删除该任务模板吗？删除后无法恢复。');
      if (!yes) return;
      try {
        const { res: resp } = await apiClient.fetchWithFallback(`/api/task-templates/${tid}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if (resp.status === 401) onRequireAuth?.();
          throw new Error(data?.message || data?.error || '删除失败');
        }
        if (Number(activeTaskTemplateId) === tid) {
          resetEditingState();
          setPage('list');
        }
        await refreshTaskTemplates();
      } catch (e) {
        alert(buildUserErrorText(e, '删除失败'));
      }
    },
    [activeTaskTemplateId, apiClient, buildUserErrorText, onRequireAuth, refreshTaskTemplates, resetEditingState],
  );

  useEffect(() => {
    refreshTaskTemplates();
  }, [refreshTaskTemplates]);

  useEffect(() => {
    if (!showGuides) setGuidePickMode(false);
  }, [showGuides]);

  useEffect(() => {
    if (page !== 'edit') return;
    if (!scrollToConfigRef.current) return;
    scrollToConfigRef.current = false;
    requestAnimationFrame(() => {
      const el = configRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [page]);

  const loadPsdTemplate = useCallback(
    async (nextTemplateId) => {
      const id = String(nextTemplateId || '').trim();
      if (!id) {
        setTplData(null);
        setStableVariables([]);
        stableVariablesTemplateIdRef.current = '';
        return;
      }
      try {
        setTplLoading(true);
        const { res: resp, meta } = await apiClient.fetchWithFallback(`/api/template/${encodeURIComponent(id)}`, {
          credentials: 'include',
        });
        if (!resp.ok) {
          if (resp.status === 401) onRequireAuth?.();
          throw new Error('加载 PSD 模版失败');
        }
        const data = await resp.json().catch(() => null);
        const width = Number(data?.frontendConfig?.width ?? data?.width ?? 0);
        const height = Number(data?.frontendConfig?.height ?? data?.height ?? 0);
        const preferredBase = getOriginFromUrl(meta?.url);
        const imageUrl = data?.imageUrl ? apiClient.resolveDownloadUrl(`${data.imageUrl}?t=${Date.now()}`, preferredBase) : null;
        const variables = Array.isArray(data?.frontendConfig?.variables)
          ? data.frontendConfig.variables
          : Array.isArray(data?.variables)
            ? data.variables
            : [];
        const guides = data?.guides ?? null;
        const guideLayers = data?.guideLayers ?? null;
        const varsFromResp = variables;
        setTplData((prev) => {
          const prevId = String(prev?.raw?.id || '').trim();
          const allowReusePrev = prev && (!prevId || prevId === id);
          const mergedImageUrl = imageUrl || (allowReusePrev ? prev?.imageUrl : null);
          const mergedVariables =
            allowReusePrev && Array.isArray(prev?.variables) && prev.variables.length > 0 ? prev.variables : varsFromResp;
          return {
            raw: { ...(data || {}), id: String(data?.id || id) },
            width: Number.isFinite(width) ? width : 0,
            height: Number.isFinite(height) ? height : 0,
            imageUrl: mergedImageUrl,
            variables: mergedVariables,
            guides,
            guideLayers,
          };
        });
        setStableVariables((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : varsFromResp));
      } catch (e) {
        setTplData(null);
        setStableVariables([]);
        stableVariablesTemplateIdRef.current = '';
        alert(buildUserErrorText(e, '加载 PSD 模版失败'));
      } finally {
        setTplLoading(false);
      }
    },
    [apiClient, buildUserErrorText, getOriginFromUrl, onRequireAuth],
  );

  useEffect(() => {
    if (page !== 'edit') return;
    const id = String(templateId || '').trim();
    if (!id) return;
    if (tplLoading) return;
    const loadedId = String(tplData?.raw?.id || '').trim();
    if (loadedId === id) return;
    loadPsdTemplate(id);
  }, [loadPsdTemplate, page, templateId, tplData?.raw?.id, tplLoading]);

  useEffect(() => {
    if (page !== 'edit') return;
    const id = String(templateId || '').trim();
    if (!id) {
      setSlotConfigBase(null);
      setIgnoredVariableIds([]);
      return;
    }
    loadTemplateConfig(id);
  }, [loadTemplateConfig, page, templateId]);

  useEffect(() => {
    if (!pendingPersistIgnoredRef.current) return;
    const id = String(templateId || '').trim();
    if (!id) return;
    if (!slotConfigBase) return;
    pendingPersistIgnoredRef.current = false;
    persistIgnoredVariableIds(ignoredVariableIds);
  }, [ignoredVariableIds, persistIgnoredVariableIds, slotConfigBase, templateId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (page !== 'edit' || !templateId) {
        window.sessionStorage.removeItem(sessionKey);
        return;
      }
      window.sessionStorage.setItem(
        sessionKey,
        JSON.stringify({ templateId: String(templateId || ''), page: String(page || ''), updatedAt: Date.now() }),
      );
    } catch (e) {
      console.warn('写入会话缓存失败:', e && e.message ? e.message : String(e));
    }
  }, [page, sessionKey, templateId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (restoredDraftRef.current) return;
      restoredDraftRef.current = true;
      if (templateId) return;
      const raw = window.sessionStorage.getItem(sessionKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const cachedId = parsed && typeof parsed.templateId === 'string' ? parsed.templateId : '';
      const cachedPage = parsed && typeof parsed.page === 'string' ? parsed.page : '';
      if (!cachedId) return;
      setTemplateId(cachedId);
      if (cachedPage === 'edit') setPage('edit');
      loadPsdTemplate(cachedId);
    } catch (e) {
      console.warn('读取会话缓存失败:', e && e.message ? e.message : String(e));
    }
  }, [loadPsdTemplate, sessionKey, templateId]);

  const loadTaskTemplateDetail = useCallback(
    async (id) => {
      const tid = Number(id);
      if (!Number.isInteger(tid) || tid <= 0) return;
      try {
        setPage('edit');
        scrollToConfigRef.current = true;
        setCreating(false);
        const { res: resp } = await apiClient.fetchWithFallback(`/api/task-templates/${tid}`, { credentials: 'include' });
        if (!resp.ok) {
          if (resp.status === 401) onRequireAuth?.();
          throw new Error('加载任务模版失败');
        }
        const data = await resp.json().catch(() => null);
        if (!data) throw new Error('加载任务模版失败');
        setActiveTaskTemplateId(Number(data.id));
        setName(String(data.name || ''));
        setVariableQuery('');
        const items = Array.isArray(data.items) ? data.items : [];
        const first = items[0] || null;
        const tId = String(first?.templateId || '').trim();
        setTemplateId(tId);
        const nextSelected = new Set();
        const rawSelected = Array.isArray(first?.selectedPsIds) ? first.selectedPsIds : [];
        for (let i = 0; i < rawSelected.length; i += 1) {
          const n = Math.trunc(Number(rawSelected[i]));
          if (!Number.isFinite(n) || n <= 0) continue;
          nextSelected.add(n);
        }
        setSelectedPsIdsSafe(nextSelected);
        const pickMap = new Map();
        const rawGuidePicks = first?.guidePicks && typeof first.guidePicks === 'object' ? first.guidePicks : {};
        const keys = Object.keys(rawGuidePicks);
        for (let i = 0; i < keys.length; i += 1) {
          const psId = Math.trunc(Number(keys[i]));
          if (!Number.isFinite(psId) || psId <= 0) continue;
          const pick = normalizeGuidePick(rawGuidePicks[keys[i]]);
          if (!pick) continue;
          pickMap.set(psId, pick);
        }
        setManualGuidePicksSafe(pickMap);
        setExportFormats(normalizeExportFormats(first?.exportFormats, ['jpeg', 'psd']));
        await loadPsdTemplate(tId);
      } catch (e) {
        alert(buildUserErrorText(e, '加载任务模版失败'));
      }
    },
    [apiClient, buildUserErrorText, loadPsdTemplate, onRequireAuth, setManualGuidePicksSafe, setSelectedPsIdsSafe],
  );

  const imageVariables = useMemo(() => {
    const vars = Array.isArray(stableVariables) && stableVariables.length > 0 ? stableVariables : tplData?.variables;
    const list = Array.isArray(vars) ? vars : [];
    return list.filter((v) => {
      const t = String(v?.varType || v?.type || '').toLowerCase();
      return t === 'img' || t === 'image';
    });
  }, [stableVariables, tplData?.variables]);

  const ignoredVariableIdSet = useMemo(() => {
    const out = new Set();
    const list = Array.isArray(ignoredVariableIds) ? ignoredVariableIds : [];
    for (let i = 0; i < list.length; i += 1) {
      const id = list[i] != null ? String(list[i]) : '';
      if (id) out.add(id);
    }
    return out;
  }, [ignoredVariableIds]);

  const activeImageVariables = useMemo(() => {
    if (!ignoredVariableIdSet || ignoredVariableIdSet.size === 0) return imageVariables;
    return imageVariables.filter((v) => {
      const id = v?.id != null ? String(v.id) : '';
      if (!id) return true;
      return !ignoredVariableIdSet.has(id);
    });
  }, [ignoredVariableIdSet, imageVariables]);

  const removedImageVariables = useMemo(() => {
    if (!ignoredVariableIdSet || ignoredVariableIdSet.size === 0) return [];
    return imageVariables.filter((v) => {
      const id = v?.id != null ? String(v.id) : '';
      return !!id && ignoredVariableIdSet.has(id);
    });
  }, [ignoredVariableIdSet, imageVariables]);

  const variableByIdAll = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < imageVariables.length; i += 1) {
      const v = imageVariables[i];
      const id = v?.id != null ? String(v.id) : '';
      if (!id) continue;
      m.set(id, v);
    }
    return m;
  }, [imageVariables]);

  const variableById = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < activeImageVariables.length; i += 1) {
      const v = activeImageVariables[i];
      const id = v?.id != null ? String(v.id) : '';
      if (!id) continue;
      m.set(id, v);
    }
    return m;
  }, [activeImageVariables]);

  const variableByPsId = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < activeImageVariables.length; i += 1) {
      const v = activeImageVariables[i];
      const psId = Math.trunc(Number(v?.psId));
      if (!Number.isFinite(psId) || psId <= 0) continue;
      m.set(psId, v);
    }
    return m;
  }, [activeImageVariables]);

  const highlightedIds = useMemo(() => {
    const out = [];
    for (const psId of selectedPsIds.values()) {
      const v = variableByPsId.get(psId);
      if (!v) continue;
      const id = v?.id != null ? String(v.id) : '';
      if (!id) continue;
      out.push(id);
    }
    return out;
  }, [selectedPsIds, variableByPsId]);

  const activeVariable = useMemo(() => {
    const id = activeHotspotId != null ? String(activeHotspotId) : '';
    if (!id) return null;
    return variableById.get(id) || null;
  }, [activeHotspotId, variableById]);

  const activeVariablePsId = useMemo(() => {
    const n = Math.trunc(Number(activeVariable?.psId));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [activeVariable]);

  const activeGuidePickDraft = useMemo(() => {
    if (!Number.isFinite(activeVariablePsId)) return null;
    const raw = manualGuidePicksRef.current.get(activeVariablePsId) || null;
    return normalizeGuidePick(raw) || (raw && typeof raw === 'object' ? raw : null);
  }, [activeVariablePsId]);

  const handleDeleteVariableById = useCallback(
    (variableId) => {
      const id = variableId != null ? String(variableId) : '';
      if (!id) return;
      const v = variableByIdAll.get(id) || null;
      const psId = Math.trunc(Number(v?.psId));
      setIgnoredVariableIds((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.includes(id)) return list;
        pendingPersistIgnoredRef.current = true;
        return [...list, id];
      });
      if (Number.isFinite(psId) && psId > 0) {
        setSelectedPsIdsSafe((prev) => {
          if (!prev || typeof prev.has !== 'function') return prev;
          if (!prev.has(psId)) return prev;
          const next = new Set(prev);
          next.delete(psId);
          return next;
        });
        setManualGuidePicksSafe((prev) => {
          if (!prev || typeof prev.delete !== 'function') return prev;
          if (!prev.has(psId)) return prev;
          const next = new Map(prev);
          next.delete(psId);
          return next;
        });
      }
      setActiveHotspotId((prev) => {
        const cur = prev != null ? String(prev) : '';
        return cur === id ? null : prev;
      });
      setGuidePickMode(false);
    },
    [setManualGuidePicksSafe, setSelectedPsIdsSafe, variableByIdAll],
  );

  const handleRestoreVariableById = useCallback(
    (variableId) => {
      const id = variableId != null ? String(variableId) : '';
      if (!id) return;
      setIgnoredVariableIds((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (!list.includes(id)) return list;
        pendingPersistIgnoredRef.current = true;
        return list.filter((v) => String(v) !== id);
      });
    },
    [],
  );

  const guidePicker = useMemo(() => {
    if (!showGuides) return null;
    if (!guidePickMode) return null;
    if (!activeVariable || !Number.isFinite(activeVariablePsId)) return null;
    const x = toSafeNumber(activeVariable?.x);
    const w = toSafeNumber(activeVariable?.width);
    if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 1) return null;
    const rect = { left: Math.round(x), right: Math.round(x + w) };
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right) || rect.right <= rect.left) return null;
    const selected = activeGuidePickDraft && typeof activeGuidePickDraft === 'object' ? { ...activeGuidePickDraft } : {};
    return {
      enabled: true,
      rect,
      selected,
      sources: ['native', 'layer'],
      onPick: (pickedX) => {
        const px = Math.round(Number(pickedX));
        if (!Number.isFinite(px)) return;
        setManualGuidePicksSafe((prev) => {
          const next = new Map(prev);
          const prevPick = next.get(activeVariablePsId) || null;
          const prevLeft = prevPick && Number.isFinite(Number(prevPick.leftX)) ? Math.round(Number(prevPick.leftX)) : null;
          const prevRight = prevPick && Number.isFinite(Number(prevPick.rightX)) ? Math.round(Number(prevPick.rightX)) : null;
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
          next.set(activeVariablePsId, { leftX, rightX });
          return next;
        });
      },
    };
  }, [activeGuidePickDraft, activeVariable, activeVariablePsId, guidePickMode, setManualGuidePicksSafe, showGuides]);

  const toggleVariableByHotspotId = useCallback(
    (hotspotId) => {
      const id = hotspotId != null ? String(hotspotId) : '';
      setActiveHotspotId(id || null);
      if (!id) return;
      const v = variableById.get(id) || null;
      if (!v) return;
      const psId = Math.trunc(Number(v?.psId));
      if (!Number.isFinite(psId) || psId <= 0) return;
      setSelectedPsIdsSafe((prev) => {
        const next = new Set(prev);
        if (next.has(psId)) next.delete(psId);
        else next.add(psId);
        return next;
      });
    },
    [setSelectedPsIdsSafe, variableById],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (page !== 'edit') return;
    const handler = (e) => {
      if (e.defaultPrevented) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) return;
      const id = activeHotspotId != null ? String(activeHotspotId) : '';
      if (!id) return;
      if (ignoredVariableIdSet.has(id)) return;
      handleDeleteVariableById(id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeHotspotId, handleDeleteVariableById, ignoredVariableIdSet, page]);

  const ensureAllSelectedHaveGuidePick = useCallback(() => {
    const missing = [];
    for (const psId of selectedPsIdsRef.current.values()) {
      const v = variableByPsId.get(psId);
      const nameText = String(v?.label || v?.name || `psId=${psId}`);
      const pick = normalizeGuidePick(manualGuidePicksRef.current.get(psId));
      if (!pick) missing.push(nameText);
    }
    return missing;
  }, [variableByPsId]);

  const buildGuidePicksPayload = useCallback(() => {
    const obj = {};
    for (const psId of selectedPsIdsRef.current.values()) {
      const pick = normalizeGuidePick(manualGuidePicksRef.current.get(psId));
      if (!pick) continue;
      obj[String(psId)] = pick;
    }
    return obj;
  }, []);

  const handleSave = useCallback(async () => {
    const safeName = String(name || '').trim();
    if (!safeName) return alert('请输入任务模版名称');
    const tId = String(templateId || '').trim();
    if (!tId) return alert('请先在上一步上传 PSD');
    if (selectedPsIdsRef.current.size === 0) return alert('请至少选择 1 个图片变量');
    const missing = ensureAllSelectedHaveGuidePick();
    if (missing.length > 0) {
      const shown = missing.slice(0, 6).join('、');
      return alert(`以下变量未完成参考线绑定：${shown}${missing.length > 6 ? '...' : ''}`);
    }
    const payload = {
      name: safeName,
      items: [
        {
          templateId: tId,
          selectedPsIds: Array.from(selectedPsIdsRef.current.values()),
          guidePicks: buildGuidePicksPayload(),
          exportFormats: normalizeExportFormats(exportFormats, ['jpeg', 'psd']),
        },
      ],
    };
    try {
      setSaving(true);
      const url = activeTaskTemplateId ? `/api/task-templates/${activeTaskTemplateId}` : '/api/task-templates';
      const method = activeTaskTemplateId ? 'PUT' : 'POST';
      const { res: resp } = await apiClient.fetchWithFallback(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 401) onRequireAuth?.();
        throw new Error(data?.message || data?.error || '保存失败');
      }
      const saved = data?.template || data;
      await refreshTaskTemplates();
      const savedId = Math.trunc(Number(saved?.id));
      if (Number.isFinite(savedId) && savedId > 0) {
        setActiveTaskTemplateId(savedId);
        setCreating(false);
      } else {
        resetEditingState();
      }
      alert('保存成功');
    } catch (e) {
      alert(buildUserErrorText(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  }, [
    activeTaskTemplateId,
    buildGuidePicksPayload,
    ensureAllSelectedHaveGuidePick,
    name,
    onRequireAuth,
    refreshTaskTemplates,
    resetEditingState,
    templateId,
    exportFormats,
    apiClient,
    buildUserErrorText,
  ]);

  const uploadSinglePsd = useCallback(
    async (file) => {
      if (!file) return;
      if (!String(file.name || '').toLowerCase().endsWith('.psd')) {
        alert('请上传 PSD 文件');
        return;
      }
      if (uploading) return;

      try {
        setUploading(true);
        setUploadHint('正在解析 PSD...');
        let localParsed = null;
        try {
          localParsed = await parsePsdClientSide(file);
          if (localParsed) {
            setTplData({
              raw: { width: localParsed.width, height: localParsed.height },
              width: localParsed.width,
              height: localParsed.height,
              imageUrl: localParsed.canvasUrl,
              variables: localParsed.variables,
              guides: localParsed.guides,
              guideLayers: localParsed.guideLayers,
            });
            setStableVariables(Array.isArray(localParsed.variables) ? localParsed.variables : []);
            setCreating(true);
            setActiveTaskTemplateId(null);
            setName(file.name.replace(/\.psd$/i, ''));
            setExportFormats(defaultExportFormatsFromPsdName(file.name));
            setVariableQuery('');
            setPage('edit');
            setActiveHotspotId(null);
            setSelectedPsIdsSafe(new Set());
            setManualGuidePicksSafe(new Map());
            setGuidePickMode(false);
            setUploadHint('正在上传 PSD...');
          }
        } catch (clientErr) {
          console.warn('Client parse failed:', clientErr);
          setUploadHint('本地解析失败，尝试服务端上传...');
        }

        const formData = new FormData();
        formData.append('psd', file);
        const { res: resp } = await apiClient.fetchWithFallback('/api/template/ingest', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if (resp.status === 401) onRequireAuth?.();
          throw new Error(data?.message || data?.error || '上传失败');
        }

        const templateId = String(data.id);
        setTemplateId(templateId);
        if (localParsed) {
          setTplData((prev) => {
            if (!prev) return prev;
            const raw = prev?.raw && typeof prev.raw === 'object' ? prev.raw : {};
            return { ...prev, raw: { ...raw, id: templateId } };
          });
        }
        setUploadHint('上传完成');
        if (!localParsed) {
           await loadPsdTemplate(templateId);
           setCreating(true);
           setActiveTaskTemplateId(null);
           setName(file.name.replace(/\.psd$/i, ''));
           setVariableQuery('');
           setPage('edit');
        }
        
        setTimeout(() => setUploadHint(''), 1500);
      } catch (err) {
        console.error(err);
        alert(buildUserErrorText(err, '上传失败'));
      } finally {
        setUploading(false);
      }
    },
    [apiClient, buildUserErrorText, loadPsdTemplate, onRequireAuth, setManualGuidePicksSafe, setSelectedPsIdsSafe, uploading],
  );

  const uploadNewPsd = useCallback(
    async (file) => {
      if (!file) return;
      resetEditingState();
      scrollToConfigRef.current = true;
      setPage('edit');
      await uploadSinglePsd(file);
    },
    [resetEditingState, uploadSinglePsd],
  );

  const handleNewUploadChange = useCallback(
    async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      await uploadNewPsd(file);
    },
    [uploadNewPsd],
  );

  const handlePsdDragEnter = useCallback((e) => {
    if (uploading) return;
    e.preventDefault();
    e.stopPropagation();
    psdDragDepthRef.current += 1;
    setPsdDropActive(true);
  }, [uploading]);

  const handlePsdDragOver = useCallback((e) => {
    if (uploading) return;
    e.preventDefault();
    e.stopPropagation();
    setPsdDropActive(true);
  }, [uploading]);

  const handlePsdDragLeave = useCallback((e) => {
    if (uploading) return;
    e.preventDefault();
    e.stopPropagation();
    psdDragDepthRef.current = Math.max(0, psdDragDepthRef.current - 1);
    if (psdDragDepthRef.current === 0) setPsdDropActive(false);
  }, [uploading]);

  const handleNewPsdDrop = useCallback(
    async (e) => {
      if (uploading) return;
      e.preventDefault();
      e.stopPropagation();
      psdDragDepthRef.current = 0;
      setPsdDropActive(false);
      const files = Array.from(e.dataTransfer?.files || []);
      const psdList = files.filter((f) => f && /\.psd$/i.test(String(f.name || '')));
      if (psdList.length === 0) return alert('请拖入 PSD 文件');
      await uploadNewPsd(psdList[0]);
    },
    [uploadNewPsd, uploading],
  );

  const activePickText = useMemo(() => {
    if (!Number.isFinite(activeVariablePsId)) return '未选择变量';
    const v = variableByPsId.get(activeVariablePsId);
    const nameText = String(v?.label || v?.name || '');
    const pick = normalizeGuidePick(manualGuidePicksRef.current.get(activeVariablePsId));
    if (!pick) return `${nameText ? `${nameText}：` : ''}未绑定`;
    return `${nameText ? `${nameText}：` : ''}左 ${pick.leftX}px，右 ${pick.rightX}px`;
  }, [activeVariablePsId, variableByPsId]);

  const canBind = useMemo(() => {
    if (!tplData) return false;
    if (!showGuides) return false;
    if (!activeVariable) return false;
    if (!Number.isFinite(activeVariablePsId)) return false;
    if (!selectedPsIds.has(activeVariablePsId)) return false;
    return true;
  }, [activeVariable, activeVariablePsId, selectedPsIds, showGuides, tplData]);

  const handleClearActivePick = useCallback(() => {
    const psId = activeVariablePsId;
    if (!Number.isFinite(psId)) return;
    setManualGuidePicksSafe((prev) => {
      const next = new Map(prev);
      next.delete(psId);
      return next;
    });
  }, [activeVariablePsId, setManualGuidePicksSafe]);

  const selectedStats = useMemo(() => {
    let boundCount = 0;
    for (const psId of selectedPsIds.values()) {
      if (normalizeGuidePick(manualGuidePicks.get(psId))) boundCount += 1;
    }
    return { selected: selectedPsIds.size, bound: boundCount };
  }, [manualGuidePicks, selectedPsIds]);

  const filteredTaskTemplates = useMemo(() => {
    const q = String(templateQuery || '').trim().toLowerCase();
    if (!q) return Array.isArray(taskTemplates) ? taskTemplates : [];
    return (Array.isArray(taskTemplates) ? taskTemplates : []).filter((t) => {
      const n = String(t?.name || '').toLowerCase();
      const id = String(t?.id ?? '');
      return n.includes(q) || id.includes(q);
    });
  }, [taskTemplates, templateQuery]);

  const filteredImageVariables = useMemo(() => {
    const q = String(variableQuery || '').trim().toLowerCase();
    if (!q) return activeImageVariables;
    return activeImageVariables.filter((v) => {
      const label = String(v?.label || v?.name || '').toLowerCase();
      const psId = String(v?.psId ?? '').toLowerCase();
      return label.includes(q) || psId.includes(q);
    });
  }, [activeImageVariables, variableQuery]);

  const filteredRemovedImageVariables = useMemo(() => {
    const q = String(variableQuery || '').trim().toLowerCase();
    if (!q) return removedImageVariables;
    return removedImageVariables.filter((v) => {
      const label = String(v?.label || v?.name || '').toLowerCase();
      const psId = String(v?.psId ?? '').toLowerCase();
      return label.includes(q) || psId.includes(q);
    });
  }, [removedImageVariables, variableQuery]);

  const currentPsdLabel = useMemo(() => {
    const id = String(templateId || '').trim();
    if (!id) return '';
    const shortId = id.length >= 6 ? id.slice(0, 6) : id;
    return `源文件（${shortId}）`;
  }, [templateId]);

  if (page !== 'edit') {
    return (
      <div className="w-full max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-100 tracking-tight">任务模板</div>
            <div className="mt-2 text-xs text-gray-500">
              第一步上传 PSD 或选择已有任务模板；第二步进入配置页绑定参考线并保存。
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
            >
              <Download className="w-4 h-4" />
              导出
            </button>
            <label
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              导入
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportAll}
              />
            </label>
            <button
              type="button"
              onClick={refreshTaskTemplates}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新列表
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 items-start">
          <div className="col-span-12 lg:col-span-4">
            <div
              className={[
                'relative overflow-hidden rounded-[2rem] border shadow-2xl transition-colors',
                'bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/70',
                psdDropActive ? 'border-emerald-400/35 ring-2 ring-emerald-400/15' : 'border-white/10',
              ].join(' ')}
              onDragEnter={handlePsdDragEnter}
              onDragOver={handlePsdDragOver}
              onDragLeave={handlePsdDragLeave}
              onDrop={handleNewPsdDrop}
            >
              {psdDropActive ? (
                <div className="absolute inset-4 rounded-[1.5rem] border border-emerald-400/25 bg-black/45 backdrop-blur-sm flex items-center justify-center pointer-events-none z-10">
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-100 text-xs">
                    松开即可上传 PSD
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => newUploadRef.current?.click?.()}
                disabled={uploading}
                className={[
                  'w-full px-8 py-10 text-left transition-colors',
                  uploading ? 'cursor-not-allowed opacity-80' : 'hover:bg-white/[0.02]',
                ].join(' ')}
              >
                <div className="flex items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-sky-300" />
                  </div>
                </div>
                <div className="mt-6 text-center text-xl font-semibold text-slate-50">
                  {uploading ? '正在上传并解析...' : '上传 PSD 模版'}
                </div>
                <div className="mt-3 text-center text-sm text-slate-400">
                  {uploading ? '请稍候，解析完成后将自动进入配置页面' : '点击或拖入文件，自动解析图层与变量'}
                </div>

                <div className="mt-8 h-px w-full bg-white/5" />

                <div className="mt-6 flex flex-col gap-3">
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                    后端自动解析图层结构
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.15)]" />
                    支持配置模版商品位并批量导出
                  </div>
                </div>

                {uploadHint ? <div className="mt-6 text-center text-[11px] text-emerald-200/90">{uploadHint}</div> : null}
              </button>
              <input ref={newUploadRef} type="file" accept=".psd" className="hidden" onChange={handleNewUploadChange} />

              {templateId || activeTaskTemplateId ? (
                <div className="px-8 pb-6">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-300 truncate">
                      {activeTaskTemplateId ? `上次编辑：#${activeTaskTemplateId}` : '上次编辑：未保存'}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 truncate">
                      {templateId ? `PSD：${currentPsdLabel || String(templateId)}` : 'PSD：未上传'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage('edit')}
                    className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
                  >
                    继续配置
                  </button>
                </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-8 bg-gray-800/50 border border-white/10 rounded-2xl p-5 shadow-lg min-h-0 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-200">已保存任务模板</div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {loadingList ? '正在刷新列表...' : `共 ${taskTemplates.length} 个`}
                </div>
              </div>
              <button
                type="button"
                onClick={refreshTaskTemplates}
                className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>

            <div className="mt-4 relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={templateQuery}
                onChange={(e) => setTemplateQuery(e.target.value)}
                placeholder="搜索任务模板"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-emerald-500/40"
              />
            </div>

            <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
              {filteredTaskTemplates.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-xs text-gray-400">
                  <div>{taskTemplates.length === 0 ? '还没有任务模板。' : '未找到匹配的任务模板。'}</div>
                  <div className="mt-2 text-[11px] text-gray-500">
                    提示：你可以先上传 PSD 新建，或点击任意模板进入配置页进行修改。
                  </div>
                </div>
              ) : (
                filteredTaskTemplates.map((t) => {
                  const tid = Number(t?.id);
                  const isActive = tid === Number(activeTaskTemplateId);
                  return (
                    <div
                      key={String(t?.id)}
                      role="button"
                      tabIndex={0}
                      onClick={() => loadTaskTemplateDetail(tid)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') loadTaskTemplateDetail(tid);
                      }}
                      className={[
                        'w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer select-none',
                        isActive ? 'bg-white/10 border-white/20' : 'bg-black/20 border-white/10 hover:bg-white/5',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-100 truncate">{String(t?.name || '')}</div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            {Number(t?.psdCount) > 0 ? `${Number(t?.psdCount)} 个 PSD` : '未绑定 PSD'}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-200 bg-emerald-500/10 border border-emerald-400/20 px-2 py-1 rounded-full">
                              <Check className="w-3 h-3" />
                              编辑中
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteTaskTemplate(tid);
                            }}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-red-200 hover:bg-red-500/10 hover:border-red-400/20 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={() => setPage('list')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </button>
        <div className="text-[11px] text-gray-500">
          选择变量后进入“绑定参考线”，在绿色框内依次点两条竖线（左→右）。
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 items-start">
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 min-h-0">
        <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-200 truncate">配置区</div>
              <div className="mt-1 text-[11px] text-gray-500">
                {creating
                  ? '新建任务模板：请先在上一步上传 PSD，并选择图片变量'
                  : activeTaskTemplateId
                    ? `编辑中：#${activeTaskTemplateId}`
                    : '请选择一个任务模板或新建'}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2" ref={configRef}>
            <div className="text-xs text-gray-400">当前 PSD</div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-200 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-300" />
                  {templateId ? '已加载' : '未上传'}
                </div>
                <div className="mt-1 text-[11px] text-gray-500 truncate">
                  {templateId ? currentPsdLabel || String(templateId) : '请在上一步上传 PSD（配置页不再重复上传）'}
                </div>
              </div>
              {uploading ? <div className="mt-2 text-[11px] text-emerald-200/90">正在上传并解析...</div> : null}
              {uploadHint ? <div className="mt-2 text-[11px] text-emerald-200/90">{uploadHint}</div> : null}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-gray-300">参考线与绑定</div>
              <div className="text-[11px] text-gray-500">
                已选 {selectedStats.selected} / 已绑 {selectedStats.bound}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGuides((v) => !v)}
                className={[
                  'px-3 py-2 rounded-xl border text-xs transition-colors',
                  showGuides
                    ? 'bg-amber-500/15 border-amber-400/25 text-amber-100 hover:bg-amber-500/20'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10',
                ].join(' ')}
              >
                {showGuides ? '参考线：开' : '参考线：关'}
              </button>
              <div className="relative group flex-1">
                <button
                  type="button"
                  disabled={!canBind}
                  onClick={() => setGuidePickMode((v) => !v)}
                  className={[
                    'w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors',
                    !canBind
                      ? 'bg-white/5 border-white/10 text-gray-500 opacity-60 cursor-not-allowed'
                      : guidePickMode
                        ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25'
                        : 'bg-indigo-500/25 border-indigo-400/40 text-indigo-100 hover:bg-indigo-500/30 hover:border-indigo-300/45',
                  ].join(' ')}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  {guidePickMode ? '退出绑定' : '绑定参考线'}
                </button>
                <div
                  className={[
                    'absolute left-0 top-full mt-2 w-[280px] rounded-xl border px-3 py-2 text-[11px] leading-relaxed z-50',
                    'bg-black/80 backdrop-blur-md border-white/10 text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
                    'opacity-0 translate-y-1 pointer-events-none transition-all duration-150',
                    'group-hover:opacity-100 group-hover:translate-y-0',
                  ].join(' ')}
                >
                  <div className="font-medium text-emerald-100">绑定参考线用法</div>
                  <div className="mt-1 text-gray-200/90">
                    1）先点选一个图片变量（画布或右侧列表）
                    <br />
                    2）点击“绑定参考线”进入绑定模式
                    <br />
                    3）在绿色框内依次点两条竖向参考线（左→右）
                  </div>
                  {!showGuides ? <div className="mt-2 text-amber-200/90">提示：先打开“参考线显示”</div> : null}
                  {!activeVariable ? <div className="mt-2 text-amber-200/90">提示：需要先选中一个图片变量</div> : null}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">{activePickText}</div>
            <div className="mt-2">
              <button
                type="button"
                disabled={!Number.isFinite(activeVariablePsId)}
                onClick={handleClearActivePick}
                className={[
                  'w-full px-3 py-2 rounded-xl border text-xs transition-colors',
                  Number.isFinite(activeVariablePsId)
                    ? 'bg-rose-500/10 border-rose-400/20 text-rose-100 hover:bg-rose-500/15'
                    : 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed opacity-60',
                ].join(' ')}
              >
                清除当前变量绑定
              </button>
            </div>
          </div>
        </div>

      </div>

      <div className="col-span-12 lg:col-span-6 bg-gray-900/50 border border-white/10 rounded-2xl p-5 shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-200 truncate">参考线绑定画布</div>
            <div className="mt-1 text-[11px] text-gray-500 truncate">
              {templateId ? `当前 PSD：${currentPsdLabel || String(templateId)}` : '请先在上一步上传 PSD'}
            </div>
          </div>
        </div>

        {!tplData || !tplData.imageUrl ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-10 text-sm text-gray-400">
            请先在上一步上传 PSD，然后选择图片变量并绑定参考线。
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
            <div className="h-[660px]">
              <HudEditor
                width={tplData.width}
                height={tplData.height}
                referenceImage={tplData.imageUrl}
                showGuides={showGuides}
                guides={tplData.guides}
                guideLayers={tplData.guideLayers}
                guidePicker={guidePicker}
                hotspots={activeImageVariables}
                selectedId={activeHotspotId}
                highlightedIds={highlightedIds}
                onSelect={(id) => toggleVariableByHotspotId(id)}
                showSidePanel={false}
                readOnly={false}
              />
            </div>
          </div>
        )}
      </div>

      <div className="col-span-12 lg:col-span-3 bg-gray-800/50 border border-white/10 rounded-2xl p-5 shadow-lg min-h-0 flex flex-col">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-200">保存</div>
          <div className="mt-1 text-[11px] text-gray-500">
            {creating ? '新建任务模板' : activeTaskTemplateId ? `编辑中：#${activeTaskTemplateId}` : '请先从列表进入编辑'}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-1">模板名称</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：主图-多变量-对齐线"
            className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-emerald-500/40"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || tplLoading}
          className={[
            'mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors',
            saving || tplLoading
              ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed opacity-60'
              : 'bg-emerald-500/20 border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/25',
          ].join(' ')}
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : activeTaskTemplateId ? '保存修改' : '保存新模板'}
        </button>

        <div className="mt-4 flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/20 p-3 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-200">图片变量</div>
            <div className="text-[11px] text-gray-500">{selectedStats.selected} 个已选</div>
          </div>
          <div className="mt-2 relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={variableQuery}
              onChange={(e) => setVariableQuery(e.target.value)}
              placeholder="搜索变量名或 psId"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-gray-100 placeholder:text-gray-600 outline-none focus:border-emerald-500/40"
            />
          </div>
          <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
            {tplLoading ? (
              <div className="text-xs text-gray-500 py-2">正在加载变量...</div>
            ) : filteredImageVariables.length === 0 ? (
              <div className="text-xs text-gray-500 py-2">
                <div>{templateId ? '未找到匹配的图片变量' : '请先在上一步上传 PSD'}</div>
                {variableQuery ? (
                  <button
                    type="button"
                    onClick={() => setVariableQuery('')}
                    className="mt-2 inline-flex items-center justify-center px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-[11px] text-gray-200 hover:bg-white/10 transition-colors"
                  >
                    清空搜索
                  </button>
                ) : null}
              </div>
            ) : (
              filteredImageVariables.map((v) => {
                const id = v?.id != null ? String(v.id) : '';
                const psId = Math.trunc(Number(v?.psId));
                const label = String(v?.label || v?.name || '');
                const selected = Number.isFinite(psId) && selectedPsIds.has(psId);
                const bound = Number.isFinite(psId) && !!normalizeGuidePick(manualGuidePicks.get(psId));
                const active = id && String(activeHotspotId || '') === id;
                return (
                  <div
                    key={id || `${psId}-${label}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleVariableByHotspotId(id)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      toggleVariableByHotspotId(id);
                    }}
                    className={[
                      'w-full text-left px-3 py-2 rounded-xl border transition-colors cursor-pointer',
                      active ? 'bg-indigo-500/10 border-indigo-400/25' : 'bg-black/20 border-white/10 hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-100 truncate">
                          {label || `图片变量（psId=${Number.isFinite(psId) ? psId : '未知'}）`}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {Number.isFinite(psId) ? `psId：${psId}` : 'psId：未知'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end gap-1">
                        <span
                          className={[
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border',
                            selected
                              ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100'
                              : 'bg-white/5 border-white/10 text-gray-300',
                          ].join(' ')}
                        >
                          {selected ? '已选' : '未选'}
                        </span>
                        {selected ? (
                          <span
                            className={[
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border',
                              bound
                                ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100'
                                : 'bg-amber-500/10 border-amber-400/20 text-amber-100',
                            ].join(' ')}
                          >
                            {bound ? '已绑' : '待绑'}
                          </span>
                        ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={configSaving || configLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVariableById(id);
                          }}
                          title={templateId ? '从当前模版配置中移除该变量' : '先在本地移除，上传完成后自动写入配置'}
                          className={[
                            'shrink-0 p-1.5 rounded-lg border transition-colors',
                            configSaving || configLoading
                              ? 'bg-white/5 border-white/10 text-gray-600 cursor-not-allowed opacity-60'
                              : 'bg-rose-500/10 border-rose-400/20 text-rose-200 hover:bg-rose-500/15',
                          ].join(' ')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {removedImageVariables.length > 0 ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setShowRemovedVariables((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
              >
                <span>
                  已移除变量
                  <span className="ml-1 text-gray-500">({removedImageVariables.length})</span>
                </span>
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <ChevronDown className={['w-3 h-3 transition-transform', showRemovedVariables ? 'rotate-180' : ''].join(' ')} />
                  {showRemovedVariables ? '收起' : '展开'}
                </span>
              </button>
              {showRemovedVariables ? (
                <div className="mt-2 max-h-44 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                  {filteredRemovedImageVariables.map((v) => {
                    const id = v?.id != null ? String(v.id) : '';
                    const psId = Math.trunc(Number(v?.psId));
                    const label = String(v?.label || v?.name || '');
                    return (
                      <div
                        key={id || `${psId}-${label}`}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl border border-white/10 bg-black/20"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] text-gray-200 truncate">
                            {label || `图片变量（psId=${Number.isFinite(psId) ? psId : '未知'}）`}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">{Number.isFinite(psId) ? `psId：${psId}` : 'psId：未知'}</div>
                        </div>
                        <button
                          type="button"
                          disabled={configSaving || configLoading}
                          onClick={() => handleRestoreVariableById(id)}
                          className={[
                            'shrink-0 px-2 py-1 rounded-lg border text-[11px] transition-colors',
                            configSaving || configLoading
                              ? 'bg-white/5 border-white/10 text-gray-600 cursor-not-allowed opacity-60'
                              : 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100 hover:bg-emerald-500/15',
                          ].join(' ')}
                        >
                          恢复
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}
