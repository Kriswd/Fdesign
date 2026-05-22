import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layout, Layers, Zap, FolderPlus, Upload, Images, Wand2, X, Ruler, Activity } from 'lucide-react';
import * as agPsd from 'ag-psd';
import DataConsole from '../../components/DataConsole';
import { useDataStore, buildSlotUpdates, computeVariableValueByRules } from '../../store/dataStore';
import HudEditor from '../../components/HudEditor';
import PSDParser from '../../utils/psdParser';
import { extractTemplateFromPsd, buildVariablesFromCandidates, filterVariablesByLayerRules } from '../../utils/templateExtractor';
import { createApiClient } from '../../utils/apiClient';
import { findDuplicateImageGuideMismatches } from '../../utils/imageGuideMismatch';
import { buildProductImageCatalog, matchCatalogImageByAngleSource, parseColor, parseModel } from '../../utils/productImageMatch';
import { extractPsdGuides } from '../../utils/psdClientParser';

const toSafeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const normalizeGuidePick = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const leftX = toSafeNumber(raw.leftX);
  const rightX = toSafeNumber(raw.rightX);
  if (!Number.isFinite(leftX) || !Number.isFinite(rightX)) return null;
  if (rightX <= leftX) return null;
  return { leftX: Math.round(leftX), rightX: Math.round(rightX) };
};

const pickSourceName = (item) => {
  const direct = [item?.sourceName, item?.originalName, item?.storedName];
  for (let i = 0; i < direct.length; i += 1) {
    const s = typeof direct[i] === 'string' ? direct[i].trim() : '';
    if (s) return s;
  }
  const pathLike = typeof item?.imagePath === 'string' && item.imagePath.trim()
    ? item.imagePath.trim()
    : typeof item?.publicUrl === 'string' && item.publicUrl.trim()
      ? item.publicUrl.trim()
      : '';
  if (!pathLike) return '';
  const normalized = pathLike.replace(/\\/g, '/');
  const withoutQuery = normalized.split('?')[0].split('#')[0];
  return (withoutQuery.split('/').pop() || '').trim();
};

export default function PsdAutoFillTab({ renderServerBaseUrl }) {
  const { 
    activeHeaders, rows, primaryKey,
    slots, setSlots, slotRecordMapping, setSlotRecordMapping,
    setFieldDefinitions,
    ignoredVariableIds, setIgnoredVariableIds,
    setIgnoredFieldKeys,
  } = useDataStore();
  
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [templateId, setTemplateId] = useState(null);
  const [templateWidth, setTemplateWidth] = useState(790);
  const [templateHeight, setTemplateHeight] = useState(1300);
  const [templateVariables, setTemplateVariables] = useState([]);
  const [templateWarnings, setTemplateWarnings] = useState([]);
  const [selectedVariableId, setSelectedVariableId] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [attentionHotspotIds, setAttentionHotspotIds] = useState([]);
  const [showGuides, setShowGuides] = useState(false);
  const [manualGuidePicks, setManualGuidePicks] = useState(() => new Map());
  const [templateGuides, setTemplateGuides] = useState(null);
  const [templateGuideLayers, setTemplateGuideLayers] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [lastFillReport, setLastFillReport] = useState(null);
  const [productImages, setProductImages] = useState([]);
  const [productUploading, setProductUploading] = useState(false);
  const [productDropActive, setProductDropActive] = useState(false);
  const [lastMatchReport, setLastMatchReport] = useState(null);
  const [showFillDiagnostics, setShowFillDiagnostics] = useState(false);

  const exportNodeRef = useRef(null);
  const backgroundObjectUrlRef = useRef(null);
  const psdParserRef = useRef(null);
  const autoIgnoredGhostIdsRef = useRef([]);
  const attentionTimerRef = useRef(null);
  const MotionDiv = motion.div;
  const apiClient = useMemo(() => createApiClient(renderServerBaseUrl), [renderServerBaseUrl]);
  const lastFillReportRef = useRef(null);
  const lastMatchReportRef = useRef(null);
  const autoFillSigRef = useRef('');
  const autoMatchSigRef = useRef('');
  const latestProductBatchIdRef = useRef(`${Date.now()}`);
  const fillDiagPersistKey = 'psdAutoFill.showFillDiagnostics';
  const resolveAssetUrl = useCallback((raw) => apiClient.resolveAssetUrl(raw, renderServerBaseUrl), [apiClient, renderServerBaseUrl]);
  const hasVariableDataBinding = useCallback((slotVar) => {
    if (!slotVar || typeof slotVar !== 'object') return false;
    if (slotVar.excelFieldKey) return true;
    if (slotVar.computedRule) return true;
    if (Array.isArray(slotVar.computedRules) && slotVar.computedRules.length > 0) return true;
    return false;
  }, []);

  const slotStats = useMemo(() => {
    const list = Array.isArray(slots) ? slots : [];
    const mapping = slotRecordMapping && typeof slotRecordMapping === 'object' ? slotRecordMapping : {};
    const boundSlotCount = Object.keys(mapping).filter((k) => {
      const v = mapping[k];
      const n = Number(v);
      return Number.isInteger(n) && n >= 0;
    }).length;
    const varCount = list.reduce((acc, s) => acc + (Array.isArray(s?.variables) ? s.variables.length : 0), 0);
    const mappedVarCount = list.reduce((acc, s) => {
      const vars = Array.isArray(s?.variables) ? s.variables : [];
      return acc + vars.filter((v) => hasVariableDataBinding(v)).length;
    }, 0);
    const ruleCount = list.reduce((acc, s) => {
      const vars = Array.isArray(s?.variables) ? s.variables : [];
      return acc + vars.reduce((a2, v) => a2 + (v?.computedRule ? 1 : 0) + (Array.isArray(v?.computedRules) ? v.computedRules.length : 0), 0);
    }, 0);
    return {
      slotCount: list.length,
      boundSlotCount,
      varCount,
      mappedVarCount,
      ruleCount,
    };
  }, [hasVariableDataBinding, slotRecordMapping, slots]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(fillDiagPersistKey);
      if (raw == null) return;
      setShowFillDiagnostics(raw === '1');
    } catch (e) {
      void e;
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(fillDiagPersistKey, showFillDiagnostics ? '1' : '0');
    } catch (e) {
      void e;
    }
  }, [showFillDiagnostics]);

  const scaleGuides = (guides, scaleX, scaleY) => {
    if (!guides || typeof guides !== 'object') return guides;
    const v = Array.isArray(guides.vertical) ? guides.vertical : [];
    const h = Array.isArray(guides.horizontal) ? guides.horizontal : [];
    const nextV = v
      .map((n) => Math.round(Number(n) * scaleX))
      .filter((n) => Number.isFinite(n));
    const nextH = h
      .map((n) => Math.round(Number(n) * scaleY))
      .filter((n) => Number.isFinite(n));
    const uniq = (arr) => Array.from(new Set(arr)).sort((a, b) => a - b);
    return { ...guides, vertical: uniq(nextV), horizontal: uniq(nextH) };
  };

  const scaleGuideLayers = (guideLayers, scaleX) => {
    if (!guideLayers || typeof guideLayers !== 'object') return guideLayers;
    const all = Array.isArray(guideLayers.all) ? guideLayers.all : [];
    const nextAll = all.map((g) => {
      const x = Number.isFinite(Number(g?.x)) ? Math.round(Number(g.x) * scaleX) : g?.x;
      return { ...g, x };
    });
    const leftX = Number.isFinite(Number(guideLayers.leftX)) ? Math.round(Number(guideLayers.leftX) * scaleX) : guideLayers.leftX;
    const rightX = Number.isFinite(Number(guideLayers.rightX)) ? Math.round(Number(guideLayers.rightX) * scaleX) : guideLayers.rightX;
    return { ...guideLayers, all: nextAll, leftX, rightX };
  };

  const scaleGuidePick = (raw, scaleX) => {
    const pick = normalizeGuidePick(raw);
    if (!pick) return null;
    if (scaleX === 1) return pick;
    const leftX = Math.round(pick.leftX * scaleX);
    const rightX = Math.round(pick.rightX * scaleX);
    if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) return null;
    return { leftX, rightX };
  };

  const guidePickObjectToMap = (obj, scaleX) => {
    const map = new Map();
    if (!obj || typeof obj !== 'object') return map;
    Object.keys(obj).forEach((key) => {
      const psId = Math.trunc(Number(key));
      if (!Number.isFinite(psId)) return;
      const pick = scaleGuidePick(obj[key], scaleX);
      if (!pick) return;
      map.set(psId, pick);
    });
    return map;
  };

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

  // 计算当前选中商品位下的高亮变量
  const highlightedVariableIds = useMemo(() => {
    if (!selectedSlotId || !Array.isArray(slots) || slots.length === 0) return [];
    const slot = slots.find((s) => s.id === selectedSlotId);
    if (!slot || !Array.isArray(slot.variables)) return [];
    return slot.variables.map((v) => v.id).filter(Boolean);
  }, [selectedSlotId, slots]);

  const hasGuideSource = useMemo(() => {
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
  }, [templateGuides, templateGuideLayers]);
  const rowOptions = useMemo(() => {
    const maxOptions = 2000;
    const total = rows.length;
    const list = rows.slice(0, maxOptions).map((row, rIdx) => ({
      value: rIdx,
      label: (() => {
        const pk = primaryKey ? String(primaryKey) : '';
        const pkVal = pk && row && row[pk] !== undefined && row[pk] !== null ? String(row[pk]) : '';
        if (pkVal) return pkVal;
        const firstKey = activeHeaders && activeHeaders[0] ? String(activeHeaders[0]) : '';
        const firstVal = firstKey && row && row[firstKey] !== undefined && row[firstKey] !== null ? String(row[firstKey]) : '';
        if (firstVal) return firstVal;
        return `第 ${rIdx + 1} 行`;
      })(),
    }));
    return { list, total, capped: total > maxOptions, maxOptions };
  }, [activeHeaders, primaryKey, rows]);

  useEffect(() => {
    return () => {
      if (backgroundObjectUrlRef.current && String(backgroundObjectUrlRef.current).startsWith('blob:')) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (attentionTimerRef.current) {
        clearTimeout(attentionTimerRef.current);
        attentionTimerRef.current = null;
      }
    };
  }, []);

  const flashAttention = useCallback((ids) => {
    const list = Array.isArray(ids)
      ? ids.map((v) => String(v || '')).filter((v) => v)
      : [];
    if (attentionTimerRef.current) {
      clearTimeout(attentionTimerRef.current);
      attentionTimerRef.current = null;
    }
    setAttentionHotspotIds(list);
    attentionTimerRef.current = setTimeout(() => {
      setAttentionHotspotIds([]);
      attentionTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    if (templateId) return;
    setManualGuidePicks(new Map());
    setShowGuides(false);
    setTemplateGuides(null);
    setTemplateGuideLayers(null);
  }, [templateId]);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${renderServerBaseUrl}/api/templates`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('获取模板列表失败:', error);
    }
  }, [renderServerBaseUrl]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (templateId) {
      fetch(`${renderServerBaseUrl}/api/template/${templateId}/config`)
        .then(res => {
          if (res.ok) return res.json();
          return { slots: [], fieldDefinitions: [] };
        })
        .then(data => {
          setSlots(data.slots || []);
          setFieldDefinitions(data.fieldDefinitions || []);
          const configIgnored = Array.isArray(data.ignoredVariableIds) ? data.ignoredVariableIds : [];
          const ghostIgnored = Array.isArray(autoIgnoredGhostIdsRef.current) ? autoIgnoredGhostIdsRef.current : [];
          const prevIgnored = useDataStore.getState().ignoredVariableIds || [];
          const merged = Array.from(
            new Set(
              [...configIgnored, ...prevIgnored, ...ghostIgnored]
                .map((v) => (v == null ? '' : String(v)))
                .filter((v) => v),
            ),
          );
          setIgnoredVariableIds(merged);
          setIgnoredFieldKeys(Array.isArray(data.ignoredFieldKeys) ? data.ignoredFieldKeys : []);
        })
        .catch(err => {
          console.error("加载商品位配置失败", err);
          setSlots([]);
          setFieldDefinitions([]);
          setIgnoredVariableIds([]);
          setIgnoredFieldKeys([]);
        });
    }
  }, [templateId, renderServerBaseUrl, setFieldDefinitions, setIgnoredFieldKeys, setIgnoredVariableIds, setSlots]);

  useEffect(() => {
    const ids = Array.isArray(ignoredVariableIds) ? ignoredVariableIds : [];
    if (ids.length === 0) return;
    const ignoredSet = new Set(ids.map((id) => (id == null ? '' : String(id))).filter(Boolean));
    if (ignoredSet.size === 0) return;
    setTemplateVariables((prev) =>
      (prev || []).map((v) => {
        const id = v && v.id != null ? String(v.id) : '';
        if (!id) return v;
        if (!ignoredSet.has(id)) return v;
        if (v.hidden === true) return v;
        return { ...v, hidden: true };
      }),
    );
  }, [ignoredVariableIds]);

  useEffect(() => {
    const warnings = [];
    const missingText = (templateVariables || []).filter((v) => {
      const type = String(v?.varType || '').toLowerCase();
      if (type !== 'text') return false;
      return v?.psId === null || v?.psId === undefined || v?.psId === '';
    });
    if (missingText.length > 0) {
      const names = missingText
        .slice(0, 6)
        .map((v) => v?.name || v?.key || v?.id || '未命名')
        .join('、');
      warnings.push(`存在 ${missingText.length} 个文本变量缺少 psId，导出将被阻止（示例：${names}）`);
    }
    setTemplateWarnings(warnings);
  }, [templateVariables]);

  const handleLoadTemplate = async (id) => {
    try {
      const response = await fetch(`${renderServerBaseUrl}/api/template/${id}`);
      if (!response.ok) return;

      const data = await response.json();
      const hasAnyNativeGuides = (g) => {
        if (!g || typeof g !== 'object') return false;
        const v = Array.isArray(g.vertical) ? g.vertical : [];
        const h = Array.isArray(g.horizontal) ? g.horizontal : [];
        return v.length > 0 || h.length > 0;
      };
      const frontendConfig = data.frontendConfig || {};
      const savedVariablesSource = Array.isArray(frontendConfig.variables) && frontendConfig.variables.length > 0
        ? frontendConfig.variables
        : Array.isArray(data.variables)
          ? data.variables
          : [];
      const hasSavedVariables = savedVariablesSource.length > 0;

      const baseWidth = frontendConfig.width || data.width || 0;
      const baseHeight = frontendConfig.height || data.height || 0;

      let canvasWidth = baseWidth || 790;
      let canvasHeight = baseHeight || 1300;
      let scaleX = 1;
      let scaleY = 1;

      let bgUrl = null;
      let rawGuides = data.guides || null;
      const rawGuideLayers = data.guideLayers || null;
      const rawGuidePicks = frontendConfig.guidePicks || null;

      if (data.imageUrl) {
        bgUrl = `${renderServerBaseUrl}${data.imageUrl}?t=${Date.now()}`;
        try {
          const size = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const w = img.naturalWidth || img.width || 0;
              const h = img.naturalHeight || img.height || 0;
              resolve({ width: w, height: h });
            };
            img.onerror = (e) => reject(e);
            img.src = bgUrl;
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

      let nextVariables = [];

      try {
        const psdUrl = `${renderServerBaseUrl}/templates/${id}/source.psd`;
        const psdResp = await fetch(psdUrl);
        if (psdResp.ok) {
          const blob = await psdResp.blob();
          if (!hasAnyNativeGuides(rawGuides)) {
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const psd = agPsd.readPsd(arrayBuffer, {
                skipThumbnail: true,
                skipCompositeImageData: true,
                skipLayerImageData: true,
                useImageData: false,
                useCanvas: false,
                logMissingFeatures: false,
              });
              const g = extractPsdGuides(psd, Number(psd?.width) || 0, Number(psd?.height) || 0);
              const gv = Array.isArray(g?.vertical) ? g.vertical : [];
              const gh = Array.isArray(g?.horizontal) ? g.horizontal : [];
              if (gv.length > 0 || gh.length > 0) rawGuides = g;
            } catch (e) {
              console.warn('读取 PSD 参考线失败', e);
            }
          }
          const fileName = data.name || 'template.psd';
          const file = new File([blob], fileName, { type: 'image/vnd.adobe.photoshop' });
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
              if (!v || v.id === null || v.id === undefined) return acc;
              acc[String(v.id)] = v;
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
                bgUrl = nextUrl;
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
          }
        }
      } catch (e) {
        console.error(e);
      }

      if (nextVariables.length === 0 && hasSavedVariables) {
        const mergedVars = savedVariablesSource.map((v) => ({
          ...v,
          value: v.value ?? v.defaultValue ?? '',
          hidden: v.hidden !== undefined ? v.hidden : false,
        }));
        nextVariables = mergedVars;
      }

      let finalVars = nextVariables;
      let finalGuides = rawGuides;
      let finalGuideLayers = rawGuideLayers;
      let finalGuidePicks = rawGuidePicks;

      if (nextVariables.length > 0 && (scaleX !== 1 || scaleY !== 1)) {
        finalVars = nextVariables.map((v) => ({
          ...v,
          x: typeof v.x === 'number' ? v.x * scaleX : v.x,
          y: typeof v.y === 'number' ? v.y * scaleY : v.y,
          width: typeof v.width === 'number' ? v.width * scaleX : v.width,
          height: typeof v.height === 'number' ? v.height * scaleY : v.height,
        }));
        finalGuides = scaleGuides(rawGuides, scaleX, scaleY);
        finalGuideLayers = scaleGuideLayers(rawGuideLayers, scaleX);
        finalGuidePicks = rawGuidePicks && typeof rawGuidePicks === 'object'
          ? Object.fromEntries(
            Object.entries(rawGuidePicks).map(([k, v]) => [k, scaleGuidePick(v, scaleX)]).filter(([, v]) => v),
          )
          : rawGuidePicks;
      }

      setTemplateWidth(canvasWidth || baseWidth || 790);
      setTemplateHeight(canvasHeight || baseHeight || 1300);
      finalVars = filterVariablesByLayerRules(finalVars, { keepGhost: true });
      const ghostIds = (finalVars || [])
        .filter((v) => !!v?.isGhost)
        .map((v) => (v?.id == null ? '' : String(v.id)))
        .filter((v) => v);
      autoIgnoredGhostIdsRef.current = ghostIds;
      if (ghostIds.length > 0) {
        const prevIgnored = useDataStore.getState().ignoredVariableIds || [];
        const merged = Array.from(
          new Set(
            [...prevIgnored, ...ghostIds]
              .map((v) => (v == null ? '' : String(v)))
              .filter((v) => v),
          ),
        );
        setIgnoredVariableIds(merged);
      }
      setTemplateVariables(finalVars);
      setTemplateGuides(finalGuides);
      setTemplateGuideLayers(finalGuideLayers);
      setManualGuidePicks(guidePickObjectToMap(finalGuidePicks, 1));
      setShowGuides(false);

      setTemplateWarnings([]);
      setSelectedVariableId(finalVars?.[0]?.id || null);
      setTemplateId(data.id || null);

      if (bgUrl) {
        if (backgroundObjectUrlRef.current && String(backgroundObjectUrlRef.current).startsWith('blob:')) {
          URL.revokeObjectURL(backgroundObjectUrlRef.current);
        }
        backgroundObjectUrlRef.current = String(bgUrl).startsWith('blob:') ? bgUrl : null;
        setBackgroundImage(bgUrl);
      } else {
        if (backgroundObjectUrlRef.current && String(backgroundObjectUrlRef.current).startsWith('blob:')) {
          URL.revokeObjectURL(backgroundObjectUrlRef.current);
        }
        backgroundObjectUrlRef.current = null;
        setBackgroundImage(null);
      }
    } catch (error) {
      console.error(`加载模板 ${id} 失败:`, error);
    }
  };

  const handleCanvasReady = useCallback((payload) => {
    if (payload?.exportNode) exportNodeRef.current = payload.exportNode;
  }, []);

  const handleHotspotValueChange = useCallback((hotspotId, nextValue) => {
    if (!hotspotId) return;
    setTemplateVariables((prev) =>
      (prev || []).map((v) => {
        if (v?.id !== hotspotId) return v;
        const type = String(v?.varType || '').toLowerCase();
        const isImg = type === 'img' || type === 'image';
        const isText = type === 'text';
        if (nextValue === null || nextValue === undefined) {
          return {
            ...v,
            value: undefined,
            ...(isImg ? { manualImageValue: false } : {}),
            ...(isText ? { manualTextValue: false } : {}),
          };
        }
        return {
          ...v,
          value: nextValue,
          ...(isImg ? { manualImageValue: true } : {}),
          ...(isText ? { manualTextValue: true } : {}),
        };
      }),
    );
  }, []);

  const computeRowIndex = useCallback((row) => {
    if (!row) return -1;
    const allRows = useDataStore.getState().rows || [];
    let index = allRows.indexOf(row);
    if (index !== -1) return index;
    const key = useDataStore.getState().primaryKey;
    if (!key) return -1;
    const targetValue = row[key];
    if (targetValue === null || targetValue === undefined) return -1;
    const normalized = String(targetValue).trim();
    if (!normalized) return -1;
    index = allRows.findIndex((r) => String(r?.[key] ?? '').trim() === normalized);
    return index;
  }, []);

  const buildNextSlotMapping = useCallback((slotId, recordIndex, baseMapping) => {
    const key = slotId != null ? String(slotId) : '';
    const next = { ...(baseMapping || {}) };
    if (!key) return next;
    if (recordIndex === null || recordIndex === undefined || Number.isNaN(recordIndex)) {
      delete next[key];
    } else {
      next[key] = Number(recordIndex);
    }
    return next;
  }, []);

  const applySlotMappingToVariables = useCallback((mapping, options = {}) => {
    const slotIds = Array.isArray(options.slotIds) ? options.slotIds : null;
    const slotIdSet = slotIds ? new Set(slotIds.map((id) => String(id))) : null;
    const forceImageOverwrite = options && options.forceImageOverwrite === true;
    const currentSlots = useDataStore.getState().slots || [];
    const dataRows = useDataStore.getState().rows || [];
    const map = mapping || {};
    setTemplateVariables((prev) => {
      const report = {
        at: Date.now(),
        slotIds: slotIds ? [...slotIds] : null,
        slots: currentSlots.length,
        rows: dataRows.length,
        mappedSlots: 0,
        visitedVars: 0,
        matchedVars: 0,
        updatedVars: 0,
        skippedLocalImage: 0,
        emptyValue: 0,
        notFoundVarIndex: 0,
      };
      let next = [...prev];
      const idToIndex = {};
      const psIdToIndex = {};
      for (let i = 0; i < next.length; i += 1) {
        const id = next[i] && next[i].id != null ? String(next[i].id) : '';
        if (!id) continue;
        if (idToIndex[id] === undefined) idToIndex[id] = i;
        const psIdKey = next[i] && next[i].psId != null ? String(next[i].psId) : '';
        if (psIdKey && psIdToIndex[psIdKey] === undefined) psIdToIndex[psIdKey] = i;
      }
      currentSlots.forEach((slot) => {
        if (!slot || !slot.id) return;
        const slotKey = String(slot.id);
        if (slotIdSet && !slotIdSet.has(slotKey)) return;
        const recordIndexRaw = map[slotKey];
        if (recordIndexRaw === null || recordIndexRaw === undefined) return;
        report.mappedSlots += 1;
        const recordIndex = Number(recordIndexRaw);
        if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= dataRows.length) return;
        const row = dataRows[recordIndex];
        if (!row || typeof row !== 'object') return;
        const rowKeyMap = new Map();
        Object.keys(row).forEach((k) => {
          if (k === null || k === undefined) return;
          const s = String(k);
          const trimmed = s.trim();
          if (!trimmed) return;
          if (!rowKeyMap.has(trimmed)) rowKeyMap.set(trimmed, s);
        });
        const variables = Array.isArray(slot.variables) ? slot.variables : [];
        variables.forEach((slotVar) => {
          report.visitedVars += 1;
          const varId = slotVar && slotVar.id != null ? String(slotVar.id) : '';
          const psId = slotVar && slotVar.psId != null ? Number(slotVar.psId) : NaN;
          const psIdKey = Number.isFinite(psId) ? String(psId) : '';
          const varIndex =
            (varId && idToIndex[varId] !== undefined ? idToIndex[varId] : undefined) ??
            (psIdKey && psIdToIndex[psIdKey] !== undefined ? psIdToIndex[psIdKey] : undefined);
          if (varIndex === undefined) {
            report.notFoundVarIndex += 1;
            return;
          }
          report.matchedVars += 1;
          const rawAlign = slotVar && slotVar.align != null ? String(slotVar.align) : '';
          const nextAlign = rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right' ? rawAlign : null;
          const computed = computeVariableValueByRules({ slotVar, row, allRows: dataRows });
          const isManualImage = next[varIndex]?.manualImageValue === true;
          const isManualText = String(next[varIndex]?.varType || '').toLowerCase() === 'text' && next[varIndex]?.manualTextValue === true;
          if (isManualText) {
            report.skippedLocalText = (report.skippedLocalText || 0) + 1;
            return;
          }
          if (isManualImage && !forceImageOverwrite) {
            report.skippedLocalImage += 1;
            return;
          }
          if (computed !== null && computed !== undefined && computed !== '') {
            const newValue = String(computed);
            next[varIndex] = { ...next[varIndex], value: newValue, align: nextAlign, filledBySlotId: slotKey, manualImageValue: false };
            report.updatedVars += 1;
            return;
          }
          const fieldKeyRaw = slotVar ? slotVar.excelFieldKey : null;
          const labelKeyRaw = slotVar ? (slotVar.label || slotVar.name) : null;
          const fieldKey = fieldKeyRaw != null && String(fieldKeyRaw).trim() ? String(fieldKeyRaw).trim() : '';
          const labelKey = labelKeyRaw != null && String(labelKeyRaw).trim() ? String(labelKeyRaw).trim() : '';
          const psIdFieldKey = slotVar && slotVar.psId != null ? String(slotVar.psId).trim() : '';
          const idFieldKey = slotVar && slotVar.id != null ? String(slotVar.id).trim() : '';
          const candidateKeys = [fieldKey, labelKey, psIdFieldKey, idFieldKey].filter(Boolean);
          if (candidateKeys.length === 0) return;

          let raw = null;
          for (let i = 0; i < candidateKeys.length; i += 1) {
            const key = candidateKeys[i];
            const actualKey = Object.prototype.hasOwnProperty.call(row, key) ? key : rowKeyMap.get(key);
            if (!actualKey) continue;
            const v = row[actualKey];
            if (v === null || v === undefined) continue;
            if (typeof v === 'string' && v.trim() === '') continue;
            if (v === '') continue;
            raw = v;
            break;
          }
          if (raw === null || raw === undefined) {
            report.emptyValue += 1;
            return;
          }

          const varType = String(next[varIndex]?.varType || slotVar?.type || slotVar?.varType || '').toLowerCase();
          const isImg = varType === 'img' || varType === 'image';
          if (isImg) {
            if (typeof raw !== 'string') return;
            const s = String(raw);
            if (!s.startsWith('data:') && !/^https?:\/\//i.test(s) && !s.startsWith('/')) return;
            const normalizedValue = resolveAssetUrl(s);
            next[varIndex] = { ...next[varIndex], value: normalizedValue, align: nextAlign, filledBySlotId: slotKey, manualImageValue: false };
            report.updatedVars += 1;
            return;
          }

          const after = String(raw);
          next[varIndex] = { ...next[varIndex], value: after, align: nextAlign, filledBySlotId: slotKey };
          report.updatedVars += 1;
        });
      });

      lastMatchReportRef.current = null;
      const shouldAutoMatch = Array.isArray(productImages) && productImages.length > 0;
      if (shouldAutoMatch) {
        const catalog = buildProductImageCatalog(productImages);
        if (catalog.list.length > 0) {
          const matchReport = {
            at: Date.now(),
            totalTargets: 0,
            matched: 0,
            missing: 0,
            conflicts: 0,
            skippedLocal: 0,
            skippedUnmapped: 0,
            unmappedTargets: 0,
            missingAngle: 0,
            missingRowKey: 0,
            reasonCounts: {},
            missingAngleSamples: [],
            missingRowSamples: [],
            matchedSamples: [],
          };

          const readTrimmed = (row, key) => {
            if (!row || typeof row !== 'object') return null;
            const target = key != null ? String(key).trim() : '';
            if (!target) return null;
            if (Object.prototype.hasOwnProperty.call(row, target)) return row[target];
            const keys = Object.keys(row);
            for (let i = 0; i < keys.length; i += 1) {
              const k = keys[i];
              if (k == null) continue;
              if (String(k).trim() === target) return row[k];
            }
            return null;
          };

          currentSlots.forEach((slot) => {
            if (!slot || !slot.id) return;
            const slotKey = String(slot.id);
            if (slotIdSet && !slotIdSet.has(slotKey)) return;
            const recordIndexRaw = map[slotKey];
            const recordIndex = Number(recordIndexRaw);
            if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= dataRows.length) return;
            const row = dataRows[recordIndex];
            const modelRaw = readTrimmed(row, '款号');
            const colorRaw = readTrimmed(row, '色号');
            const model = parseModel(modelRaw) || parseModel(`${String(modelRaw ?? '')} ${String(colorRaw ?? '')}`);
            const color = parseColor(colorRaw, model) || parseColor(modelRaw, model);
            if (!model || !color) {
              matchReport.missingRowKey += 1;
              if (matchReport.missingRowSamples.length < 8) {
                matchReport.missingRowSamples.push({
                  slotId: slotKey,
                  modelRaw: modelRaw == null ? '' : String(modelRaw),
                  colorRaw: colorRaw == null ? '' : String(colorRaw),
                });
              }
              return;
            }
            const variables = Array.isArray(slot.variables) ? slot.variables : [];
            variables.forEach((slotVar) => {
              const type = String(slotVar?.type || slotVar?.varType || '').toLowerCase();
              const isImg = type === 'img' || type === 'image';
              if (!isImg) return;
              matchReport.totalTargets += 1;

              const angleSource = [
                slotVar?.label,
                slotVar?.name,
                slotVar?.excelFieldKey,
                slotVar?.id,
                slotVar?.key,
              ]
                .filter((v) => v !== null && v !== undefined && String(v).trim())
                .map((v) => String(v).trim())
                .join(' ');
              const matchResult = matchCatalogImageByAngleSource({ model, color, angleSource, catalog });
              const angle = matchResult.angle;
              if (!angle) {
                matchReport.missingAngle += 1;
                if (matchReport.missingAngleSamples.length < 12) {
                  matchReport.missingAngleSamples.push({
                    slotId: slotKey,
                    source: angleSource || '',
                  });
                }
              }

              const varId = slotVar && slotVar.id != null ? String(slotVar.id) : '';
              const psId = slotVar && slotVar.psId != null ? Number(slotVar.psId) : NaN;
              const psIdKey = Number.isFinite(psId) ? String(psId) : '';
              const varIndex =
                (varId && idToIndex[varId] !== undefined ? idToIndex[varId] : undefined) ??
                (psIdKey && psIdToIndex[psIdKey] !== undefined ? psIdToIndex[psIdKey] : undefined);
              if (varIndex === undefined) return;

              const isManualImage = next[varIndex]?.manualImageValue === true;
              if (isManualImage && !forceImageOverwrite) {
                matchReport.skippedLocal += 1;
                return;
              }

              if (!matchResult.ok || !matchResult.match) {
                const reason = matchResult?.reason ? String(matchResult.reason) : 'unknown';
                matchReport.reasonCounts[reason] = (matchReport.reasonCounts[reason] || 0) + 1;
                if (reason === 'conflict') matchReport.conflicts += 1;
                else matchReport.missing += 1;
                return;
              }

              const match = matchResult.match;
              const publicUrl = typeof match.publicUrl === 'string' && match.publicUrl.trim() ? match.publicUrl.trim() : null;
              const imagePath = typeof match.imagePath === 'string' && match.imagePath.trim() ? match.imagePath.trim() : null;
              if (!publicUrl && !imagePath) {
                matchReport.missing += 1;
                return;
              }

              const resolvedPublicUrl = publicUrl ? resolveAssetUrl(publicUrl) : null;
              next[varIndex] = {
                ...next[varIndex],
                value: resolvedPublicUrl || next[varIndex]?.value,
                imagePath: imagePath || next[varIndex]?.imagePath,
                sourceName: pickSourceName(match) || next[varIndex]?.sourceName,
                originalName:
                  (typeof match?.originalName === 'string' && match.originalName.trim())
                    ? match.originalName.trim()
                    : next[varIndex]?.originalName,
                storedName:
                  (typeof match?.storedName === 'string' && match.storedName.trim())
                    ? match.storedName.trim()
                    : next[varIndex]?.storedName,
                filledBySlotId: slotKey,
                manualImageValue: false,
              };
              if (matchReport.matchedSamples.length < 12) {
                matchReport.matchedSamples.push({
                  slotId: slotKey,
                  angle,
                  source: angleSource,
                  model,
                  color,
                  file: match?.originalName || match?.storedName || '',
                });
              }
              matchReport.matched += 1;
            });
          });

          lastMatchReportRef.current = matchReport;
          console.info('[info][autofill-match] completed', {
            totalTargets: matchReport.totalTargets,
            matched: matchReport.matched,
            missing: matchReport.missing,
            conflicts: matchReport.conflicts,
            skippedLocal: matchReport.skippedLocal,
            skippedUnmapped: matchReport.skippedUnmapped,
            unmappedTargets: matchReport.unmappedTargets,
            missingAngle: matchReport.missingAngle,
            missingRowKey: matchReport.missingRowKey,
            reasonCounts: matchReport.reasonCounts,
          });
          if (matchReport.missingAngle > 0) {
            console.warn('[warn][autofill-match] missing angle keywords on slot image variables', {
              samples: matchReport.missingAngleSamples,
            });
          }
          if (matchReport.missingRowKey > 0) {
            console.warn('[warn][autofill-match] missing model/color from excel row', {
              samples: matchReport.missingRowSamples,
            });
          }
          if (matchReport.matched === 0) {
            console.warn('[warn][autofill-match] no image matched, inspect diagnostics', {
              reasonCounts: matchReport.reasonCounts,
              missingAngleSamples: matchReport.missingAngleSamples,
              missingRowSamples: matchReport.missingRowSamples,
              catalogPreview: catalog.list.slice(0, 12).map((it) => ({
                model: it?.model || null,
                color: it?.color || null,
                angle: it?.angle || null,
                originalName: it?.originalName || null,
              })),
            });
          }
        }
      }
      lastFillReportRef.current = report;
      return next;
    });
    requestAnimationFrame(() => setLastFillReport(lastFillReportRef.current));
    requestAnimationFrame(() => setLastMatchReport(lastMatchReportRef.current));
  }, [productImages, resolveAssetUrl]);

  const updateSlotRecordMappingAndApply = useCallback(
    (nextMapping, options) => {
      setSlotRecordMapping(nextMapping);
      applySlotMappingToVariables(nextMapping, options);
    },
    [applySlotMappingToVariables, setSlotRecordMapping],
  );

  const bindRowToSlot = useCallback((slotId, row, rowIndex) => {
    if (!slotId || !row) return false;
    const resolvedIndex = Number.isInteger(rowIndex) ? rowIndex : computeRowIndex(row);
    if (resolvedIndex < 0) return false;
    const currentMapping = useDataStore.getState().slotRecordMapping || {};
    const nextMapping = buildNextSlotMapping(slotId, resolvedIndex, currentMapping);
    updateSlotRecordMappingAndApply(nextMapping, { slotIds: [slotId] });
    return true;
  }, [buildNextSlotMapping, computeRowIndex, updateSlotRecordMappingAndApply]);

  useEffect(() => {
    setSlotRecordMapping({});
    setSelectedSlotId(null);
    setLastFillReport(null);
    setProductImages([]);
    setLastMatchReport(null);
    latestProductBatchIdRef.current = `${Date.now()}`;
    autoFillSigRef.current = '';
    autoMatchSigRef.current = '';
  }, [templateId, setSlotRecordMapping]);

  useEffect(() => {
    if (!templateId) {
      autoMatchSigRef.current = '';
      return;
    }
    if (!Array.isArray(productImages) || productImages.length === 0) return;
    const mapping = slotRecordMapping && typeof slotRecordMapping === 'object' ? slotRecordMapping : {};
    const mapped = Object.keys(mapping).length;
    if (mapped === 0) return;
    const sig = `${String(templateId)}|${productImages.length}|${mapped}`;
    if (autoMatchSigRef.current === sig) return;
    autoMatchSigRef.current = sig;
    applySlotMappingToVariables(mapping, { forceImageOverwrite: true });
  }, [applySlotMappingToVariables, productImages, slotRecordMapping, templateId]);

  const handleRowSelected = useCallback((row) => {
    useDataStore.getState().setCurrentRow(row);
  }, []);

  const onProductDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setProductDropActive(true);
  }, []);

  const onProductDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setProductDropActive(true);
  }, []);

  const onProductDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setProductDropActive(false);
  }, []);

  const uploadProductImages = useCallback(async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (list.length === 0) return;
    if (productUploading) return;
    setProductUploading(true);
    try {
      const form = new FormData();
      form.append('batchId', latestProductBatchIdRef.current);
      for (const f of list) form.append('images', f, f.name);
      const { res } = await apiClient.fetchWithFallback('/api/assets/upload-images', { method: 'POST', body: form });
      const data = await apiClient.readJsonSafely(res);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      const names = list.map((f) => String(f?.name || ''));
      setProductImages((prev) => {
        const next = [...(Array.isArray(prev) ? prev : [])];
        const imgs = Array.isArray(data.images) ? data.images : [];
        imgs.forEach((img, idx) => {
          const originalName = names[idx] || img?.originalName || img?.storedName || '';
          next.push({
            imagePath: img?.imagePath,
            publicUrl: img?.publicUrl,
            storedName: img?.storedName,
            clientId: img?.clientId,
            originalName,
          });
        });
        return next;
      });
    } catch (e) {
      alert(`上传产品图失败：${e?.message || String(e)}`);
    } finally {
      setProductUploading(false);
    }
  }, [apiClient, productUploading]);

  const clearAllProductImages = useCallback(() => {
    if (productUploading) return;
    if (!Array.isArray(productImages) || productImages.length === 0) return;
    const ok = window.confirm(`确认清空已上传的 ${productImages.length} 张产品图吗？`);
    if (!ok) return;
    setProductImages([]);
    setLastMatchReport(null);
    lastMatchReportRef.current = null;
    autoMatchSigRef.current = '';
    latestProductBatchIdRef.current = `${Date.now()}`;
  }, [productImages, productUploading]);

  const onProductDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setProductDropActive(false);
    const dt = e.dataTransfer;
    if (!dt || !dt.files) return;
    uploadProductImages(dt.files);
  }, [uploadProductImages]);

  const autoMatchProductImagesToSlots = useCallback(() => {
    const storeState = useDataStore.getState();
    const slotList = Array.isArray(storeState.slots) ? storeState.slots : [];
    const mapping = storeState.slotRecordMapping && typeof storeState.slotRecordMapping === 'object' ? storeState.slotRecordMapping : {};
    const dataRows = Array.isArray(storeState.rows) ? storeState.rows : [];
    const catalog = buildProductImageCatalog(productImages);

    if (catalog.list.length === 0) {
      alert('产品图库为空或无法识别款号/色号，请先上传命名规范的产品图');
      return;
    }
    if (slotList.length === 0) {
      alert('当前模版未配置商品位，无法自动匹配');
      return;
    }
    if (dataRows.length === 0) {
      alert('请先上传并加载 Excel 数据');
      return;
    }

    applySlotMappingToVariables(mapping, {});
    setTimeout(() => {
      const report = lastMatchReportRef.current;
      if (!report) return;
      const suffix = report.conflicts > 0 || report.missing > 0 ? '（存在缺失/冲突，请查看报告）' : '';
      alert(`自动匹配完成：成功 ${report.matched} / 目标 ${report.totalTargets}，缺失 ${report.missing}，冲突 ${report.conflicts}，跳过手动 ${report.skippedLocal}${suffix}`);
    }, 60);
  }, [applySlotMappingToVariables, productImages]);

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const blobToDataUrl = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(blob);
    });
  };

  const resolveImageValueToDataUrl = useCallback(async (value) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return { ok: false, value: null, reason: '图片值为空' };
    if (raw.startsWith('data:')) return { ok: true, value: raw, reason: null };
    if (/^https?:\/\//i.test(raw)) return { ok: true, value: raw, reason: null };
    const isUrl =
      /^https?:\/\//i.test(raw) ||
      raw.startsWith('/') ||
      raw.startsWith('blob:');
    if (!isUrl) return { ok: false, value: null, reason: '图片值不是可访问地址' };
    try {
      const base = typeof renderServerBaseUrl === 'string' ? renderServerBaseUrl.trim() : '';
      const target = raw.startsWith('/') && base ? `${base}${raw}` : raw;
      const resp = await fetch(target);
      if (!resp.ok) return { ok: false, value: null, reason: `图片加载失败（HTTP ${resp.status}）` };
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);
      return { ok: true, value: dataUrl, reason: null };
    } catch (e) {
      return { ok: false, value: null, reason: e?.message || '图片加载失败' };
    }
  }, [renderServerBaseUrl]);

  const buildPhotoshopUpdatesPayload = useCallback(async () => {
    const storeState = useDataStore.getState();
    const slotUpdates = buildSlotUpdates({
      slots: storeState.slots,
      slotRecordMapping: storeState.slotRecordMapping,
      rows: storeState.rows,
    });

    const byPsId = new Map();
    (slotUpdates || []).forEach((u) => {
      if (!u || u.psId === null || u.psId === undefined) return;
      const type = String(u?.varType || '').toLowerCase();
      const guidePick = type === 'img' ? normalizeGuidePick(manualGuidePicks.get(Number(u.psId))) : null;
      const existing = byPsId.get(Number(u.psId));
      byPsId.set(Number(u.psId), { ...(existing || {}), ...u, guidePick: guidePick || existing?.guidePick });
    });

    const missingText = [];
    for (const v of templateVariables || []) {
      const currentVal = v.value ?? '';
      const defaultVal = v.defaultValue ?? '';
      const currentStr = String(currentVal);
      const defaultStr = String(defaultVal);
      const isModified = currentStr !== defaultStr;
      const type = String(v?.varType || '').toLowerCase();
      const isManualText = type === 'text' && v?.manualTextValue === true;
      const isManualImage = (type === 'img' || type === 'image') && v?.manualImageValue === true;

      if (!isModified && !isManualText && !isManualImage) continue;
      if (type === 'text' && (v.psId === null || v.psId === undefined || v.psId === '')) {
        missingText.push({ id: v.id, name: v.name || v.key || v.id || '未命名' });
        continue;
      }
      if (v.psId === null || v.psId === undefined || v.psId === '') continue;

      const psIdKey = Number(v.psId);
      const existing = byPsId.get(psIdKey);
      const guidePick = type === 'img' ? normalizeGuidePick(manualGuidePicks.get(psIdKey)) : null;
      byPsId.set(psIdKey, {
        ...(existing || {}),
        psId: v.psId,
        varType: v.varType,
        value: currentVal,
        ...(type === 'img'
          ? {
              imagePath:
                typeof v?.imagePath === 'string' && v.imagePath.trim()
                  ? v.imagePath.trim()
                  : existing?.imagePath,
              sourceName: pickSourceName(v) || existing?.sourceName,
              originalName:
                typeof v?.originalName === 'string' && v.originalName.trim()
                  ? v.originalName.trim()
                  : existing?.originalName,
              storedName:
                typeof v?.storedName === 'string' && v.storedName.trim()
                  ? v.storedName.trim()
                  : existing?.storedName,
            }
          : {}),
        ...(type === 'text'
          ? {
              align:
                v.align === 'center' || v.align === 'right' || v.align === 'left'
                  ? v.align
                  : existing?.align || 'left',
            }
          : {}),
        name: v.name,
        id: v.id,
        guidePick: guidePick || existing?.guidePick,
      });
    }

    const updates = Array.from(byPsId.values());

    const failedImages = [];
    const normalized = [];
    for (const u of updates || []) {
      if (!u || u.psId === null || u.psId === undefined) continue;
      const type = String(u.varType || '').toLowerCase();
      if (type !== 'img') {
        normalized.push({
          ...u,
          value: u.value != null ? String(u.value) : '',
        });
        continue;
      }
      if (u.imagePath) {
        normalized.push(u);
        continue;
      }
      const result = await resolveImageValueToDataUrl(u.value);
      if (!result.ok) {
        failedImages.push({
          psId: u.psId,
          name: u.name || u.id || '',
          reason: result.reason || '图片加载失败',
        });
        continue;
      }
      normalized.push({ ...u, value: result.value });
    }

    return { updates: normalized, failedImages, missingText };
  }, [manualGuidePicks, resolveImageValueToDataUrl, templateVariables]);

  const handleExportByPhotoshop = async () => {
    if (!templateId) {
      alert('请先选择模板');
      return;
    }

    setExporting(true);

    try {
      const tplName = templates.find(t => t.id === templateId)?.name || 'export';
      const baseName = `${tplName}_${new Date().toISOString().slice(0, 10)}`;

      const { updates, failedImages, missingText } = await buildPhotoshopUpdatesPayload();
      if (failedImages.length > 0) {
        const msg = failedImages
          .map((item) => `${item.name || item.psId}:${item.reason}`)
          .join('；');
        throw new Error(`部分图片无法导出：${msg}`);
      }
      if (missingText.length > 0) {
        const msg = missingText
          .slice(0, 6)
          .map((item) => item?.name || item?.id || '未命名')
          .join('、');
        throw new Error(`存在缺少 psId 的文本变量，无法导出：${msg}`);
      }
      const textCount = (updates || []).filter((u) => String(u?.varType || '').toLowerCase() === 'text').length;
      const imgCount = (updates || []).filter((u) => String(u?.varType || '').toLowerCase() === 'img').length;
      if (!updates || updates.length === 0) {
        throw new Error('没有检测到任何需要回写的变量，请先确认已绑定 Excel 字段并选中记录');
      }
      const invalidImgs = (updates || []).filter((u) => {
        if (!u) return false;
        if (String(u.varType || '').toLowerCase() !== 'img') return false;
        const hasImagePath = typeof u.imagePath === 'string' && u.imagePath.trim();
        const hasDataUrl = typeof u.value === 'string' && u.value.startsWith('data:');
        const hasRemoteUrl = typeof u.value === 'string' && /^https?:\/\//i.test(u.value);
        return !hasImagePath && !hasDataUrl && !hasRemoteUrl;
      });
      if (invalidImgs.length > 0) {
        const msg = invalidImgs
          .slice(0, 6)
          .map((u) => `${u?.name || u?.psId || 'img'}:图片值无效`)
          .join('；');
        throw new Error(`存在无法回写的图片变量：${msg}`);
      }

      const mismatchCandidates = (updates || [])
        .filter((u) => u && String(u?.varType || '').toLowerCase() === 'img')
        .map((u) => {
          const imageKey = typeof u.imagePath === 'string' && u.imagePath.trim()
            ? `path:${u.imagePath.trim()}`
            : typeof u.value === 'string'
              ? u.value.trim()
              : String(u.value ?? '').trim();
          const gp = u?.guidePick && typeof u.guidePick === 'object' ? u.guidePick : null;
          const guideKey = gp && Number.isFinite(Number(gp.leftX)) && Number.isFinite(Number(gp.rightX))
            ? `${Math.round(Number(gp.leftX))},${Math.round(Number(gp.rightX))}`
            : 'none';
          return {
            imageKey,
            guideKey,
            psId: u.psId,
            id: u.id,
            name: u.name,
            slotId: u.slotId,
          };
        });
      const mismatches = findDuplicateImageGuideMismatches(mismatchCandidates);
      let allowDupImageGuideMismatch = false;
      if (mismatches.length > 0) {
        const slotNameById = new Map((slots || []).map((s, idx) => [String(s?.id || ''), String(s?.name || `商品位${idx + 1}`)]));
        const items = Array.isArray(mismatches[0]?.items) ? mismatches[0].items : [];
        const focusId = items[0]?.id ? String(items[0].id) : '';
        const attention = items.map((it) => String(it?.id || '')).filter((v) => v);
        if (focusId) setSelectedVariableId(focusId);
        flashAttention(attention);
        const lines = items.slice(0, 12).map((it) => {
          const sn = it?.slotId != null ? (slotNameById.get(String(it.slotId)) || String(it.slotId)) : '';
          const left = sn ? `${sn} ` : '';
          const nm = it?.name ? String(it.name) : it?.psId != null ? `psId=${it.psId}` : '未命名';
          return `${left}${nm}（参考线:${String(it?.guideKey || 'none')}）`;
        });
        const ok = confirm(
          `检测到同一张图片用于多个图片变量，但参考线绑定不一致：\n${lines.join('\n')}\n\n继续导出会在导出时为每个图层创建独立智能对象副本，可能增加耗时。\n\n是否仍要继续导出？`,
        );
        if (!ok) return;
        allowDupImageGuideMismatch = true;
      }
      console.log('[导出回写] 更新摘要', { 总数: updates.length, 文本: textCount, 图片: imgCount });

      const { res, meta } = await apiClient.fetchWithFallback('/api/template/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templateId,
          updates,
          variables: templateVariables,
          format: 'psd',
          quality: 100,
          isPsdAutoFill: true,
          allowDupImageGuideMismatch,
        }),
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json().catch(() => ({}));
          const rid = data?.requestId ? String(data.requestId) : '';
          const prefix = rid ? `[${rid}] ` : '';
          const humanDebug = data?.humanDebug && typeof data.humanDebug === 'object' ? data.humanDebug : null;
          const top = Array.isArray(humanDebug?.topImages) ? humanDebug.topImages[0] : null;
          const topInfo = top && (top.bytes || top.width || top.height)
            ? `（最大输入图: ${top.file || ''} ${top.width && top.height ? `${top.width}x${top.height}` : ''} ${top.bytes ? `${Math.round(Number(top.bytes) / 1024 / 1024)}MB` : ''}）`
            : '';
          if (String(data?.code || '') === 'DUP_IMAGE_GUIDE_MISMATCH' && data?.dupImageGuideMismatch) {
            const items = Array.isArray(data?.dupImageGuideMismatch?.items) ? data.dupImageGuideMismatch.items : [];
            const slotNameById = new Map((slots || []).map((s, idx) => [String(s?.id || ''), String(s?.name || `商品位${idx + 1}`)]));
            const byPsId = new Map((templateVariables || [])
              .map((v) => [Math.trunc(Number(v?.psId)), v?.id != null ? String(v.id) : null])
              .filter(([k, v]) => Number.isFinite(k) && v));
            const attention = items
              .map((it) => (it?.id != null ? String(it.id) : (byPsId.get(Math.trunc(Number(it?.psId))) || '')))
              .filter((v) => v);
            if (attention.length > 0) {
              setSelectedVariableId(attention[0]);
              flashAttention(attention);
            }
            const lines = items.slice(0, 12).map((it) => {
              const sn = it?.slotId != null ? (slotNameById.get(String(it.slotId)) || String(it.slotId)) : '';
              const left = sn ? `${sn} ` : '';
              const nm = it?.name ? String(it.name) : it?.psId != null ? `psId=${it.psId}` : '未命名';
              const gk = it?.guideKey != null ? String(it.guideKey) : 'none';
              return `${left}${nm}（参考线:${gk}）`;
            });
            throw new Error(prefix + (data?.message || data?.error || '导出失败') + `\n\n冲突变量：\n${lines.join('\n')}` + topInfo);
          }
          throw new Error(prefix + (data?.message || data?.error || `Photoshop 导出失败（HTTP ${res.status}）`) + topInfo);
        }
        const text = await res.text().catch(() => '');
        const snippet = String(text || '').trim().slice(0, 400);
        const suffix = snippet ? `：${snippet}` : '';
        throw new Error(`Photoshop 导出失败（HTTP ${res.status}）${suffix}`);
      }

      const data = await res.json();
      const warnings = Array.isArray(data?.warnings) ? data.warnings.map((w) => String(w)) : [];
      const preferredBase = meta?.url ? new URL(String(meta.url)).origin : '';
      const downloadUrl = apiClient.resolveDownloadUrl(data.url, preferredBase);
      const url = `${downloadUrl}?t=${Date.now()}`;
      const blob = await fetch(url).then((r) => r.blob());
      const rawUrl = data?.url != null ? String(data.url) : '';
      const ext = rawUrl.toLowerCase().endsWith('.psb') ? 'psb' : 'psd';
      const sanitizeFileName = (raw) => {
        const s0 = raw == null ? '' : String(raw);
        const s1 = s0
          .replace(/[\\/:*?"<>|]+/g, '-')
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/[. ]+$/g, '');
        return s1 || '导出文件';
      };
      const resolveExportFileName = () => {
        const safeBase = sanitizeFileName(`${baseName}_导出`);
        const tplRaw = tplName == null ? '' : String(tplName);
        if (!tplRaw.includes('详情')) return `${safeBase}.${ext}`;

        const slot0 = Array.isArray(slots) ? slots[0] : null;
        const slot0Key = slot0 && slot0.id != null ? String(slot0.id) : '';
        const map = slotRecordMapping && typeof slotRecordMapping === 'object' ? slotRecordMapping : {};
        const idx = slot0Key ? Number(map[slot0Key]) : NaN;
        const row = Number.isInteger(idx) && idx >= 0 && idx < (rows || []).length ? rows[idx] : null;
        const skuRaw =
          row && typeof row === 'object'
            ? row['款号'] ?? row['SKU'] ?? row['sku'] ?? row['SkU'] ?? row['SUK'] ?? ''
            : '';
        const sku = sanitizeFileName(skuRaw);
        const outBase = sanitizeFileName(`${sku || '未填写款号'}-产品详情-1000`);
        return `${outBase}.${ext}`;
      };
      downloadBlob(blob, resolveExportFileName());
      
      // 自动下载画板重命名日志（如果有）
      const jsxLog = data?.extendScriptLog;
      if (jsxLog && typeof jsxLog === 'string' && jsxLog.includes('artboard')) {
        const logBlob = new Blob([jsxLog], { type: 'text/plain;charset=utf-8' });
        downloadBlob(logBlob, `artboard_rename_log_${new Date().toISOString().slice(0, 10)}.txt`);
      }
      
      if (warnings.includes('psd_too_large_fallback_psb')) {
        alert('PSD 超过 2GB 上限，已自动导出为 PSB（大文档格式）。');
      }
      if (warnings.includes('psd_too_large_fallback_psb_am')) {
        alert('PSD 超过 2GB 上限，已通过兼容模式自动导出为 PSB（大文档格式）。');
      }
      if (warnings.includes('psd_too_large_fallback_flatten_psd')) {
        alert('PSD 超过 2GB 上限，当前 Photoshop 不支持 PSB，已改为导出“扁平化 PSD”（仅保留单图层）。');
      }
      if (warnings.includes('psb_action_manager_failed')) {
        alert('已尝试兼容模式导出 PSB 但失败，请优先升级 Photoshop 或改用 PNG/JPG。');
      }
    } catch (err) {
      console.error(err);
      alert(`Photoshop PSD 导出失败：${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  if (!templateId) {
    return (
      <MotionDiv
        className="w-full max-w-7xl mx-auto h-full flex flex-col pt-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
          <div className="flex items-center justify-between mb-8">
            <div>
               <h1 className="text-3xl font-bold text-white mb-2">选择模版</h1>
               <p className="text-gray-400">从下方选择一个已配置好的模版开始制作</p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={fetchTemplates}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
              >
                刷新列表
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-6 pb-10">
            {templates.map(tpl => (
              <motion.div
                key={tpl.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleLoadTemplate(tpl.id)}
                className="bg-gray-800 rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-900/20 transition-all group"
              >
                <div className="aspect-[3/4] bg-gray-900 relative">
                   {tpl.thumbnailUrl || tpl.previewUrl ? (
                     <img src={`${renderServerBaseUrl}${tpl.thumbnailUrl || tpl.previewUrl}`} alt={tpl.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                   ) : (
                     <div className="absolute inset-0 flex items-center justify-center text-gray-700">
                       <Layout className="w-16 h-16 opacity-20" />
                     </div>
                   )}
                   <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-60" />
                   <div className="absolute bottom-4 left-4 right-4">
                     <h3 className="text-lg font-bold text-white mb-1">{tpl.name}</h3>
                     <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{tpl.width}×{tpl.height}</span>
                       <span>•</span>
                       <span>{new Date(tpl.createdAt || Date.now()).toLocaleDateString()}</span>
                     </div>
                   </div>
                </div>
              </motion.div>
            ))}
            
            {templates.length === 0 && (
               <div className="col-span-4 flex flex-col items-center justify-center py-20 text-gray-500">
                 <FolderPlus className="w-16 h-16 mb-4 opacity-20" />
                 <p className="text-lg">暂无可用模版</p>
                 <p className="text-sm mt-2">请联系管理员在后台创建模版</p>
               </div>
            )}
          </div>
      </MotionDiv>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6 pb-24">
      {/* 左侧：画布预览 (占 9 列) */}
      <MotionDiv
        className="col-span-8 bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 min-h-[760px] h-[calc(100vh-160px)] flex flex-col shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Layout className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-semibold text-gray-200">画布预览</h2>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
              templateId 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-gray-700/50 text-gray-400 border-gray-600/50'
            }`}>
              {templateId ? '模版已选择' : '未选择模版'}
            </span>
            <span className="text-xs text-gray-300 truncate max-w-[260px]" title={templates.find(t => t.id === templateId)?.name || ''}>
              {templates.find(t => t.id === templateId)?.name || '未命名模版'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-nowrap justify-end">
            <button
              type="button"
              aria-label="切换参考线显示"
              disabled={!hasGuideSource}
              onClick={() => setShowGuides((v) => !v)}
              className={[
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors whitespace-nowrap',
                !hasGuideSource
                  ? 'bg-white/5 border-white/10 text-gray-500 opacity-60 cursor-not-allowed'
                  : showGuides
                    ? 'bg-amber-500/15 border-amber-400/25 text-amber-100 hover:bg-amber-500/20'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10',
              ].join(' ')}
              title={
                !hasGuideSource
                  ? '未检测到参考线，请检查 PSD 参考线或参考线图层'
                  : showGuides
                    ? '隐藏参考线'
                    : '显示参考线'
              }
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>参考线</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 border border-white/10">
                {showGuides ? '开' : '关'}
              </span>
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="切换回填诊断"
                onClick={() => setShowFillDiagnostics((v) => !v)}
                className={[
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors whitespace-nowrap',
                  showFillDiagnostics
                    ? 'bg-emerald-500/15 border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/20'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10',
                ].join(' ')}
                title={[
                  `商品位：${slotStats.slotCount}，已绑定：${slotStats.boundSlotCount}，变量：${slotStats.varCount}`,
                  `已映射：${slotStats.mappedVarCount}，规则数：${slotStats.ruleCount}`,
                  `最近写入：${lastFillReport ? lastFillReport.updatedVars : 0}`,
                  lastFillReport ? `时间：${new Date(lastFillReport.at).toLocaleTimeString()}` : '时间：暂无',
                ].join('\n')}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>诊断</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 border border-white/10">
                  {slotStats.boundSlotCount}/{slotStats.slotCount}
                </span>
              </button>
              {showFillDiagnostics ? (
                <div className="absolute right-0 top-full mt-2 z-50 w-[320px] max-w-[calc(100vw-24px)] rounded-2xl bg-black/55 border border-white/10 backdrop-blur-xl shadow-2xl">
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
                        <Activity className="w-4 h-4 text-emerald-200" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100">回填诊断</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {lastFillReport ? `更新时间：${new Date(lastFillReport.at).toLocaleTimeString()}` : '暂无回填记录'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFillDiagnostics(false)}
                      className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                      aria-label="关闭回填诊断"
                    >
                      <X className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                  <div className="p-3.5">
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-2.5 py-2">
                        <span className="text-slate-400">商品位</span>
                        <span className="text-slate-100 font-medium">{slotStats.slotCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-2.5 py-2">
                        <span className="text-slate-400">已绑定</span>
                        <span className="text-slate-100 font-medium">{slotStats.boundSlotCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-2.5 py-2">
                        <span className="text-slate-400">变量</span>
                        <span className="text-slate-100 font-medium">{slotStats.varCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-2.5 py-2">
                        <span className="text-slate-400">已映射</span>
                        <span className="text-slate-100 font-medium">{slotStats.mappedVarCount}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-300 rounded-xl bg-white/5 border border-white/10 px-2.5 py-2">
                      <span className="text-slate-400">最近写入</span>
                      <span className="text-slate-100 font-medium">{lastFillReport ? lastFillReport.updatedVars : 0}</span>
                    </div>
                    {slotStats.slotCount > 0 && slotStats.mappedVarCount === 0 ? (
                      <div className="mt-2 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-xl px-2.5 py-2">
                        未检测到字段映射/规则，管理端保存后才可回填预览
                      </div>
                    ) : null}
                    {lastFillReport && lastFillReport.mappedSlots > 0 && lastFillReport.updatedVars === 0 ? (
                      <div className="mt-2 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-xl px-2.5 py-2">
                        最近一次回填没有写入任何变量：常见原因是规则为空或字段名不匹配
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 whitespace-nowrap">{templateWidth}×{templateHeight}</span>
            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 whitespace-nowrap">{slots.length} 个商品位</span>
            <button
              type="button"
              onClick={() => setTemplateId(null)}
              className="px-2.5 py-1 rounded-md bg-gray-700 hover:bg-gray-600 border border-white/10 text-[11px] text-gray-200 transition-colors"
            >
              切换模版
            </button>
          </div>
        </div>

        {templateWarnings.length > 0 && (
          <div className="mb-4 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 flex-shrink-0">
            <div className="text-xs font-medium text-amber-400 mb-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              模板提醒
            </div>
            <div className="space-y-1">
              {templateWarnings.slice(0, 6).map((w, idx) => (
                <div key={idx} className="text-[10px] text-amber-200/70">
                  {w}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative bg-black/40 rounded-xl overflow-hidden border border-white/5 flex-1 shadow-inner">
          <HudEditor
            width={templateWidth}
            height={templateHeight}
            referenceImage={backgroundImage}
            showGuides={showGuides}
            guides={templateGuides}
            guideLayers={templateGuideLayers}
            guidePicker={null}
            hotspots={templateVariables.map((v) => ({
              ...v,
              type: v.varType === 'img' ? 'image' : v.varType,
              rect: { x: v.x, y: v.y, w: v.width, h: v.height },
            }))}
            selectedId={selectedVariableId}
            highlightedIds={highlightedVariableIds}
            onSelect={setSelectedVariableId}
            onHotspotValueChange={handleHotspotValueChange}
            sliceLines={[]}
            showSliceLines={false}
            maxInitialScale={0.45}
            attentionIds={attentionHotspotIds}
            onCanvasReady={handleCanvasReady}
          />
        </div>
      </MotionDiv>

      {/* 右侧：工具栏 (占 3 列) */}
      <div className="col-span-4 flex flex-col gap-3 min-h-[760px] h-[calc(100vh-160px)]">
        {/* 数据绑定 */}
        <MotionDiv
          className="bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 flex-1 min-h-0 flex flex-col shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-gray-200">数据绑定</h3>
            </div>
            {templateId ? (
              <button
                type="button"
                onClick={handleExportByPhotoshop}
                disabled={exporting}
                className={[
                  'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white rounded-xl transition-all shadow-lg',
                  exporting
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20',
                ].join(' ')}
              >
                <Zap className="w-4 h-4" />
                导出修改后的PSD
              </button>
            ) : null}
          </div>
          
          <div className="space-y-2.5 flex-1 flex flex-col min-h-0">
          <div
            className={[
              'p-2.5 bg-black/20 border rounded-xl flex-shrink-0 transition-all',
              productDropActive ? 'border-emerald-400/40 ring-2 ring-emerald-400/15 bg-emerald-500/5' : 'border-white/5',
            ].join(' ')}
            onDragEnter={onProductDragEnter}
            onDragOver={onProductDragOver}
            onDragLeave={onProductDragLeave}
            onDrop={onProductDrop}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-gray-200 flex items-center gap-2">
                <Images className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAllProductImages}
                  disabled={productUploading || productImages.length === 0}
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-colors whitespace-nowrap',
                    productUploading || productImages.length === 0
                      ? 'bg-white/5 text-gray-500 border-white/10 cursor-not-allowed'
                      : 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 border-rose-500/30',
                  ].join(' ')}
                  title="清空当前产品图库（不影响已上传Excel）"
                >
                  <X className="w-3.5 h-3.5" />
                  一键清空图片
                </button>
                <button
                  type="button"
                  onClick={autoMatchProductImagesToSlots}
                  disabled={productImages.length === 0 || slots.length === 0 || rows.length === 0}
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-colors whitespace-nowrap',
                    productImages.length === 0 || slots.length === 0 || rows.length === 0
                      ? 'bg-white/5 text-gray-500 border-white/10 cursor-not-allowed'
                      : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border-emerald-500/30',
                  ].join(' ')}
                  title={productImages.length === 0 ? '请先上传产品图' : slots.length === 0 ? '模版未配置商品位' : rows.length === 0 ? '请先上传 Excel' : '按款号/色号/角度自动匹配'}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  自动匹配图片
                </button>
                <label
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer transition-colors whitespace-nowrap',
                    productUploading ? 'bg-white/5 text-gray-500 border-white/10 cursor-not-allowed' : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border-indigo-500/30',
                  ].join(' ')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {productUploading ? '上传中…' : '上传产品图'}
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    disabled={productUploading}
                    onChange={(e) => uploadProductImages(e.target.files)}
                  />
                </label>
              </div>
            </div>
            <div className="mt-1.5 text-[10px] text-gray-400">
              命名示例：BJ3205 B10 正.jpg（支持：正 / 侧 / 45）
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-400">
              <div>已上传 <span className="text-gray-200">{productImages.length}</span> 张</div>
              {lastMatchReport ? (
                <div className="text-gray-500">
                  上次匹配：成功 {lastMatchReport.matched}，缺失 {lastMatchReport.missing}，冲突 {lastMatchReport.conflicts}
                </div>
              ) : null}
            </div>
            {lastMatchReport ? (
              <div className="mt-1 text-[10px] text-gray-500 space-y-1">
                <div>诊断：缺失角度 {lastMatchReport.missingAngle || 0}，缺失款色 {lastMatchReport.missingRowKey || 0}，跳过手动 {lastMatchReport.skippedLocal || 0}</div>
                {lastMatchReport.reasonCounts && Object.keys(lastMatchReport.reasonCounts).length > 0 ? (
                  <div className="truncate">未命中原因：{Object.entries(lastMatchReport.reasonCounts).map(([k, v]) => `${k}:${v}`).join('，')}</div>
                ) : null}
              </div>
            ) : null}
            {productImages.length > 0 ? (
              <div className="mt-1.5 max-h-52 overflow-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {productImages.slice(0, 50).map((img, idx) => (
                  <div key={`${img?.imagePath || img?.publicUrl || 'img'}_${idx}`} className="flex items-center justify-between gap-2 text-[11px] bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-gray-200">{String(img?.originalName || img?.storedName || '')}</div>
                      {img?.publicUrl ? <div className="truncate text-[10px] text-gray-500">{String(img.publicUrl)}</div> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setProductImages((prev) => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []))}
                      className="text-gray-400 hover:text-white"
                      title="移除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {productImages.length > 50 ? (
                  <div className="text-[11px] text-gray-500">仅展示前 50 条</div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-[10px] text-gray-500">可拖拽多张图片到此处上传</div>
            )}
          </div>
          {slots.length > 0 && (
            <div className="mb-2.5 p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 flex-shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex flex-col">
                  <h4 className="text-xs font-semibold text-indigo-200">商品位绑定</h4>
                  <span className="text-[10px] text-gray-300/90">点选商品位后在表格中点一条记录绑定</span>
                </div>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {slots.map((slot, idx) => {
                  const rawIndex = slotRecordMapping && slot ? slotRecordMapping[slot.id] : null;
                  const recordIndex = Number(rawIndex);
                  const isBound = Number.isInteger(recordIndex) && recordIndex >= 0 && recordIndex < rows.length;
                  const row = isBound ? rows[recordIndex] : null;
                  const pk = primaryKey ? String(primaryKey) : '';
                  const pkVal = pk && row && row[pk] !== undefined && row[pk] !== null ? String(row[pk]) : '';
                  const firstKey = activeHeaders && activeHeaders[0] ? String(activeHeaders[0]) : '';
                  const firstVal = firstKey && row && row[firstKey] !== undefined && row[firstKey] !== null ? String(row[firstKey]) : '';
                  const secondaryLabel = (() => {
                    if (!isBound) return '未绑定（点选后在下方表格选择一条记录）';
                    if (pkVal) return `${pk}: ${pkVal}`;
                    if (firstVal) return firstVal;
                    return '已绑定（该行无可展示字段）';
                  })();
                  return (
                  <div 
                    key={slot.id} 
                    className={[
                      'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border transition-colors',
                      selectedSlotId === slot.id
                        ? 'bg-indigo-500/20 border-indigo-400/50'
                        : 'bg-black/10 border-white/5 hover:bg-white/5 hover:border-white/10',
                    ].join(' ')}
                    onClick={() => setSelectedSlotId(selectedSlotId === slot.id ? null : slot.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            'text-xs font-semibold',
                            selectedSlotId === slot.id ? 'text-indigo-100' : 'text-slate-100',
                          ].join(' ')}
                          title={slot?.name || ''}
                        >
                          商品位{idx + 1}{slot?.name ? ` · ${String(slot.name)}` : ''}
                        </span>
                        <span
                          className={[
                            'text-[11px] px-2 py-0.5 rounded-full border',
                            isBound
                              ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200'
                              : 'bg-slate-500/10 border-slate-400/15 text-slate-300',
                          ].join(' ')}
                        >
                          {isBound ? '已绑定' : '未绑定'}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-200/90 truncate">
                        {secondaryLabel}
                      </div>
                    </div>
                    {selectedSlotId === slot.id ? (
                      <div className="w-44" onClick={(e) => e.stopPropagation()}>
                        <select 
                          className="w-full border border-indigo-400/40 rounded-lg px-2 py-1.5 bg-black/30 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400/70"
                          value={slotRecordMapping[slot.id] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const currentMapping = useDataStore.getState().slotRecordMapping || {};
                            const nextMapping = buildNextSlotMapping(
                              slot.id,
                              val === '' ? null : Number(val),
                              currentMapping,
                            );
                            updateSlotRecordMappingAndApply(nextMapping, { slotIds: [slot.id] });
                          }}
                        >
                          <option value="" className="bg-gray-900">选择数据行…</option>
                          {rowOptions.list.map((item) => (
                            <option key={item.value} value={item.value} className="bg-gray-900">
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                );
                })}
                {rowOptions.capped && (
                  <div className="text-[11px] text-gray-300/70">
                    仅展示前 {rowOptions.maxOptions} 行（共 {rowOptions.total} 行）
                  </div>
                )}
              </div>
            </div>
          )}

          
        </div>
        </MotionDiv>
      </div>

      {/* 数据控制台 */}
      <div className="col-span-12 h-[78vh] min-h-[780px] max-h-[980px] overflow-hidden">
        <div className="h-full bg-gray-800/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
          <DataConsole onRowSelected={handleRowSelected} onBindToSlot={bindRowToSlot} slots={slots} />
        </div>
      </div>


    </div>
  );
}
