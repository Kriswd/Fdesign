import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scissors, Download, Plus, Layout, Layers, Zap, FolderPlus } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import DataConsole from '../components/DataConsole';
import { useDataStore, buildSlotUpdates } from '../store/dataStore';
import HudEditor from '../components/HudEditor';
import BrandLogo from '../components/BrandLogo';
import ShopLinkButton from '../components/ShopLinkButton';
import { APP_DISPLAY_NAME } from '../config/appMeta';
import PSDParser from '../utils/psdParser';
import { extractTemplateFromPsd, buildVariablesFromCandidates, filterVariablesByLayerRules } from '../utils/templateExtractor';

export default function WorkbenchPage() {
  const { 
    activeHeaders, rows, primaryKey,
    slots, setSlots, slotRecordMapping, setSlotRecord,
    setFieldDefinitions,
  } = useDataStore();
  
  const [psdData, setPsdData] = useState(null);
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [templateId, setTemplateId] = useState(null);
  const [templateWidth, setTemplateWidth] = useState(790);
  const [templateHeight, setTemplateHeight] = useState(1300);
  const [templateVariables, setTemplateVariables] = useState([]);
  const [templateWarnings, setTemplateWarnings] = useState([]);
  const [selectedVariableId, setSelectedVariableId] = useState(null);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [sliceLines, setSliceLines] = useState([800, 1600]);
  const [showSliceTool, setShowSliceTool] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [pendingRow, setPendingRow] = useState(null);
  const [pendingRowIndex, setPendingRowIndex] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected', 'disconnected', 'checking'

  const exportNodeRef = useRef(null);
  const backgroundObjectUrlRef = useRef(null);
  const psdParserRef = useRef(null);
  const MotionDiv = motion.div;
  const autoFillSigRef = useRef('');
  // 默认为空字符串，走相对路径（配合 Vite 代理），实现局域网共享
  const renderServerBaseUrl = import.meta.env.VITE_RENDER_SERVER || '';

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

  const checkBackendHealth = useCallback(async () => {
    try {
      // 添加超时控制，避免请求挂起太久
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${renderServerBaseUrl}/health`, {
        signal: controller.signal
      }).catch(err => {
        // 如果 fetch 抛错（比如网络错误），视为 disconnected
        throw err;
      });
      
      clearTimeout(timeoutId);

      if (response && response.ok) {
        setBackendStatus('connected');
      } else {
        setBackendStatus('disconnected');
      }
    } catch (error) {
      console.error('Backend health check failed:', error);
      setBackendStatus('disconnected');
    }
  }, [renderServerBaseUrl]);

  useEffect(() => {
    checkBackendHealth();
    // 简单的轮询机制，每 30 秒检查一次
    const timer = setInterval(checkBackendHealth, 30000);
    return () => clearInterval(timer);
  }, [checkBackendHealth]);

  useEffect(() => {
    return () => {
      if (backgroundObjectUrlRef.current && String(backgroundObjectUrlRef.current).startsWith('blob:')) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current);
      }
    };
  }, []);

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
        })
        .catch(err => {
          console.error("Load slots failed", err);
          setSlots([]);
          setFieldDefinitions([]);
        });
    }
  }, [templateId, renderServerBaseUrl, setSlots, setFieldDefinitions]);

  const rowOptions = useMemo(() => {
    const maxOptions = 2000;
    const total = rows.length;
    const list = rows.slice(0, maxOptions).map((row, rIdx) => ({
      value: rIdx,
      label: `${rIdx + 1} - ${activeHeaders[0] ? row[activeHeaders[0]] : '数据'}`,
    }));
    return { list, total, capped: total > maxOptions, maxOptions };
  }, [rows, activeHeaders]);

  const applySlotMappingToTemplateVariables = useCallback((mapping) => {
    const map = mapping && typeof mapping === 'object' ? mapping : {};
    const slotList = useDataStore.getState().slots || [];
    const dataRows = useDataStore.getState().rows || [];
    setTemplateVariables((prev) => {
      const next = [...prev];
      slotList.forEach((slot) => {
        if (!slot || !slot.id) return;
        const slotKey = String(slot.id);
        const recordIndexRaw = map[slotKey];
        const recordIndex = Number(recordIndexRaw);
        if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= dataRows.length) return;
        const row = dataRows[recordIndex];
        if (!row || typeof row !== 'object') return;
        const vars = Array.isArray(slot.variables) ? slot.variables : [];
        vars.forEach((slotVar) => {
          const varId = slotVar?.id;
          if (!varId) return;
          const excelFieldKey = slotVar?.excelFieldKey;
          if (!excelFieldKey) return;
          if (!Object.prototype.hasOwnProperty.call(row, excelFieldKey)) return;
          const raw = row[excelFieldKey];
          if (raw === null || raw === undefined) return;
          const varIndex = next.findIndex((v) => v?.id === varId);
          if (varIndex === -1) return;
          next[varIndex] = { ...next[varIndex], value: String(raw) };
        });
      });
      return next;
    });
  }, []);

  useEffect(() => {
    useDataStore.getState().setSlotRecordMapping({});
    setSelectedSlotId(null);
    setPendingRow(null);
    setPendingRowIndex(null);
    autoFillSigRef.current = '';
  }, [templateId]);

  useEffect(() => {
    if (!templateId) return;
    const sig = `${String(templateId)}|${slots.length}|${rows.length}`;
    if (autoFillSigRef.current === sig) return;
    const mapping = useDataStore.getState().slotRecordMapping || {};
    if (Object.keys(mapping).length > 0) return;
    if (!Array.isArray(slots) || slots.length === 0) return;
    if (!Array.isArray(rows) || rows.length === 0) return;

    const nextMapping = {};
    for (let i = 0; i < slots.length && i < rows.length; i += 1) {
      const slot = slots[i];
      if (!slot || !slot.id) continue;
      nextMapping[String(slot.id)] = i;
    }

    if (Object.keys(nextMapping).length === 0) return;
    autoFillSigRef.current = sig;
    useDataStore.getState().setSlotRecordMapping(nextMapping);
    applySlotMappingToTemplateVariables(nextMapping);
  }, [applySlotMappingToTemplateVariables, rows, slots, templateId]);

  const handleLoadTemplate = async (id) => {
    try {
      const response = await fetch(`${renderServerBaseUrl}/api/template/${id}`);
      if (!response.ok) return;

      const data = await response.json();
      const frontendConfig = data.frontendConfig || {};

      const baseWidth = frontendConfig.width || data.width || 0;
      const baseHeight = frontendConfig.height || data.height || 0;
      const baseSliceLines = frontendConfig.sliceLines || [800, 1600];

      let canvasWidth = baseWidth || 790;
      let canvasHeight = baseHeight || 1300;
      let scaleX = 1;
      let scaleY = 1;
      let finalSliceLines = baseSliceLines;

      let bgUrl = null;

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
          const baseVariables = (tpl.variables && tpl.variables.length > 0)
            ? tpl.variables
            : buildVariablesFromCandidates(tpl.candidates);
          const variablesWithHidden = (baseVariables || []).map((v) => ({
            ...v,
            hidden: v.hidden !== undefined ? v.hidden : false,
            value: v.value != null ? v.value : v.defaultValue != null ? v.defaultValue : '',
          }));
          nextVariables = filterVariablesByLayerRules(variablesWithHidden);
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

      if (nextVariables.length === 0) {
        const mergedVars = (frontendConfig.variables || data.variables || []).map((v) => ({
          ...v,
          value: v.value ?? v.defaultValue ?? '',
        }));
        nextVariables = filterVariablesByLayerRules(mergedVars);
      }

      let finalVars = nextVariables;

      if (nextVariables.length > 0 && (scaleX !== 1 || scaleY !== 1)) {
        finalVars = nextVariables.map((v) => ({
          ...v,
          x: typeof v.x === 'number' ? v.x * scaleX : v.x,
          y: typeof v.y === 'number' ? v.y * scaleY : v.y,
          width: typeof v.width === 'number' ? v.width * scaleX : v.width,
          height: typeof v.height === 'number' ? v.height * scaleY : v.height,
        }));
        finalSliceLines = baseSliceLines.map((n) =>
          typeof n === 'number' ? n * scaleY : n,
        );
      }

      setTemplateWidth(canvasWidth || baseWidth || 790);
      setTemplateHeight(canvasHeight || baseHeight || 1300);
      setTemplateVariables(finalVars);
      setSliceLines(finalSliceLines);

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

      setPsdData({ width: canvasWidth || baseWidth || 790, height: canvasHeight || baseHeight || 1300, layers: [] });
    } catch (error) {
      console.error(`加载模板 ${id} 失败:`, error);
    }
  };



  const handleCanvasReady = useCallback((payload) => {
    if (payload?.exportNode) exportNodeRef.current = payload.exportNode;
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

  const bindRowToSlot = useCallback((slotId, row, rowIndex) => {
    if (!slotId || !row) return false;
    const resolvedIndex = Number.isInteger(rowIndex) ? rowIndex : computeRowIndex(row);
    if (resolvedIndex < 0) return false;
    setSlotRecord(slotId, resolvedIndex);
    setSelectedSlotId(slotId);
    const currentSlots = useDataStore.getState().slots;
    const targetSlot = currentSlots.find((s) => s.id === slotId);
    if (!targetSlot) return true;
    setTemplateVariables((prev) => {
      const next = [...prev];
      targetSlot.variables.forEach((slotVar) => {
        const varId = slotVar.id;
        const excelFieldKey = slotVar.excelFieldKey;
        const varIndex = next.findIndex((v) => v.id === varId);
        if (varIndex !== -1 && excelFieldKey && row[excelFieldKey] !== undefined) {
          next[varIndex] = { ...next[varIndex], value: String(row[excelFieldKey]) };
        }
      });
      return next;
    });
    return true;
  }, [computeRowIndex, setSlotRecord]);

  /**
   * 处理 Excel 行选中事件：
   * 1. 如果有选中的 Slot，则将该行绑定到 Slot
   * 2. 如果是旧模式（直接绑定变量），则批量填充
   * @param {Object} row - 选中的 Excel 行数据
   */
  const handleRowSelected = useCallback((row) => {
    // 更新 Store 中的当前行
    useDataStore.getState().setCurrentRow(row);
    
    if (!row) {
      setPendingRow(null);
      setPendingRowIndex(null);
      return;
    }

    // [New Logic] 商品位绑定模式
    if (selectedSlotId) {
      bindRowToSlot(selectedSlotId, row);
      setPendingRow(null);
      setPendingRowIndex(null);
      return;
    }

    const index = computeRowIndex(row);
    setPendingRow(row);
    setPendingRowIndex(index >= 0 ? index : null);
  }, [bindRowToSlot, computeRowIndex, selectedSlotId]);

  const handleAddSliceLine = () => {
    const newLine = sliceLines.length > 0 ? Math.max(...sliceLines) + 400 : 800;
    setSliceLines(prev => [...prev, newLine].sort((a, b) => a - b));
  };

  /**
   * 触发浏览器下载
   * @param {Blob} blob - 文件内容
   * @param {string} filename - 文件名
   */
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * 将 canvas 转为 blob
   * @param {HTMLCanvasElement} canvas - 源 canvas
   * @param {string} type - MIME 类型
   * @param {number} quality - 图片质量
   * @returns {Promise<Blob>}
   */
  const canvasToBlob = (canvas, type, quality) => {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('导出失败：无法生成 Blob'));
        else resolve(blob);
      }, type, quality);
    });
  };

  /**
   * 将 Blob 转为 dataURL
   * @param {Blob} blob - 二进制数据
   * @returns {Promise<string>}
   */
  const blobToDataUrl = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(blob);
    });
  };

  /**
   * 将 base64 字符串转 Blob
   * @param {string} base64 - base64 内容
   * @param {string} mime - MIME
   * @returns {Blob}
   */
  const base64ToBlob = (base64, mime) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  /**
   * 克隆导出节点并内联图片资源（解决 blob: URL 在服务端不可用的问题）
   * @param {HTMLElement} exportNode - 原导出节点
   * @returns {Promise<string>} 可用于服务端渲染的 outerHTML
   */
  const buildServerDomHtml = async (exportNode) => {
    const clone = exportNode.cloneNode(true);

    clone.querySelectorAll?.('.variable-item').forEach((el) => {
      el.style.outline = 'none';
      el.style.backgroundColor = 'transparent';
    });

    const images = Array.from(clone.querySelectorAll?.('img') || []);
    for (const img of images) {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) continue;
      try {
        const resp = await fetch(src);
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        img.setAttribute('src', dataUrl);
      } catch {
        // 忽略单个图片失败，让服务端尽量渲染其余内容
      }
    }

    return clone.outerHTML;
  };

  const buildServerDomHtmlWithRow = async (exportNode, row) => {
    const clone = exportNode.cloneNode(true);

    clone.querySelectorAll?.('.variable-item').forEach((el) => {
      el.style.outline = 'none';
      el.style.backgroundColor = 'transparent';
    });

    const slotList = Array.isArray(slots) ? slots : [];
    const safeRow = row && typeof row === 'object' ? row : {};

    for (let i = 0; i < slotList.length; i += 1) {
      const slot = slotList[i];
      if (!slot || !Array.isArray(slot.variables)) continue;
      for (let j = 0; j < slot.variables.length; j += 1) {
        const sv = slot.variables[j];
        if (!sv || !sv.id) continue;
        const fieldKey = sv.excelFieldKey;
        if (!fieldKey) continue;
        if (!Object.prototype.hasOwnProperty.call(safeRow, fieldKey)) continue;
        const value = safeRow[fieldKey];
        if (value === null || value === undefined || value === '') continue;

        const layerEl = clone.querySelector?.(`[data-layer-id="${sv.id}"]`);
        if (!layerEl) continue;
        const textEl = layerEl.querySelector?.('.text-layer');
        if (textEl) {
          textEl.textContent = String(value);
          continue;
        }
        const imgEl = layerEl.querySelector?.('img');
        if (imgEl) {
          imgEl.setAttribute('src', String(value));
        }
      }
    }

    const images = Array.from(clone.querySelectorAll?.('img') || []);
    for (const img of images) {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) continue;
      try {
        const resp = await fetch(src);
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        img.setAttribute('src', dataUrl);
      } catch {
        // 忽略单个图片失败
      }
    }

    return clone.outerHTML;
  };

  /**
   * 使用 Photoshop 回写变量并导出（100% 原样式，且不修改原始 PSD）
   */
  const handleExportByPhotoshop = async () => {
    if (!templateId) {
      alert('请先选择模板');
      return;
    }

    setExporting(true);

    try {
      const tplName = templates.find(t => t.id === templateId)?.name || 'export';
      const baseName = `${tplName}_${new Date().toISOString().slice(0, 10)}`;

      const storeState = useDataStore.getState();
      const slotUpdates = buildSlotUpdates({
        slots: storeState.slots,
        slotRecordMapping: storeState.slotRecordMapping,
        rows: storeState.rows,
      });

      let updates = [];

      if (slotUpdates.length > 0) {
        console.log('[App Debug] Using Slot-based updates. Slot count:', storeState.slots.length, 'Update count:', slotUpdates.length);
        updates = slotUpdates;
      } else {
        console.log('[App Debug] Preparing updates for export. Variables count:', templateVariables?.length);
        for (const v of templateVariables || []) {
          const currentVal = v.value ?? '';
          const defaultVal = v.defaultValue ?? '';
          const currentStr = String(currentVal);
          const defaultStr = String(defaultVal);
          const isModified = currentStr !== defaultStr;

          if (isModified) {
            if (!v.psId) {
              console.warn(`[App Debug] Variable modified but missing psId: ${v.key} (ID: ${v.id}) - SKIPPING`);
              continue;
            }
            console.log(`[App Debug] Adding update: ${v.key} (psId: ${v.psId})`);
            updates.push({
              psId: v.psId,
              varType: v.varType,
              value: currentVal,
              name: v.name,
              id: v.id,
            });
          }
        }
      }

      console.log('[App Debug] Final updates payload count:', updates.length);

      const resp = await fetch(`${renderServerBaseUrl}/api/template/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templateId,
          updates, // 直接传指令列表
          format: 'png',
          quality: 100,
        }),
      });

      if (!resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await resp.json().catch(() => ({}));
          const rid = data?.requestId ? String(data.requestId) : '';
          const prefix = rid ? `[${rid}] ` : '';
          throw new Error(prefix + (data?.message || data?.error || `Photoshop 导出失败（HTTP ${resp.status}）`));
        }
        const text = await resp.text().catch(() => '');
        const snippet = String(text || '').trim().slice(0, 400);
        const suffix = snippet ? `：${snippet}` : '';
        throw new Error(`Photoshop 导出失败（HTTP ${resp.status}）${suffix}`);
      }

      const data = await resp.json();
      const url = `${renderServerBaseUrl}${data.url}?t=${Date.now()}`;
      const blob = await fetch(url).then((r) => r.blob());
      downloadBlob(blob, `${baseName}_ps.png`);
    } catch (err) {
      console.error(err);
      alert(`Photoshop 还原导出失败：${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  /**
   * 按切片线批量导出（优先服务端 Puppeteer，失败则回退前端截图）
   */
  const _handleExport = async () => {
    const tplName = templates.find(t => t.id === templateId)?.name || 'export';
    const baseName = `${tplName}_${new Date().toISOString().slice(0, 10)}`;

    const exportByClient = async () => {
      const exportNode = exportNodeRef.current;
      if (!exportNode) {
        alert('导出失败：未找到画布节点');
        return;
      }

      const sortedLines = [...sliceLines].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      const boundaries = [0, ...sortedLines, templateHeight].filter((n, i, arr) => i === 0 || n > arr[i - 1]);

      const fullCanvas = await htmlToImage.toCanvas(exportNode, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });

      for (let i = 0; i < boundaries.length - 1; i += 1) {
        const y0 = boundaries[i];
        const y1 = boundaries[i + 1];
        const sliceH = Math.max(0, y1 - y0);
        if (sliceH <= 0) continue;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = fullCanvas.width;
        cropCanvas.height = Math.round((sliceH / templateHeight) * fullCanvas.height);

        const ctx = cropCanvas.getContext('2d');
        if (!ctx) throw new Error('导出失败：无法获取 Canvas 上下文');

        const sy = Math.round((y0 / templateHeight) * fullCanvas.height);
        const sh = cropCanvas.height;

        ctx.drawImage(fullCanvas, 0, sy, fullCanvas.width, sh, 0, 0, cropCanvas.width, cropCanvas.height);

        const blob = await canvasToBlob(cropCanvas, 'image/jpeg', 0.95);
        downloadBlob(blob, `${baseName}_slice_${String(i + 1).padStart(2, '0')}.jpg`);
      }
    };

    const exportByServer = async () => {
      const exportNode = exportNodeRef.current;
      if (!exportNode) throw new Error('未找到画布节点');

      const dom = await buildServerDomHtml(exportNode);

      const resp = await fetch(`${renderServerBaseUrl}/api/export/slices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dom,
          width: templateWidth,
          height: templateHeight,
          sliceLines,
          format: 'png',
          quality: 95,
          deviceScaleFactor: 2,
          backgroundColor: '#ffffff',
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `服务端导出失败（HTTP ${resp.status}）`);
      }

      const data = await resp.json();
      const format = data.format || 'png';
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';

      for (const s of data.slices || []) {
        const blob = base64ToBlob(s.base64, mime);
        downloadBlob(blob, `${baseName}_slice_${String(s.index).padStart(2, '0')}.${format}`);
      }
    };

    try {
      await exportByServer();
    } catch (err) {
      console.error(err);
      console.warn('服务端导出失败，回退到前端截图导出');
      try {
        await exportByClient();
      } catch (fallbackErr) {
        console.error(fallbackErr);
        alert(`导出失败：${fallbackErr.message}`);
      }
    }
  };

  const _handleBatchExport = async () => {
    if (!rows || rows.length === 0) {
      alert('请先上传 Excel');
      return;
    }
    if (!exportNodeRef.current) {
      alert('导出失败：未找到画布节点');
      return;
    }

    const hasSlotBinding = Array.isArray(slots)
      && slots.some((s) =>
        Array.isArray(s.variables)
        && s.variables.some((v) => v && v.excelFieldKey));
    if (!hasSlotBinding) {
      alert('当前模版未配置商品位字段映射，请先在管理端绑定 Excel 字段');
      return;
    }

    const tplName = templates.find(t => t.id === templateId)?.name || 'export';
    const baseName = `${tplName}_${new Date().toISOString().slice(0, 10)}`;
    const mime = 'image/png';
    const exportNode = exportNodeRef.current;

    setExporting(true);
    setExportProgress({ current: 0, total: rows.length });

    try {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        setExportProgress({ current: i + 1, total: rows.length });

        const rowKey = primaryKey && row?.[primaryKey] !== undefined ? String(row[primaryKey]) : String(i + 1).padStart(3, '0');
        const dom = await buildServerDomHtmlWithRow(exportNode, row);

        const resp = await fetch(`${renderServerBaseUrl}/api/export/slices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dom,
            width: templateWidth,
            height: templateHeight,
            sliceLines,
            format: 'png',
            quality: 95,
            deviceScaleFactor: 2,
            backgroundColor: '#ffffff',
          }),
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data?.message || data?.error || `服务端导出失败（HTTP ${resp.status}）`);
        }

        const data = await resp.json();
        for (const s of data.slices || []) {
          const blob = base64ToBlob(s.base64, mime);
          downloadBlob(blob, `${baseName}_${rowKey}_slice_${String(s.index).padStart(2, '0')}.png`);
        }
      }
    } catch (err) {
      console.error(err);
      alert(`批量生成失败：${err.message}`);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };
  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 selection:bg-emerald-500/30">
      {/* Backend Status Alert */}
      <AnimatePresence>
        {backendStatus === 'disconnected' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[9999] bg-rose-500/90 backdrop-blur-md text-white shadow-lg border-b border-rose-400/50"
          >
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-sm font-medium">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 fill-current" />
                <span>无法连接到后台服务，功能受限。请确保已运行启动脚本 (start-Fdesign.bat) 或手动启动后端。</span>
              </div>
              <button 
                onClick={checkBackendHealth}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md text-xs transition-colors"
              >
                重试连接
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="bg-gray-900/80 border-b border-white/10 px-6 py-4 sticky top-0 z-50 backdrop-blur-xl">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <BrandLogo />
              <div>
                <h1 className="text-lg font-semibold text-gray-100 tracking-tight">{APP_DISPLAY_NAME}</h1>
                <p className="text-xs text-gray-500 font-medium">电商图自动化生成工具 (用户端)</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ShopLinkButton />
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-12 gap-6 pb-24">

        {/* 左侧：画布预览 (占 9 列) */}
        <MotionDiv
          className="col-span-9 bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 h-[800px] flex flex-col shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Layout className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-semibold text-gray-200">画布预览</h2>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                templateId 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-gray-700/50 text-gray-400 border-gray-600/50'
              }`}>
                {templateId ? '模版已选择' : '未选择模版'}
              </span>
              {psdData && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                  {psdData.layers?.length || 0} 图层
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
              <span>W: {templateWidth}px</span>
              <span>H: {templateHeight}px</span>
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
              maxInitialScale={0.62}
              hotspots={templateVariables.map((v) => ({
                ...v,
                type: v.varType === 'img' ? 'image' : v.varType,
                rect: { x: v.x, y: v.y, w: v.width, h: v.height },
              }))}
              selectedId={selectedVariableId}
              highlightedIds={highlightedVariableIds}
              onSelect={setSelectedVariableId}
              sliceLines={sliceLines}
              showSliceLines={showSliceTool}
              onCanvasReady={handleCanvasReady}
            />
          </div>
        </MotionDiv>

        {/* 右侧：工具栏 (占 3 列) */}
        <div className="col-span-3 flex flex-col gap-6 h-[800px]">
          {/* 当前模版信息 */}
          <MotionDiv
            className="bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg flex-shrink-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Layout className="w-5 h-5 text-emerald-500" />
              <h3 className="font-semibold text-gray-200">当前模版</h3>
            </div>
            
            {templateId ? (
              <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                 <h4 className="text-lg font-bold text-white mb-1">
                   {templates.find(t => t.id === templateId)?.name || '未命名模版'}
                 </h4>
                 <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                    <span className="flex items-center gap-1">
                      <Layout className="w-3 h-3" /> {templateWidth}x{templateHeight}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" /> {slots.length} 个商品位
                    </span>
                 </div>
                 
                 <button 
                   onClick={() => setTemplateId(null)}
                   className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300 transition-colors"
                 >
                   切换模版
                 </button>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 text-sm">
                请先选择模版
              </div>
            )}
          </MotionDiv>

          {/* 数据绑定 */}
          <MotionDiv
            className="bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex-1 min-h-0 flex flex-col shadow-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-4 flex-shrink-0">
              <Layers className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-gray-200">数据绑定</h3>
            </div>
            
            <div className="space-y-3 flex-1 flex flex-col min-h-0">
            {slots.length > 0 && (
              <div className="mb-4 p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <h4 className="text-sm font-semibold text-indigo-200">商品位绑定</h4>
                    <span className="text-[11px] text-gray-300/90">点选商品位，再在下方表格点击一条记录完成绑定</span>
                  </div>
                </div>
                {pendingRow && (
                  <div className="mb-3 p-2 rounded-lg border border-indigo-500/20 bg-black/20">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-indigo-200">已选中记录</div>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingRow(null);
                          setPendingRowIndex(null);
                        }}
                        className="text-[10px] text-gray-400 hover:text-gray-200"
                      >
                        清除
                      </button>
                    </div>
                    <div className="mt-1 text-[10px] text-gray-400">
                      {primaryKey && pendingRow?.[primaryKey] !== undefined
                        ? `${primaryKey}: ${pendingRow[primaryKey]}`
                        : pendingRowIndex !== null
                          ? `第 ${pendingRowIndex + 1} 行`
                          : '已命中记录'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {slots.map((slot, idx) => (
                        <button
                          key={`bind-${slot.id}`}
                          type="button"
                          onClick={() => {
                            const ok = bindRowToSlot(slot.id, pendingRow, pendingRowIndex);
                            if (ok) {
                              setPendingRow(null);
                              setPendingRowIndex(null);
                            }
                          }}
                          className="px-2 py-1 rounded-md text-[10px] border border-indigo-500/30 text-indigo-200 hover:text-white hover:border-indigo-400 hover:bg-indigo-500/20 transition-all"
                          title={slot?.name || ''}
                        >
                          绑定到 商品位{idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {slots.map((slot, idx) => {
                    const rawIndex = slotRecordMapping && slot ? slotRecordMapping[slot.id] : null;
                    const recordIndex = Number(rawIndex);
                    const isBound = Number.isInteger(recordIndex) && recordIndex >= 0 && recordIndex < rows.length;
                    const row = isBound ? rows[recordIndex] : null;
                    const pk = primaryKey ? String(primaryKey) : '';
                    const pkVal = pk && row && row[pk] !== undefined && row[pk] !== null ? String(row[pk]) : '';
                    const firstKey = activeHeaders && activeHeaders[0] ? String(activeHeaders[0]) : '';
                    const firstVal = firstKey && row && row[firstKey] !== undefined && row[firstKey] !== null ? String(row[firstKey]) : '';
                    const secondary = pkVal || firstVal;
                    const statusLabel = isBound ? `第 ${recordIndex + 1} 行` : '未绑定';
                    const secondaryLabel = isBound
                      ? pkVal
                        ? `${pk}: ${pkVal}`
                        : firstVal
                          ? firstVal
                          : '（该行无可展示主键）'
                      : '点击下方表格一条记录即可绑定';
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
                              商品位{idx + 1}
                            </span>
                            <span
                              className={[
                                'text-[11px] px-2 py-0.5 rounded-full border',
                                isBound
                                  ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200'
                                  : 'bg-slate-500/10 border-slate-400/15 text-slate-300',
                              ].join(' ')}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-200/90 truncate">
                            {secondary ? secondaryLabel : secondaryLabel}
                          </div>
                        </div>
                        {selectedSlotId === slot.id ? (
                          <div className="w-44" onClick={(e) => e.stopPropagation()}>
                            <select
                              className="w-full border border-indigo-400/40 rounded-lg px-2 py-1.5 bg-black/30 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400/70"
                              value={slotRecordMapping[slot.id] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  setSlotRecord(slot.id, null);
                                  return;
                                }
                                const nextIndex = Number(val);
                                setSlotRecord(slot.id, nextIndex);
                                const nextMapping = useDataStore.getState().slotRecordMapping || {};
                                applySlotMappingToTemplateVariables(nextMapping);
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
        <div className="col-span-12">
          <DataConsole onRowSelected={handleRowSelected} />
        </div>

        {/* 第三行：切片与导出 */}
        <MotionDiv
          className="col-span-12 bg-gray-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-emerald-500" />
              <h3 className="font-semibold text-gray-200">切片与导出</h3>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSliceTool(!showSliceTool)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                  showSliceTool 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 border border-white/5'
                }`}
              >
                <Scissors className="w-4 h-4" />
                {showSliceTool ? '隐藏切片线' : '显示切片线'}
              </button>
              <button
                onClick={handleAddSliceLine}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white/5 text-gray-400 border border-white/5 rounded-xl hover:bg-white/10 hover:text-gray-200 transition-all"
              >
                <Plus className="w-4 h-4" />
                添加切片线
              </button>
              <div className="flex items-center gap-2 px-4 py-2 bg-black/20 border border-white/5 rounded-xl">
                <span className="text-xs text-gray-500">输出宽度</span>
                <input
                  type="number"
                  value={templateWidth}
                  className="w-16 px-2 py-1 text-sm bg-transparent border border-white/10 rounded text-gray-300 focus:outline-none focus:border-emerald-500/50"
                  readOnly
                />
                <span className="text-xs text-gray-500">px</span>
              </div>

              {/* 导出按钮组 */}
              <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
                {templateId && (
                  <>
                    <button
                      onClick={_handleExport}
                      disabled={exporting}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 hover:text-white border border-white/5 rounded-xl transition-all"
                      title="导出当前切片"
                    >
                      <Download className="w-4 h-4" />
                      切片导出
                    </button>

                    <button
                      onClick={_handleBatchExport}
                      disabled={exporting || !rows || rows.length === 0}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all border ${
                        exporting || !rows || rows.length === 0
                          ? 'bg-gray-800 text-gray-600 border-transparent cursor-not-allowed'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20 hover:text-indigo-300'
                      }`}
                      title={(!rows || rows.length === 0) ? "请先上传 Excel 数据" : "按 Excel 行批量导出"}
                    >
                      <Layers className="w-4 h-4" />
                      批量生成
                    </button>

                    <button
                      onClick={handleExportByPhotoshop}
                      disabled={exporting}
                      className={`flex items-center gap-2 px-6 py-2 text-sm font-medium text-white rounded-xl transition-all shadow-lg ${
                        exporting
                          ? 'bg-gray-600 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20'
                      }`}
                    >
                      <Zap className="w-4 h-4" />
                      PS还原导出
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          {exportProgress && (
            <div className="mt-3 text-xs text-gray-400 font-mono">
              批量生成中：{exportProgress.current}/{exportProgress.total}
            </div>
          )}
          {sliceLines.length > 0 && (
            <div className="flex items-center gap-3 mt-4 p-3 bg-black/20 rounded-xl border border-white/5">
              <span className="text-xs text-gray-500">切片位置:</span>
              <div className="flex flex-wrap gap-2">
                {sliceLines.map((line, idx) => (
                  <span key={idx} className="px-2 py-1 bg-white/5 text-xs text-gray-300 rounded border border-white/10">
                    {line}px
                  </span>
                ))}
              </div>
            </div>
          )}
        </MotionDiv>
      </main>

      {/* Template Selector Modal (Startup) */}
      <AnimatePresence>
        {!templateId && (
          <MotionDiv
            className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/95 backdrop-blur-md p-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-6xl h-full flex flex-col">
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

              <div className="grid grid-cols-4 gap-6 overflow-y-auto pb-10">
                {templates.map(tpl => (
                  <motion.div
                    key={tpl.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleLoadTemplate(tpl.id)}
                    className="bg-gray-800 rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-900/20 transition-all group"
                  >
                    <div className="aspect-[3/4] bg-gray-900 relative">
                       {/* 预览图占位 */}
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
                           <span>{tpl.width}x{tpl.height}</span>
                           <span>•</span>
                           <span>{new Date(tpl.createdAt || Date.now()).toLocaleDateString()}</span>
                         </div>
                       </div>
                    </div>
                  </motion.div>
                ))}
                
                {/* Empty State / Add New (Redirect to Admin) */}
                {templates.length === 0 && (
                   <div className="col-span-4 flex flex-col items-center justify-center py-20 text-gray-500">
                     <FolderPlus className="w-16 h-16 mb-4 opacity-20" />
                     <p className="text-lg">暂无可用模版</p>
                     <p className="text-sm mt-2">请联系管理员在后台创建模版</p>
                   </div>
                )}
              </div>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>

    </div>
  );
}
