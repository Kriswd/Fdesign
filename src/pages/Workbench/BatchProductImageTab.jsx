import { useState, useRef, useMemo, useEffect, useCallback, Component } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Play, Download, Loader2, CheckCircle, AlertCircle, FileImage, Layers, Save, RefreshCw, Trash2, ChevronDown } from 'lucide-react';
import JSZip from 'jszip';
import * as agPsd from 'ag-psd';
import { filterVariablesByLayerRules, flattenLayers, stableSortByZIndex } from '../../utils/templateExtractor';
import { buildCutoutNoPsdRequest } from '../../utils/cutoutNoPsdPayload.mjs';
import HudEditor from '../../components/HudEditor';
import { createApiClient } from '../../utils/apiClient';
import { buildZipEntry, detectPlatform } from '../../utils/exportZipLayout';
import { resolveGuidePickByRect } from '../../utils/resolveGuidePickByRect.js';
import { APP_TITLE_DEFAULT } from '../../config/appMeta';

const { readPsd, initializeCanvas } = agPsd;

if (typeof document !== 'undefined') {
  initializeCanvas((width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
}

class BatchTabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    this.props?.onError?.(error);
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error && this.state.error.message
          ? String(this.state.error.message)
          : String(this.state.error);
      const stack = this.state.error && this.state.error.stack ? String(this.state.error.stack) : '';
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="w-full max-w-3xl bg-gray-900/60 border border-rose-500/30 rounded-2xl p-6">
            <div className="text-rose-300 font-semibold text-lg">页面发生错误</div>
            <div className="mt-2 text-gray-300 text-sm">批量生成页面渲染时出现异常，已阻止白屏。</div>
            <div className="mt-4 text-xs text-gray-400">错误信息</div>
            <pre className="mt-2 text-xs text-rose-200/90 bg-black/30 border border-white/10 rounded-xl p-3 overflow-auto whitespace-pre-wrap break-words">
              {message}
              {stack ? `\n\n${stack}` : ''}
            </pre>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 text-sm border border-white/10"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function BatchProductImageTab({ renderServerBaseUrl }) {
  const mergeRowsByKey = useCallback((prevRows, incomingRows) => {
    const prev = Array.isArray(prevRows) ? prevRows : [];
    const incoming = Array.isArray(incomingRows) ? incomingRows : [];
    if (incoming.length === 0) return prev;

    const next = prev.map((r) => ({ ...(r || {}) }));
    const indexByKey = new Map();
    for (let i = 0; i < next.length; i += 1) {
      const row = next[i] || {};
      const psdId = String(row?.psdId || '').trim();
      const imgId = String(row?.imgId || row?.imageId || '').trim();
      if (!psdId || !imgId) continue;
      indexByKey.set(`${psdId}__${imgId}`, i);
    }

    for (let i = 0; i < incoming.length; i += 1) {
      const row = incoming[i] || {};
      const psdId = String(row?.psdId || '').trim();
      const imgId = String(row?.imgId || row?.imageId || '').trim();
      if (!psdId || !imgId) {
        next.push({ ...row });
        continue;
      }
      const key = `${psdId}__${imgId}`;
      const idx = indexByKey.get(key);
      if (idx == null) {
        indexByKey.set(key, next.length);
        next.push({ ...row });
        continue;
      }

      const existing = next[idx] || {};
      const mergedFormatResults = { ...(existing.formatResults || {}) };
      const incomingFormatResults = row.formatResults || {};
      Object.keys(incomingFormatResults).forEach((fmt) => {
        mergedFormatResults[fmt] = incomingFormatResults[fmt];
      });

      const statuses = Object.keys(mergedFormatResults).map((k) => mergedFormatResults[k]?.status).filter(Boolean);
      const hasProcessing = statuses.some((s) => s === 'processing');
      const hasSuccess = statuses.some((s) => s === 'success');
      const hasError = statuses.some((s) => s === 'error');
      const derivedStatus = hasProcessing ? 'processing' : hasSuccess ? 'success' : hasError ? 'error' : (row?.status || existing?.status || 'pending');

      next[idx] = {
        ...existing,
        ...row,
        psdId,
        imgId,
        psdName: existing?.psdName || row?.psdName,
        imgName: existing?.imgName || row?.imgName,
        imgUrl: existing?.imgUrl || row?.imgUrl,
        serverImagePath: existing?.serverImagePath || row?.serverImagePath,
        formatResults: mergedFormatResults,
        status: derivedStatus,
      };
    }

    return next;
  }, []);

  // State
  const [psdFiles, setPsdFiles] = useState([]); // { file, id, name, parsed: { width, height, variables, canvasUrl }, status: 'pending'|'parsing'|'success'|'error' }
  const [productImages, setProductImages] = useState([]); // { file, id, name, url, status: 'pending'|'loaded' }
  const [channelMasks, setChannelMasks] = useState([]); // { file, id, name, status: 'loaded', uploadStatus: 'pending'|'uploading'|'success'|'error', uploadError, storedName }
  const [missingChannelHints, setMissingChannelHints] = useState([]);
  const [basePsdId, setBasePsdId] = useState(null);
  const [selectedPsIdsByPsdId, setSelectedPsIdsByPsdId] = useState(() => new Map());
  const [activeHotspotId, setActiveHotspotId] = useState(null);
  const [activeHotspotIdByPsdId, setActiveHotspotIdByPsdId] = useState(() => new Map());
  const [guidePickMode, setGuidePickMode] = useState(false);
  const [guidePickSources, setGuidePickSources] = useState(() => ({ native: true, layer: true }));
  const [manualGuidePicksByPsdId, setManualGuidePicksByPsdId] = useState(() => new Map());
  const MotionDiv = motion.div;
  const psdDragDepthRef = useRef(0);
  const imgDragDepthRef = useRef(0);
  const channelDragDepthRef = useRef(0);
  const [psdDropActive, setPsdDropActive] = useState(false);
  const [imgDropActive, setImgDropActive] = useState(false);
  const [channelDropActive, setChannelDropActive] = useState(false);

  const [taskMode, setTaskMode] = useState('fresh'); // fresh | template
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [selectedTaskTemplateIds, setSelectedTaskTemplateIds] = useState(() => []);
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState('');
  const [selectedTaskTemplate, setSelectedTaskTemplate] = useState(null);
  const [taskTemplateDetailById, setTaskTemplateDetailById] = useState(() => new Map());
  const [taskTemplateSelectOpen, setTaskTemplateSelectOpen] = useState(false);
  const [isTaskTemplateLoading, setIsTaskTemplateLoading] = useState(false);
  const [taskTemplateError, setTaskTemplateError] = useState('');
  const [taskTemplateNotice, setTaskTemplateNotice] = useState('');
  const [isSavingTaskTemplate, setIsSavingTaskTemplate] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [taskTemplateVarsByTemplateId, setTaskTemplateVarsByTemplateId] = useState(() => new Map());
  const [taskTemplateMetaByTemplateId, setTaskTemplateMetaByTemplateId] = useState(() => new Map());
  const [taskTemplateImageGroups, setTaskTemplateImageGroups] = useState([]);
  const [taskTemplateGroupsTouched, setTaskTemplateGroupsTouched] = useState(false);
  const [taskTemplatePicker, setTaskTemplatePicker] = useState(null);
  const [activeTaskTemplateCanvasId, setActiveTaskTemplateCanvasId] = useState('');
  const [activeTaskTemplateHotspotId, setActiveTaskTemplateHotspotId] = useState(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [generationResults, setGenerationResults] = useState([]); // { psdId, imageId, url, status: 'pending'|'success'|'error' }
  const [exportFormatsByPsdId, setExportFormatsByPsdId] = useState(() => new Map());
  const [exportFormatsByTemplateId, setExportFormatsByTemplateId] = useState(() => new Map());
  const [exportJpegQuality, setExportJpegQuality] = useState(100);
  const [bundlePsdEnabled, setBundlePsdEnabled] = useState(true);
  const [bundleExportResults, setBundleExportResults] = useState([]); // { templateId, serverTemplateId, psdName, imgName, status, resultUrl, error }
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0, part: 0, parts: null });
  const [zipPolicy, setZipPolicy] = useState(() => {
    const fallback = { mode: 'auto', maxFiles: 200, maxSizeMB: 800 };
    try {
      if (typeof window === 'undefined' || !window.localStorage) return fallback;
      const raw = window.localStorage.getItem('fdesign_zip_policy_v1');
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      const mode = String(parsed?.mode || 'auto').toLowerCase();
      const maxFiles = Math.max(1, Math.min(5000, Math.floor(Number(parsed?.maxFiles) || 0))) || fallback.maxFiles;
      const maxSizeMB = Math.max(50, Math.min(50000, Math.floor(Number(parsed?.maxSizeMB) || 0))) || fallback.maxSizeMB;
      if (mode !== 'auto' && mode !== 'single' && mode !== 'custom') return fallback;
      return { mode, maxFiles, maxSizeMB };
    } catch {
      return fallback;
    }
  });
  const [zipSettingsOpen, setZipSettingsOpen] = useState(false);
  const [downloadingItems, setDownloadingItems] = useState(new Set()); // 正在下载的项目标识：'idx' 或 'idx_fmt'
  const [downloadProgressByKey, setDownloadProgressByKey] = useState(() => new Map());
  
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);
  const channelInputRef = useRef(null);
  const taskTemplateSelectRootRef = useRef(null);
  const perfRef = useRef({ batchId: null, batchStart: 0, uploads: new Map(), exports: new Map() });
  const exportStatsRef = useRef(new Map()); // templateId -> { avgPerTaskMs, samples, chunkSize }
  const guidePickSaveTimerRef = useRef(null);
  const [guidePickSaveHint, setGuidePickSaveHint] = useState('');

  const apiClient = useMemo(() => createApiClient(renderServerBaseUrl), [renderServerBaseUrl]);
  const fetchWithFallback = apiClient.fetchWithFallback;
  const apiBaseCandidates = apiClient.apiBaseCandidates;
  const readJsonSafely = apiClient.readJsonSafely;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = APP_TITLE_DEFAULT;
    const picked =
      productImages.find((img) => img && typeof img.name === 'string' && img.name.trim())?.name ||
      productImages.find((img) => img && typeof img.sourceName === 'string' && img.sourceName.trim())?.sourceName ||
      null;
    const name = picked ? String(picked).replace(/\.[^/.]+$/g, '').trim() : '';
    document.title = name ? `${base} - ${name}` : `${base} - 批量生成产品图`;
  }, [productImages]);

  useEffect(() => {
    return () => {
      const t = guidePickSaveTimerRef.current;
      if (t) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem('fdesign_zip_policy_v1', JSON.stringify(zipPolicy));
    } catch (e) {
      void e;
    }
  }, [zipPolicy]);

  const chunkArray = (arr, chunkSize) => {
    const list = Array.isArray(arr) ? arr : [];
    const size = Math.max(1, Math.floor(Number(chunkSize) || 1));
    const out = [];
    for (let i = 0; i < list.length; i += size) {
      out.push(list.slice(i, i + size));
    }
    return out;
  };

  const fixMojibakeUtf8 = useCallback((input) => {
    const raw = String(input || '');
    if (!raw) return raw;
    const hasMojibakeHint = /[ÃÂåæäçº¿]/.test(raw) || raw.includes('�');
    if (!hasMojibakeHint) return raw;
    try {
      if (typeof TextDecoder !== 'function') return raw;
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i) & 0xff;
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (!decoded || decoded === raw || decoded.includes('�')) return raw;
      const rawCjk = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
      const decodedCjk = (decoded.match(/[\u4e00-\u9fff]/g) || []).length;
      if (decodedCjk > rawCjk) return decoded;
      return raw;
    } catch {
      return raw;
    }
  }, []);

  const toFriendlyUploadedName = useCallback(
    (input) => {
      const base = String(input || '');
      if (!base) return '';
      const ext = (base.match(/(\.[a-z0-9]+)$/i) || [])[1] || '';
      const noExt = ext ? base.slice(0, -ext.length) : base;
      const stripped = String(noExt || '')
        .replace(/^[a-z0-9_-]{6,80}__+/i, '')
        .replace(/_[0-9a-f]{6,32}$/i, '');
      const fixed = fixMojibakeUtf8(stripped);
      return `${fixed || stripped || noExt || base}${ext}`;
    },
    [fixMojibakeUtf8],
  );

  const sanitizeZipNameSegment = (input) => {
    const raw = String(input || '').trim();
    if (!raw) return '未命名';
    const cleaned = raw
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/\.+/g, '.')
      .replace(/^_+|_+$/g, '');
    const safe = cleaned || '未命名';
    return safe.length > 80 ? safe.slice(0, 80) : safe;
  };

  const extFromFormat = (format) => {
    const f = String(format || '').toLowerCase();
    if (f === 'psd') return 'psd';
    if (f === 'jpeg' || f === 'jpg') return 'jpg';
    return 'png';
  };

  const extFromUrl = (url) => {
    const raw = String(url || '').split('?')[0].split('#')[0];
    const m = raw.match(/\.([a-z0-9]+)$/i);
    const ext = m ? String(m[1] || '').toLowerCase() : '';
    if (ext === 'psd' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
    return '';
  };

  const defaultExportFormatsFromPsdName = useCallback((name) => {
    const raw = String(name || '');
    return /png/i.test(raw) ? ['png', 'psd'] : ['jpeg', 'psd'];
  }, []);

  const normalizeExportFormats = (rawExportFormats, fallbackExportFormats) => {
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
  };

  const getFreshExportFormats = (psdId, psdName) => {
    const key = String(psdId || '').trim();
    return normalizeExportFormats(exportFormatsByPsdId.get(key), defaultExportFormatsFromPsdName(psdName));
  };

  const getTemplateExportFormats = (templateId, fallbackFormats) => {
    const key = String(templateId || '').trim();
    const mapped = exportFormatsByTemplateId.get(key);
    return normalizeExportFormats(mapped != null ? mapped : fallbackFormats, ['jpeg', 'psd']);
  };

  const pickFallbackFormatFromTask = (task) => {
    const forced = task?.resultFormat != null ? String(task.resultFormat).toLowerCase() : '';
    if (forced) return forced === 'jpg' ? 'jpeg' : forced;
    const formatResults = task?.formatResults && typeof task.formatResults === 'object' ? task.formatResults : {};
    const preferred = ['psd', 'png', 'jpeg'];
    for (let i = 0; i < preferred.length; i += 1) {
      const fr = formatResults[preferred[i]] || null;
      if (fr && (fr.status === 'success' || fr.status === 'processing')) return preferred[i];
    }
    const keys = Object.keys(formatResults);
    if (keys.length > 0) return String(keys[0] || 'png').toLowerCase();
    return 'png';
  };

  const getQueueDisplayName = (task) => {
    const urlExt = extFromUrl(task?.resultUrl);
    const fmt = pickFallbackFormatFromTask(task);
    return buildExportFileName({
      psdName: task?.psdName,
      imgName: task?.imgName,
      urlExt,
      fallbackFormat: fmt,
    });
  };

  const buildExportFileName = ({ psdName, imgName, urlExt, fallbackFormat }) => {
    const psdBase = sanitizeZipNameSegment(fixMojibakeUtf8(String(psdName || '')).replace(/\.psd$/i, ''));
    const imgBase = sanitizeZipNameSegment(fixMojibakeUtf8(String(imgName || '')).replace(/\.[^/.]+$/, ''));
    const ext = String(urlExt || extFromFormat(fallbackFormat) || '').toLowerCase() || 'png';
    if (ext === 'psd' || ext === 'psb') {
      const left = psdBase || '导出文件';
      const right = imgBase || '';
      return right ? `${left}_${right}.${ext}` : `${left}.${ext}`;
    }
    return imgBase ? `${imgBase}.${ext}` : `${psdBase || '导出文件'}.${ext}`;
  };

  const dedupeZipRelativePath = (relativePath, usedPaths) => {
    const used = usedPaths instanceof Set ? usedPaths : new Set();
    const raw = String(relativePath || '').replace(/^\/+/g, '');
    if (!raw) return '';
    if (!used.has(raw)) return raw;
    const parts = raw.split('/');
    const file = parts.pop() || '';
    const dir = parts.join('/');
    const match = /^(.+?)(\.[^.]+)?$/.exec(file);
    const stem = match ? String(match[1] || 'file') : 'file';
    const ext = match && match[2] ? String(match[2]) : '';
    for (let n = 2; n < 10000; n += 1) {
      const nextFile = `${stem}_${n}${ext}`;
      const nextPath = dir ? `${dir}/${nextFile}` : nextFile;
      if (!used.has(nextPath)) return nextPath;
    }
    return raw;
  };

  const buildDownloadCandidates = (relativeUrl, preferredBase) => {
    const raw = String(relativeUrl || '').trim();
    if (!raw) return [];
    if (/^https?:\/\//i.test(raw)) return [raw];
    const bases = [];
    const preferred = typeof preferredBase === 'string' ? preferredBase.trim() : '';
    if (preferred) bases.push(preferred);
    const candidates = Array.isArray(apiBaseCandidates) ? apiBaseCandidates : [];
    for (let i = 0; i < candidates.length; i += 1) {
      const b = typeof candidates[i] === 'string' ? candidates[i].trim() : '';
      if (b) bases.push(b);
    }
    const uniqBases = Array.from(new Set(bases.filter(Boolean)));
    const out = [];
    for (let i = 0; i < uniqBases.length; i += 1) {
      const base = uniqBases[i];
      try {
        out.push(new URL(raw, base).toString());
      } catch {
        out.push(`${String(base).replace(/\/+$/g, '')}${raw.startsWith('/') ? raw : `/${raw}`}`);
      }
    }
    if (raw.startsWith('/')) out.push(raw);
    return Array.from(new Set(out));
  };

  const pickUsableDownloadResponse = async (relativeUrl, preferredBase) => {
    const candidates = buildDownloadCandidates(relativeUrl, preferredBase);
    for (let i = 0; i < candidates.length; i += 1) {
      const url = candidates[i];
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) continue;
        return { res, url };
      } catch {
        continue;
      }
    }
    return null;
  };

  const downloadBlob = (blob, fileName) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60 * 1000);
  };

  const normalizeZipPolicyForRun = (rawPolicy, items) => {
    const policy = rawPolicy && typeof rawPolicy === 'object' ? rawPolicy : {};
    const mode = String(policy?.mode || 'auto').toLowerCase();
    const safeMode = mode === 'single' || mode === 'custom' ? mode : 'auto';
    const list = Array.isArray(items) ? items : [];
    const hasLarge = list.some((it) => {
      const f = String(it?.resultFormat || '').toLowerCase();
      if (f === 'psd' || f === 'psb') return true;
      const ext = extFromUrl(it?.resultUrl);
      return ext === 'psd' || ext === 'psb';
    });

    const hardMaxSizeMB = hasLarge ? 1400 : 2200;

    if (safeMode === 'single') {
      return {
        mode: safeMode,
        maxFiles: 5000,
        maxSizeMB: 999999,
        hardMaxSizeMB,
        label: '尽量单包（超硬上限仍会分卷）',
      };
    }

    if (safeMode === 'custom') {
      const maxFiles = Math.max(1, Math.min(5000, Math.floor(Number(policy?.maxFiles) || 0))) || 200;
      const maxSizeMB = Math.max(50, Math.min(50000, Math.floor(Number(policy?.maxSizeMB) || 0))) || 800;
      return {
        mode: safeMode,
        maxFiles,
        maxSizeMB,
        hardMaxSizeMB,
        label: `自定义（${maxFiles}个 / ${maxSizeMB}MB）`,
      };
    }

    return {
      mode: 'auto',
      maxFiles: 200,
      maxSizeMB: 800,
      hardMaxSizeMB,
      label: hasLarge ? '自动（推荐：适合含PSD）' : '自动（推荐）',
    };
  };

  const handleSingleDownload = async (key, url, fileName) => {
    if (downloadingItems.has(key)) return;
    setDownloadingItems((prev) => new Set(prev).add(key));
    setDownloadProgressByKey((prev) => {
      const next = new Map(prev);
      next.set(key, { loaded: 0, total: 0 });
      return next;
    });
    const startTime = Date.now();
    try {
      const picked = await pickUsableDownloadResponse(url);
      if (!picked) throw new Error('下载失败');
      const res = picked.res;
      const total = Number(res.headers.get('content-length') || 0) || 0;
      const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
      if (reader) {
        const chunks = [];
        let loaded = 0;
        setDownloadProgressByKey((prev) => {
          const next = new Map(prev);
          next.set(key, { loaded: 0, total });
          return next;
        });
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;
            setDownloadProgressByKey((prev) => {
              const next = new Map(prev);
              next.set(key, { loaded, total });
              return next;
            });
          }
        }
        const blob = new Blob(chunks);
        downloadBlob(blob, fileName);
      } else {
        const blob = await res.blob();
        setDownloadProgressByKey((prev) => {
          const next = new Map(prev);
          next.set(key, { loaded: blob.size || 0, total: blob.size || 0 });
          return next;
        });
        downloadBlob(blob, fileName);
      }
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '下载失败';
      console.warn('[下载] 单文件下载失败', { key, error: e });
      alert(`${fileName} 下载失败：${msg}`);
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 2000 - elapsed));
      }
      setDownloadingItems((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setDownloadProgressByKey((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const isLikelyTimeoutError = (err) => {
    const msg = err && err.message ? String(err.message) : String(err || '');
    const text = msg.toLowerCase();
    const hints = ['timeout', 'timed out', 'etimedout', 'und_err_headers_timeout', 'headers timeout', '超时'];
    return hints.some((h) => text.includes(h));
  };

  const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

  const isValidGuidePick = (p) => {
    const leftX = Number(p?.leftX);
    const rightX = Number(p?.rightX);
    return Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX;
  };

  const isRetryableUploadError = (err) => {
    const status = Number(err?.httpStatus);
    if (Number.isFinite(status)) {
      if (status === 408 || status === 425 || status === 429) return true;
      if (status >= 500) return true;
      return false;
    }
    if (isLikelyTimeoutError(err)) return true;
    const msg = err && err.message ? String(err.message) : String(err || '');
    const text = msg.toLowerCase();
    const hints = [
      'networkerror',
      'network error',
      'failed to fetch',
      'econnreset',
      'ecconnreset',
      'socket hang up',
      '断开',
      '连接被',
      '502',
      '503',
      '504',
    ];
    return hints.some((h) => text.includes(h));
  };

  const isRetryableBatchExportError = (err) => {
    const status = Number(err?.httpStatus);
    if (Number.isFinite(status) && status >= 500) return true;
    if (isLikelyTimeoutError(err)) return true;
    const msg = err && err.message ? String(err.message) : String(err || '');
    const text = msg.toLowerCase();
    const hints = ['networkerror', 'network error', 'failed to fetch', 'ecconnreset', 'socket hang up', 'econnreset', '断开', '连接被', '502', '503', '504'];
    return hints.some((h) => text.includes(h));
  };

  const requestBatchExportWithRetry = async (payload, options = {}) => {
    const maxAttempts = Math.max(1, Math.min(5, Math.floor(Number(options?.maxAttempts) || 0))) || 3;
    const baseDelayMs = Math.max(0, Math.min(30000, Math.floor(Number(options?.baseDelayMs) || 0))) || 1500;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const { res, meta } = await fetchWithFallback('/api/template/batch-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {}),
        });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          const err = new Error(String(msg || '批量导出失败'));
          err.httpStatus = res.status;
          err.server = data;
          err.attempts = meta?.attempts;
          throw err;
        }
        return { data, attempts: meta?.attempts || null };
      } catch (e) {
        lastErr = e;
        if (attempt >= maxAttempts || !isRetryableBatchExportError(e)) break;
        const delay = baseDelayMs * attempt;
        await sleepMs(delay);
      }
    }
    throw lastErr || new Error('批量导出失败');
  };

  const advanceGenerationProgress = (delta, phase) => {
    const d = Math.max(0, Math.floor(Number(delta) || 0));
    setGenerationProgress((prev) => {
      const current = Math.max(0, Math.floor(Number(prev?.current) || 0));
      const total = Math.max(0, Math.floor(Number(prev?.total) || 0));
      if (!(total > 0) && !(prev?.phase != null && String(prev.phase).trim())) return prev;
      const nextCurrent = total > 0 ? Math.min(total, current + d) : current + d;
      const nextPhase = phase != null && String(phase).trim() ? String(phase).trim() : prev?.phase;
      return { ...(prev || {}), current: nextCurrent, total, ...(nextPhase ? { phase: nextPhase } : {}) };
    });
  };

  const getTemplateExportStats = (templateId) => {
    const key = String(templateId || '');
    const existing = exportStatsRef.current.get(key);
    if (existing) return existing;
    const init = { avgPerTaskMs: null, samples: 0, chunkSize: 60 };
    exportStatsRef.current.set(key, init);
    return init;
  };

  const computeChunkSize = (templateId, remaining) => {
    const stats = getTemplateExportStats(templateId);
    const current = Number(stats.chunkSize) || 60;
    const avg = Number(stats.avgPerTaskMs);
    let size = current;
    if (Number.isFinite(avg) && avg > 0) {
      const targetMs = 50 * 60 * 1000;
      const baseMs = 8 * 60 * 1000;
      const per = Math.max(8000, Math.min(120000, avg * 1.15));
      const allowed = Math.floor((targetMs - baseMs) / per);
      if (Number.isFinite(allowed) && allowed > 0) {
        size = Math.min(size, allowed);
      }
    }
    size = Math.max(10, Math.min(80, Math.floor(size)));
    size = Math.min(size, Math.max(1, Math.floor(Number(remaining) || 0)));
    return size;
  };

  const updateChunkStatsOnSuccess = ({ templateId, tasksCount, costMs }) => {
    const stats = getTemplateExportStats(templateId);
    const c = Math.max(1, Math.floor(Number(tasksCount) || 1));
    const total = Math.max(0, Number(costMs) || 0);
    const per = Math.max(5000, Math.min(120000, total / c));
    const prevSamples = Math.max(0, Math.floor(Number(stats.samples) || 0));
    const prevAvg = Number(stats.avgPerTaskMs);
    const nextSamples = prevSamples + c;
    const nextAvg =
      Number.isFinite(prevAvg) && prevSamples > 0 ? (prevAvg * prevSamples + per * c) / nextSamples : per;

    stats.avgPerTaskMs = nextAvg;
    stats.samples = nextSamples;

    const canIncrease = total < 25 * 60 * 1000;
    const currentChunk = Number(stats.chunkSize) || 60;
    if (canIncrease && currentChunk < 80 && c >= currentChunk) {
      stats.chunkSize = Math.min(80, currentChunk + 5);
    }
  };

  const updateChunkStatsOnFailure = ({ templateId, err }) => {
    if (!isLikelyTimeoutError(err)) return;
    const stats = getTemplateExportStats(templateId);
    const currentChunk = Number(stats.chunkSize) || 60;
    stats.chunkSize = Math.max(10, Math.floor(currentChunk * 0.6));
  };

  const loadTaskTemplates = useMemo(() => {
    return async () => {
      setTaskTemplateError('');
      try {
        const { res } = await fetchWithFallback('/api/task-templates', { method: 'GET' });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          const msg =
            res.status === 404
              ? '未检测到任务模板接口，请确认已启动服务端（npm run server）'
              : data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(String(msg));
        }
        const list = Array.isArray(data) ? data : [];
        setTaskTemplates(list);
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '加载任务模板失败';
        setTaskTemplateError(msg);
      }
    };
  }, [fetchWithFallback, readJsonSafely]);

  useEffect(() => {
    if (taskMode !== 'template') return;
    loadTaskTemplates();
  }, [loadTaskTemplates, taskMode]);

  const handleExportAllTaskTemplates = useCallback(async () => {
    try {
      const { res: resp } = await fetchWithFallback('/api/task-templates/export-all', {
        credentials: 'include',
      });
      if (!resp.ok) {
        throw new Error('导出失败');
      }
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
      const msg = e && e.message ? String(e.message) : '导出失败';
      alert(`任务模板导出失败: ${msg}`);
    }
  }, [fetchWithFallback]);

  const handleImportAllTaskTemplates = useCallback(
    async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      e.target.value = '';
      const confirmed = window.confirm('导入将覆盖当前全部任务模板,确认继续?');
      if (!confirmed) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const { res: resp } = await fetchWithFallback('/api/task-templates/import-all', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(result.error || result.message || '导入失败');
        }
        alert(`导入成功,共导入 ${result.imported || 0} 个任务模板`);
        // 刷新任务模板列表
        const { res: listResp } = await fetchWithFallback('/api/task-templates', { method: 'GET' });
        if (listResp.ok) {
          const listData = await listResp.json();
          setTaskTemplates(Array.isArray(listData) ? listData : []);
        }
      } catch (err) {
        const msg = err && err.message ? String(err.message) : '导入失败';
        alert(`任务模板导入失败: ${msg}`);
      }
    },
    [fetchWithFallback],
  );

  const loadTaskTemplateDetail = useMemo(() => {
    return async (id) => {
      const tplId = String(id || '').trim();
      if (!tplId) {
        return;
      }
      setIsTaskTemplateLoading(true);
      setTaskTemplateError('');
      try {
        const { res } = await fetchWithFallback(`/api/task-templates/${encodeURIComponent(tplId)}`, { method: 'GET' });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(String(msg));
        }
        setTaskTemplateDetailById((prev) => {
          const next = new Map(prev);
          next.set(tplId, data);
          return next;
        });
        return data;
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '加载任务模板失败';
        setTaskTemplateError(msg);
        setTaskTemplateDetailById((prev) => {
          const next = new Map(prev);
          next.delete(tplId);
          return next;
        });
      } finally {
        setIsTaskTemplateLoading(false);
      }
    };
  }, [fetchWithFallback, readJsonSafely]);

  const deleteTaskTemplate = useCallback(
    async (id) => {
      const tplId = String(id || '').trim();
      if (!tplId) return;
      try {
        const { res } = await fetchWithFallback(`/api/task-templates/${encodeURIComponent(tplId)}`, { method: 'DELETE' });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(String(msg || '删除失败'));
        }
        await loadTaskTemplates();
        setSelectedTaskTemplateIds((prev) => (Array.isArray(prev) ? prev.filter((x) => String(x || '').trim() !== tplId) : []));
        setTaskTemplateDetailById((prev) => {
          const next = new Map(prev);
          next.delete(tplId);
          return next;
        });
        setSelectedTaskTemplateId((cur) => (String(cur || '').trim() === tplId ? '' : cur));
        setSelectedTaskTemplate((cur) => (String(cur?.id || '').trim() === tplId ? null : cur));
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '删除失败';
        alert(msg);
      }
    },
    [fetchWithFallback, loadTaskTemplates, readJsonSafely],
  );

  useEffect(() => {
    if (taskMode !== 'template') return;
    const previewId = String(selectedTaskTemplateId || '').trim();
    if (!previewId) {
      if (selectedTaskTemplate) setSelectedTaskTemplate(null);
      return;
    }
    const cached = taskTemplateDetailById.get(previewId) || null;
    if (cached) {
      if (selectedTaskTemplate !== cached) setSelectedTaskTemplate(cached);
      return;
    }
    loadTaskTemplateDetail(previewId);
  }, [loadTaskTemplateDetail, selectedTaskTemplate, selectedTaskTemplateId, taskMode, taskTemplateDetailById]);

  useEffect(() => {
    if (taskMode !== 'template') return;
    const picked = Array.isArray(selectedTaskTemplateIds) ? selectedTaskTemplateIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const uniq = Array.from(new Set(picked));
    if (uniq.length !== picked.length) {
      setSelectedTaskTemplateIds(uniq);
      return;
    }
    if (uniq.length === 0) {
      if (selectedTaskTemplateId) setSelectedTaskTemplateId('');
      if (selectedTaskTemplate) setSelectedTaskTemplate(null);
      setTaskTemplateDetailById((prev) => (prev && prev.size > 0 ? new Map() : prev));
      return;
    }
    if (!uniq.includes(String(selectedTaskTemplateId || '').trim())) {
      setSelectedTaskTemplateId(uniq[0]);
      return;
    }
    let cancelled = false;
    (async () => {
      for (let i = 0; i < uniq.length; i += 1) {
        const id = uniq[i];
        if (taskTemplateDetailById.has(id)) continue;
        try {
          await loadTaskTemplateDetail(id);
        } catch (e) {
          void e;
        }
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTaskTemplateDetail, selectedTaskTemplate, selectedTaskTemplateId, selectedTaskTemplateIds, taskMode, taskTemplateDetailById]);

  useEffect(() => {
    if (taskMode === 'template') {
      setBasePsdId(null);
      setSelectedPsIdsByPsdId(new Map());
      setExportFormatsByPsdId(new Map());
    } else {
      setTaskTemplateError('');
      setTaskTemplateNotice('');
      setSelectedTaskTemplateIds([]);
      setSelectedTaskTemplateId('');
      setSelectedTaskTemplate(null);
      setTaskTemplateDetailById(new Map());
      setTaskTemplateSelectOpen(false);
      setExportFormatsByTemplateId(new Map());
    }
  }, [taskMode]);

  const toggleTaskTemplateSelection = useCallback((id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    setSelectedTaskTemplateIds((prev) => {
      const list = Array.isArray(prev) ? prev.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const set = new Set(list);
      if (set.has(tid)) set.delete(tid);
      else set.add(tid);
      const next = Array.from(set.values());
      if (next.length > 0) {
        setSelectedTaskTemplateId((cur) => {
          const curId = String(cur || '').trim();
          if (curId && next.includes(curId)) return curId;
          return tid;
        });
      }
      return next;
    });
  }, []);

  const selectAllTaskTemplates = useCallback(() => {
    const ids = taskTemplates.map((t) => String(t?.id || '').trim()).filter(Boolean);
    const uniq = Array.from(new Set(ids));
    setSelectedTaskTemplateIds(uniq);
    if (uniq.length > 0) {
      setSelectedTaskTemplateId((cur) => {
        const curId = String(cur || '').trim();
        if (curId && uniq.includes(curId)) return curId;
        return uniq[0];
      });
    }
  }, [taskTemplates]);

  useEffect(() => {
    if (!taskTemplateSelectOpen) return;
    const root = taskTemplateSelectRootRef.current;
    const onDown = (e) => {
      const target = e?.target;
      if (!root) return;
      if (target && typeof root.contains === 'function' && root.contains(target)) return;
      const path = typeof e?.composedPath === 'function' ? e.composedPath() : null;
      if (Array.isArray(path) && path.includes(root)) return;
      setTaskTemplateSelectOpen(false);
    };
    document.addEventListener('pointerdown', onDown, false);
    return () => document.removeEventListener('pointerdown', onDown, false);
  }, [taskTemplateSelectOpen]);

  const selectedTaskTemplateSummaries = useMemo(() => {
    const byId = new Map();
    taskTemplates.forEach((t) => {
      const id = String(t?.id ?? '').trim();
      if (!id) return;
      byId.set(id, t);
    });
    const picked = Array.isArray(selectedTaskTemplateIds) ? selectedTaskTemplateIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const uniq = Array.from(new Set(picked));
    return uniq.map((id) => ({
      id,
      name: String(byId.get(id)?.name || `任务模板_${id}`),
      detail: taskTemplateDetailById.get(id) || null,
    }));
  }, [selectedTaskTemplateIds, taskTemplateDetailById, taskTemplates]);

  const selectedTaskTemplateIdSet = useMemo(() => {
    const picked = Array.isArray(selectedTaskTemplateIds) ? selectedTaskTemplateIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    return new Set(picked);
  }, [selectedTaskTemplateIds]);

  const taskTemplateItems = useMemo(() => {
    const list = [];
    for (let i = 0; i < selectedTaskTemplateSummaries.length; i += 1) {
      const s = selectedTaskTemplateSummaries[i];
      const items = Array.isArray(s?.detail?.items) ? s.detail.items : [];
      for (let j = 0; j < items.length; j += 1) {
        const it = items[j];
        if (!it) continue;
        list.push({ ...it, __taskTemplateId: s.id, __taskTemplateName: s.name });
      }
    }
    return list;
  }, [selectedTaskTemplateSummaries]);

  const taskTemplateUnionPsIds = useMemo(() => {
    const set = new Set();
    for (let i = 0; i < taskTemplateItems.length; i += 1) {
      const ids = Array.isArray(taskTemplateItems[i]?.selectedPsIds) ? taskTemplateItems[i].selectedPsIds : [];
      for (let j = 0; j < ids.length; j += 1) {
        const n = Math.trunc(Number(ids[j]));
        if (!Number.isFinite(n) || n <= 0) continue;
        set.add(n);
      }
    }
    return Array.from(set.values()).sort((a, b) => a - b);
  }, [taskTemplateItems]);

  const taskTemplateGroupingEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(String(window.location?.search || ''));
      const q = String(params.get('grouping') || '').trim();
      if (q === '1' || q.toLowerCase() === 'true') return true;
      const v = String(window.localStorage?.getItem?.('fdesign_enable_task_template_grouping') || '').trim();
      return v === '1' || v.toLowerCase() === 'true';
    } catch {
      return false;
    }
  }, []);

  const productImageById = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < productImages.length; i += 1) {
      const img = productImages[i];
      const id = String(img?.id || '');
      if (!id) continue;
      m.set(id, img);
    }
    return m;
  }, [productImages]);

  const rebuildTaskTemplateGroups = useCallback(
    ({ force } = {}) => {
      const psIds = taskTemplateUnionPsIds;
      const imgs = Array.isArray(productImages) ? productImages : [];
      const required = psIds.length;
      if (required === 0) {
        setTaskTemplateImageGroups([]);
        setTaskTemplateGroupsTouched(false);
        return;
      }
      if (!force && taskTemplateGroupsTouched) return;
      const groups = [];
      if (required === 1) {
        const psId = psIds[0];
        for (let i = 0; i < imgs.length; i += 1) {
          const img = imgs[i];
          const id = String(img?.id || '');
          if (!id) continue;
          groups.push({
            id: `g_${id}`,
            name: String(img?.name || `产品图_${i + 1}`),
            assignments: { [String(psId)]: id },
          });
        }
      } else {
        for (let i = 0; i < imgs.length; i += required) {
          const chunk = imgs.slice(i, i + required);
          const g = {
            id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${Math.floor(i / required)}`,
            name: String(chunk[0]?.name || `组合_${Math.floor(i / required) + 1}`),
            assignments: {},
          };
          for (let j = 0; j < psIds.length; j += 1) {
            const img = chunk[j];
            const imgId = String(img?.id || '');
            if (!imgId) continue;
            g.assignments[String(psIds[j])] = imgId;
          }
          groups.push(g);
        }
      }
      setTaskTemplateImageGroups(groups);
      setTaskTemplateGroupsTouched(false);
    },
    [productImages, taskTemplateGroupsTouched, taskTemplateUnionPsIds],
  );

  useEffect(() => {
    if (taskMode !== 'template') return;
    if (taskTemplateItems.length === 0) {
      setTaskTemplateVarsByTemplateId(new Map());
      setTaskTemplateMetaByTemplateId(new Map());
      setTaskTemplateImageGroups([]);
      setTaskTemplateGroupsTouched(false);
      setTaskTemplatePicker(null);
      setActiveTaskTemplateCanvasId('');
      setActiveTaskTemplateHotspotId(null);
      return;
    }
    const templateIds = Array.from(
      new Set(
        taskTemplateItems
          .map((it) => String(it?.templateId || '').trim())
          .filter((v) => v),
      ),
    );
    let cancelled = false;
    (async () => {
      const next = new Map();
      const nextMeta = new Map();
      for (let i = 0; i < templateIds.length; i += 1) {
        const templateId = templateIds[i];
        next.set(templateId, new Map());
        nextMeta.set(templateId, {
          id: String(templateId),
          width: null,
          height: null,
          imageUrl: null,
          guides: null,
          guideLayers: null,
          variables: [],
          error: null,
        });
        try {
          const { res } = await fetchWithFallback(`/api/template/${encodeURIComponent(templateId)}`, { method: 'GET' });
          const data = await readJsonSafely(res);
          if (!res.ok) {
            const msg = data?.message || data?.error || `HTTP ${res.status}`;
            nextMeta.set(templateId, {
              ...nextMeta.get(templateId),
              id: String(templateId),
              error: String(msg || '模板信息加载失败'),
            });
            continue;
          }
          const vars = Array.isArray(data?.variables) ? data.variables : [];
          const byPsId = new Map();
          for (let j = 0; j < vars.length; j += 1) {
            const v = vars[j];
            const psId = Math.trunc(Number(v?.psId));
            if (!Number.isFinite(psId) || psId <= 0) continue;
            byPsId.set(psId, v);
          }
          next.set(templateId, byPsId);
          nextMeta.set(templateId, {
            id: String(data?.id || templateId),
            width: Number(data?.width) || null,
            height: Number(data?.height) || null,
            imageUrl: data?.imageUrl ? String(data.imageUrl) : null,
            guides: data?.guides && typeof data.guides === 'object' ? data.guides : null,
            guideLayers: data?.guideLayers && typeof data.guideLayers === 'object' ? data.guideLayers : null,
            variables: vars,
            error: null,
          });
        } catch (e) {
          const msg = e && e.message ? String(e.message) : '模板信息加载失败';
          nextMeta.set(templateId, {
            ...nextMeta.get(templateId),
            id: String(templateId),
            error: msg,
          });
        }
      }
      if (cancelled) return;
      setTaskTemplateVarsByTemplateId(next);
      setTaskTemplateMetaByTemplateId(nextMeta);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWithFallback, readJsonSafely, taskMode, taskTemplateItems]);

  useEffect(() => {
    if (taskMode !== 'template') return;
    const ids = Array.from(
      new Set(
        taskTemplateItems
          .map((it) => String(it?.templateId || '').trim())
          .filter(Boolean),
      ),
    );
    if (ids.length === 0) {
      if (activeTaskTemplateCanvasId) setActiveTaskTemplateCanvasId('');
      if (activeTaskTemplateHotspotId != null) setActiveTaskTemplateHotspotId(null);
      return;
    }
    if (!ids.includes(String(activeTaskTemplateCanvasId || '').trim())) {
      setActiveTaskTemplateCanvasId(ids[0]);
      setActiveTaskTemplateHotspotId(null);
    }
  }, [activeTaskTemplateCanvasId, activeTaskTemplateHotspotId, taskMode, taskTemplateItems]);

  useEffect(() => {
    if (taskMode !== 'template') return;
    rebuildTaskTemplateGroups();
  }, [rebuildTaskTemplateGroups, taskMode, taskTemplateItems.length, productImages.length]);

  useEffect(() => {
    if (taskMode !== 'template') return;
    if (!taskTemplateGroupsTouched) return;
    const existingIds = new Set(productImages.map((img) => String(img?.id || '')).filter(Boolean));
    setTaskTemplateImageGroups((prev) => {
      const out = [];
      for (let i = 0; i < prev.length; i += 1) {
        const g = prev[i] || {};
        const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
        const keys = Object.keys(assignments);
        const nextAssignments = {};
        for (let j = 0; j < keys.length; j += 1) {
          const k = keys[j];
          const v = String(assignments[k] || '');
          if (!v) continue;
          if (!existingIds.has(v)) continue;
          nextAssignments[k] = v;
        }
        out.push({ ...g, assignments: nextAssignments });
      }
      return out;
    });
  }, [productImages, taskMode, taskTemplateGroupsTouched]);

  const now = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  };

  const buildBatchImageVariablesFromLayers = useMemo(() => {
    return ({ layers, canvasWidth, canvasHeight }) => {
      const flat = flattenLayers(Array.isArray(layers) ? layers : []);
      const used = new Map();
      const vars = [];

      const fullArea = (Number(canvasWidth) || 0) * (Number(canvasHeight) || 0);

      for (const item of flat) {
        const layer = item?.layer;
        const path = item?.path || '';
        if (!layer) continue;
        if (layer.visible === false) continue;
        if (layer.type !== 'image') continue;
        if (layer.isWhiteOrTransparent) continue;
        if (layer.isSynthetic) continue;
        if (layer.isGhost) continue;

        const rawName = String(layer?.name || '').trim();
        const baseName = rawName || `图片_${layer?.id != null ? String(layer.id) : 'unknown'}`;

        if (/(背景|bg|background)/i.test(baseName)) continue;

        const w = Number(layer?.width) || 0;
        const h = Number(layer?.height) || 0;
        const ratio = fullArea > 0 ? (w * h) / fullArea : 0;
        if (Number.isFinite(ratio) && ratio >= 0.98) continue;

        const count = used.get(baseName) || 0;
        used.set(baseName, count + 1);
        const uniqueName = count === 0 ? baseName : `${baseName}_${count + 1}`;

        const src = layer?.imageData || layer?.src || '';

        vars.push({
          id: layer.id,
          psId: layer.psId,
          zIndex: layer.zIndex,
          key: uniqueName,
          varType: 'img',
          name: uniqueName,
          path,
          x: Number(layer?.x) || 0,
          y: Number(layer?.y) || 0,
          width: w,
          height: h,
          visible: layer?.visible !== false,
          hidden: false,
          defaultValue: String(src || ''),
          value: undefined,
          isWhiteOrTransparent: layer?.isWhiteOrTransparent,
          isSynthetic: layer?.isSynthetic,
          isGhost: layer?.isGhost,
        });
      }

      return stableSortByZIndex(vars, (v) => v?.zIndex);
    };
  }, []);

  const extractLooseImageLayers = useMemo(() => {
    return ({ psd, canvasWidth, canvasHeight }) => {
      const layers = [];
      let zIndexCounter = 0;
      const fullArea = (Number(canvasWidth) || 0) * (Number(canvasHeight) || 0);

      const walk = (children, parentPath) => {
        const list = Array.isArray(children) ? children : [];
        for (const child of list) {
          if (!child) continue;
          const isHidden = child.hidden === true || child.visible === false;
          if (isHidden) continue;

          const name = String(child.name || '');
          const nextPath = parentPath ? `${parentPath}/${name || child.id}` : (name || child.id);

          if (child.artboard && child.children) {
            walk(child.children, nextPath);
            continue;
          }
          if (child.children && child.children.length > 0) {
            walk(child.children, nextPath);
            continue;
          }

          const isImage = !!(child.canvas || child.imageData || child.placedLayer);
          if (!isImage) continue;

          const left = Number(child.left);
          const top = Number(child.top);
          const rightRaw = Number(child.right);
          const bottomRaw = Number(child.bottom);

          const fallbackW = Number(child.canvas?.width ?? child.imageData?.width ?? 0);
          const fallbackH = Number(child.canvas?.height ?? child.imageData?.height ?? 0);

          const x = Number.isFinite(left) ? left : 0;
          const y = Number.isFinite(top) ? top : 0;
          const right = Number.isFinite(rightRaw) ? rightRaw : x + fallbackW;
          const bottom = Number.isFinite(bottomRaw) ? bottomRaw : y + fallbackH;

          const w = Math.max(0, right - x);
          const h = Math.max(0, bottom - y);
          if (w <= 0 || h <= 0) continue;

          if (/(背景|bg|background)/i.test(name)) continue;
          const ratio = fullArea > 0 ? (w * h) / fullArea : 0;
          if (Number.isFinite(ratio) && ratio >= 0.98) continue;

          zIndexCounter += 1;
          layers.push({
            id: String(child.id),
            psId: child.id,
            zIndex: zIndexCounter,
            name: name || `图片_${String(child.id)}`,
            type: 'image',
            x,
            y,
            width: w,
            height: h,
            visible: true,
            hidden: false,
            isWhiteOrTransparent: false,
            isSynthetic: false,
            isGhost: false,
          });
        }
      };

      walk(psd?.children, '');

      return stableSortByZIndex(layers, (l) => l?.zIndex);
    };
  }, []);

  const isGuideDebugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const flag = String(window.localStorage?.getItem('debug_guides') || '').trim();
      if (flag === '1' || flag.toLowerCase() === 'true') return true;
      const qs = String(window.location?.search || '');
      return /(^|[?&])debugGuides=1(&|$)/.test(qs);
    } catch {
      return false;
    }
  }, []);

  const isPickDebugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const flag = String(window.localStorage?.getItem('debug_pick') || '').trim();
      if (flag === '1' || flag.toLowerCase() === 'true') return true;
      const qs = String(window.location?.search || '');
      return /(^|[?&])debugPick=1(&|$)/.test(qs);
    } catch {
      return false;
    }
  }, []);

  const extractPsdGuides = useCallback((psd, canvasWidth, canvasHeight) => {
    const imageResources = psd?.imageResources;
    const raw =
      psd?.gridAndGuidesInformation?.guides
      ?? imageResources?.gridAndGuidesInformation?.guides
      ?? imageResources?.[1032]?.guides
      ?? imageResources?.['1032']?.guides
      ?? imageResources?.[1032]?.gridAndGuidesInformation?.guides
      ?? imageResources?.['1032']?.gridAndGuidesInformation?.guides;

    const list = Array.isArray(raw) ? raw : [];
    const maxDim = Math.max(Number(canvasWidth) || 0, Number(canvasHeight) || 0);

    const normalizeAxis = (direction) => {
      if (direction === 'vertical' || direction === 'v') return 'vertical';
      if (direction === 'horizontal' || direction === 'h') return 'horizontal';
      if (direction === 0 || direction === false) return 'vertical';
      if (direction === 1 || direction === true) return 'horizontal';
      if (typeof direction === 'string') {
        const d = direction.toLowerCase();
        if (d.includes('vert')) return 'vertical';
        if (d.includes('horiz')) return 'horizontal';
      }
      return null;
    };

    const normalizeLocationPx = (location) => {
      const n = Number(location);
      if (!Number.isFinite(n)) return null;
      if (maxDim > 0) {
        if (Math.abs(n) > maxDim + 1) {
          const candidate = n / 32;
          if (Math.abs(candidate) <= maxDim + 1) return candidate;
        }
      }
      return n;
    };

    const vertical = [];
    const horizontal = [];
    const rawSamples = [];
    for (let i = 0; i < list.length; i += 1) {
      const g = list[i];
      const axis = normalizeAxis(g?.direction);
      const px = normalizeLocationPx(g?.location);
      if (axis && px != null && rawSamples.length < 6) rawSamples.push({ direction: g?.direction, location: g?.location, axis, px });
      if (!axis) continue;
      if (px == null) continue;
      const rounded = Math.round(Number(px));
      if (!Number.isFinite(rounded)) continue;
      if (axis === 'vertical') vertical.push(rounded);
      if (axis === 'horizontal') horizontal.push(rounded);
    }
    const uniq = (arr) => Array.from(new Set(arr)).sort((a, b) => a - b);
    const result = { vertical: uniq(vertical), horizontal: uniq(horizontal) };

    if (isGuideDebugEnabled) {
      const source =
        psd?.gridAndGuidesInformation?.guides ? 'psd.gridAndGuidesInformation.guides'
          : imageResources?.gridAndGuidesInformation?.guides ? 'psd.imageResources.gridAndGuidesInformation.guides'
            : imageResources?.[1032]?.guides ? 'psd.imageResources[1032].guides'
              : imageResources?.['1032']?.guides ? 'psd.imageResources["1032"].guides'
                : imageResources?.[1032]?.gridAndGuidesInformation?.guides ? 'psd.imageResources[1032].gridAndGuidesInformation.guides'
                  : imageResources?.['1032']?.gridAndGuidesInformation?.guides ? 'psd.imageResources["1032"].gridAndGuidesInformation.guides'
                    : '未命中';
      console.log('[参考线调试] PSD 原生参考线读取结果', {
        source,
        canvasWidth: Number(canvasWidth) || 0,
        canvasHeight: Number(canvasHeight) || 0,
        rawCount: list.length,
        samples: rawSamples,
        vertical: result.vertical,
        horizontal: result.horizontal,
      });
    }

    return result;
  }, [isGuideDebugEnabled]);

  const extractGuideLayers = useCallback((psd, canvasWidth, canvasHeight) => {
    const flat = [];
    const walk = (children, path) => {
      const list = Array.isArray(children) ? children : [];
      for (let i = 0; i < list.length; i += 1) {
        const layer = list[i];
        const name = String(layer?.name || '').trim();
        const nextPath = path ? `${path}/${name || 'Layer'}` : (name || 'Layer');
        if (Array.isArray(layer?.children) && layer.children.length > 0) {
          walk(layer.children, nextPath);
        } else {
          flat.push({ layer, path: nextPath });
        }
      }
    };
    walk(psd?.children, '');

    const guideNameRe = /(guide|guideline|参考线|辅助线|对齐线|边距)/i;
    const guideGroupRe = /(^|\/)(__guides__|guides|参考线|辅助线|规范需隐藏)(\/|$)/i;
    const cw = Number(canvasWidth) || 0;
    const ch = Number(canvasHeight) || 0;
    const maxWidth = Math.max(2, Math.round(cw * 0.05));
    const minHeight = Math.max(20, Math.round(ch * 0.3));

    const guides = [];
    for (let i = 0; i < flat.length; i += 1) {
      const item = flat[i];
      const layer = item?.layer;
      if (!layer) continue;
      const name = String(layer?.name || '').trim();
      const path = String(item?.path || '');
      if (!name && !path) continue;
      const inGuideGroup = guideGroupRe.test(path);
      const byName = guideNameRe.test(name);
      if (!inGuideGroup && !byName) continue;

      const leftRaw = Number(layer?.left);
      const topRaw = Number(layer?.top);
      const rightRaw = Number(layer?.right);
      const bottomRaw = Number(layer?.bottom);
      const left = Number.isFinite(leftRaw) ? leftRaw : 0;
      const top = Number.isFinite(topRaw) ? topRaw : 0;
      const right = Number.isFinite(rightRaw) ? rightRaw : left;
      const bottom = Number.isFinite(bottomRaw) ? bottomRaw : top;
      const w = Math.max(0, right - left);
      const h = Math.max(0, bottom - top);
      if (!Number.isFinite(left) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
      if (w > maxWidth || h < minHeight) continue;

      const x = Math.round(left + w / 2);
      guides.push({ name, path, x });
    }

    const left = guides.find((g) => /left|guide_l|guideleft|左/i.test(`${g.name} ${g.path}`)) || null;
    const right = guides.find((g) => /right|guide_r|guideright|右/i.test(`${g.name} ${g.path}`)) || null;
    const xs = guides.map((g) => g.x).filter((n) => Number.isFinite(n));
    const minX = xs.length >= 2 ? Math.min(...xs) : null;
    const maxX = xs.length >= 2 ? Math.max(...xs) : null;
    return {
      all: guides,
      leftX: left ? left.x : minX,
      rightX: right ? right.x : maxX,
    };
  }, []);

  const parsePsdArrayBuffer = useCallback(
    async (arrayBuffer) => {
      const psd = readPsd(arrayBuffer, {
        skipThumbnail: true,
        skipCompositeImageData: false,
        skipLayerImageData: true,
        useImageData: true,
        useCanvas: true,
        logMissingFeatures: true,
      });

      const width = Number(psd?.width) || 0;
      const height = Number(psd?.height) || 0;

      const guides = extractPsdGuides(psd, width, height);
      const guideLayers = extractGuideLayers(psd, width, height);

      const looseLayers = extractLooseImageLayers({ psd, canvasWidth: width, canvasHeight: height });
      const baseVariables = buildBatchImageVariablesFromLayers({ layers: looseLayers, canvasWidth: width, canvasHeight: height });

      const variables = filterVariablesByLayerRules(
        stableSortByZIndex(
          (baseVariables || []).map((v) => ({
            ...v,
            id: v?.id != null ? String(v.id) : v?.id,
            hidden: v && v.hidden !== undefined ? v.hidden : false,
            value: undefined,
            psId: v?.psId,
          })),
          (v) => v?.zIndex,
        ),
      );

      let canvasUrl = null;
      let canvas = psd?.canvas || null;
      if (!canvas && psd?.imageData && typeof document !== 'undefined') {
        try {
          const fallbackCanvas = document.createElement('canvas');
          fallbackCanvas.width = width;
          fallbackCanvas.height = height;
          const ctx = fallbackCanvas.getContext('2d');
          if (ctx && typeof ctx.putImageData === 'function') {
            ctx.putImageData(psd.imageData, 0, 0);
            canvas = fallbackCanvas;
          }
        } catch (e) {
          console.warn('imageData 转 canvas 失败', e);
        }
      }
      if (canvas) {
        try {
          if (typeof canvas.convertToBlob === 'function') {
            const blob = await canvas.convertToBlob({ type: 'image/png' });
            canvasUrl = URL.createObjectURL(blob);
          } else if (typeof canvas.toBlob === 'function') {
            const blob = await new Promise((resolve, reject) => {
              canvas.toBlob((b) => {
                if (!b) reject(new Error('生成背景图失败'));
                else resolve(b);
              }, 'image/png');
            });
            canvasUrl = URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn('Canvas blob conversion failed', e);
        }
      }

      return {
        width,
        height,
        variables,
        guides,
        guideLayers,
        canvasUrl,
        rawVariables: variables,
      };
    },
    [buildBatchImageVariablesFromLayers, extractGuideLayers, extractLooseImageLayers, extractPsdGuides],
  );

  // Helper: Parse PSD (Batch-only, loose mode: do not drop "white/transparent" layers)
  const parsePsd = useCallback(async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      return await parsePsdArrayBuffer(arrayBuffer);
    } catch (e) {
      console.error("Parse failed", e);
      throw e;
    }
  }, [parsePsdArrayBuffer]);

  const parseRemoteTemplatePsd = useCallback(
    async (templateId) => {
      const id = String(templateId || '').trim();
      if (!id) throw new Error('缺少 templateId');
      const { res } = await fetchWithFallback(`/templates/${encodeURIComponent(id)}/source.psd`, { method: 'GET' });
      if (!res.ok) throw new Error(`加载 PSD 失败：HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      return await parsePsdArrayBuffer(arrayBuffer);
    },
    [fetchWithFallback, parsePsdArrayBuffer],
  );

  const rectOfVariable = (v) => {
    const x = Number(v?.x);
    const y = Number(v?.y);
    const w = Number(v?.width);
    const h = Number(v?.height);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
    if (!(w > 0) || !(h > 0)) return null;
    return { x, y, w, h };
  };

  const rectIou = (a, b) => {
    if (!a || !b) return 0;
    const ax2 = a.x + a.w;
    const ay2 = a.y + a.h;
    const bx2 = b.x + b.w;
    const by2 = b.y + b.h;
    const ix1 = Math.max(a.x, b.x);
    const iy1 = Math.max(a.y, b.y);
    const ix2 = Math.min(ax2, bx2);
    const iy2 = Math.min(ay2, by2);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;
    const union = a.w * a.h + b.w * b.h - inter;
    if (!(union > 0)) return 0;
    return inter / union;
  };

  const pickTopmostOverlappingImageVar = (rawVars, seedVar) => {
    const vars = Array.isArray(rawVars) ? rawVars : [];
    if (!seedVar) return null;
    const seedType = String(seedVar?.varType || seedVar?.type || '').toLowerCase();
    if (seedType !== 'img' && seedType !== 'image') return seedVar;
    const seedRect = rectOfVariable(seedVar);
    if (!seedRect) return seedVar;

    const candidates = [];
    for (let i = 0; i < vars.length; i += 1) {
      const v = vars[i];
      const t = String(v?.varType || v?.type || '').toLowerCase();
      if (t !== 'img' && t !== 'image') continue;
      const r = rectOfVariable(v);
      if (!r) continue;
      const iou = rectIou(seedRect, r);
      if (iou < 0.9) continue;
      const z = Number.isFinite(Number(v?.zIndex)) ? Number(v.zIndex) : null;
      candidates.push({ v, i, z, iou });
    }
    if (candidates.length <= 1) return seedVar;
    candidates.sort((a, b) => {
      const az = a.z != null ? a.z : a.i;
      const bz = b.z != null ? b.z : b.i;
      if (az !== bz) return bz - az;
      if (a.iou !== b.iou) return b.iou - a.iou;
      return b.i - a.i;
    });
    return candidates[0]?.v || seedVar;
  };

  const pickDefaultImageVarPsId = useCallback((rawVars) => {
    const vars = Array.isArray(rawVars) ? rawVars : [];
    const imgVars = vars
      .map((v) => {
        const psId = Math.trunc(Number(v?.psId));
        if (!Number.isFinite(psId) || psId <= 0) return null;
        const t = String(v?.varType || v?.type || '').toLowerCase();
        if (t !== 'img' && t !== 'image') return null;
        const w = Number(v?.width) || 0;
        const h = Number(v?.height) || 0;
        const area = w > 0 && h > 0 ? w * h : 0;
        const zIndex = Number.isFinite(Number(v?.zIndex)) ? Number(v.zIndex) : null;
        return { psId, area, zIndex };
      })
      .filter(Boolean);
    if (imgVars.length === 0) return null;
    imgVars.sort((a, b) => {
      const da = (b.area || 0) - (a.area || 0);
      if (da !== 0) return da;
      const az = a.zIndex != null ? a.zIndex : -Infinity;
      const bz = b.zIndex != null ? b.zIndex : -Infinity;
      if (az !== bz) return bz - az;
      return 0;
    });
    return imgVars[0]?.psId ?? null;
  }, []);

  useEffect(() => {
    if (taskMode !== 'template') return;
    const templateId = String(activeTaskTemplateCanvasId || '').trim();
    if (!templateId) return;
    const meta = taskTemplateMetaByTemplateId.get(templateId) || null;
    if (!meta) return;
    const vars = Array.isArray(meta?.variables) ? meta.variables : [];
    const needs =
      vars.length === 0 ||
      !meta?.guides ||
      !meta?.guideLayers ||
      !(Number(meta?.width) > 0) ||
      !(Number(meta?.height) > 0);
    if (!needs) return;
    let cancelled = false;
    (async () => {
      try {
        const parsed = await parseRemoteTemplatePsd(templateId);
        if (cancelled) return;
        setTaskTemplateMetaByTemplateId((prev) => {
          const next = new Map(prev);
          const old = next.get(templateId) || {};
          next.set(templateId, {
            ...old,
            id: String(old?.id || templateId),
            width: Number(parsed?.width) || Number(old?.width) || null,
            height: Number(parsed?.height) || Number(old?.height) || null,
            imageUrl: parsed?.canvasUrl || old?.imageUrl || null,
            guides: parsed?.guides || old?.guides || null,
            guideLayers: parsed?.guideLayers || old?.guideLayers || null,
            variables: Array.isArray(parsed?.variables) ? parsed.variables : Array.isArray(old?.variables) ? old.variables : [],
          });
          return next;
        });
        setTaskTemplateVarsByTemplateId((prev) => {
          const next = new Map(prev);
          const byPsId = new Map();
          const list = Array.isArray(parsed?.variables) ? parsed.variables : [];
          for (let i = 0; i < list.length; i += 1) {
            const v = list[i];
            const psId = Math.trunc(Number(v?.psId));
            if (!Number.isFinite(psId) || psId <= 0) continue;
            byPsId.set(psId, v);
          }
          next.set(templateId, byPsId);
          return next;
        });
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '解析 PSD 失败';
        if (cancelled) return;
        setTaskTemplateMetaByTemplateId((prev) => {
          const next = new Map(prev);
          const old = next.get(templateId) || {};
          next.set(templateId, { ...old, id: String(old?.id || templateId), error: msg });
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTaskTemplateCanvasId, parseRemoteTemplatePsd, taskMode, taskTemplateMetaByTemplateId]);

  const addPsdFiles = useCallback(async (files) => {
    const list = Array.isArray(files) ? files : [];
    const psdListRaw = list.filter((f) => f && /\.psd$/i.test(String(f.name || '')));
    if (psdListRaw.length === 0) return;

    const makeSig = (f) => `${String(f?.name || '').toLowerCase()}__${Number(f?.size || 0)}__${Number(f?.lastModified || 0)}`;
    const existingSigSet = new Set(
      (Array.isArray(psdFiles) ? psdFiles : [])
        .map((p) => p?.file)
        .filter(Boolean)
        .map((f) => makeSig(f)),
    );
    const incomingSigSet = new Set();
    const dupNames = [];
    const psdList = [];
    for (let i = 0; i < psdListRaw.length; i += 1) {
      const f = psdListRaw[i];
      const sig = makeSig(f);
      if (!sig) continue;
      if (existingSigSet.has(sig) || incomingSigSet.has(sig)) {
        dupNames.push(String(f?.name || 'PSD'));
        continue;
      }
      incomingSigSet.add(sig);
      psdList.push(f);
    }
    if (dupNames.length > 0) {
      alert(`已上传过的 PSD 将自动忽略：${dupNames.slice(0, 8).join('、')}${dupNames.length > 8 ? '…' : ''}`);
    }
    if (psdList.length === 0) return;

    const newEntries = psdList.map((f) => ({
      file: f,
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      parsed: null,
      status: 'parsing'
    }));

    setPsdFiles(prev => [...prev, ...newEntries]);
    setExportFormatsByPsdId((prev) => {
      const next = new Map(prev);
      for (let i = 0; i < newEntries.length; i += 1) {
        const it = newEntries[i];
        next.set(String(it.id), defaultExportFormatsFromPsdName(it.name));
      }
      return next;
    });

    // Process queue
    for (const entry of newEntries) {
      try {
        const parsed = await parsePsd(entry.file);
        setPsdFiles(prev => prev.map(p => p.id === entry.id ? { ...p, parsed, status: 'success' } : p));
        const defaultImgPsId = pickDefaultImageVarPsId(parsed?.variables);
        if (defaultImgPsId != null) {
          setSelectedPsIdsByPsdId((prev) => {
            const next = new Map(prev);
            const key = String(entry.id || '');
            const cur = next.get(key);
            if (cur instanceof Set && cur.size > 0) return prev;
            next.set(key, new Set([defaultImgPsId]));
            return next;
          });
        }
        // Set first successful PSD as base if none selected
        setBasePsdId(prev => prev || entry.id);
      } catch (err) { // eslint-disable-line no-unused-vars
        setPsdFiles(prev => prev.map(p => p.id === entry.id ? { ...p, status: 'error' } : p));
      }
    }
  }, [defaultExportFormatsFromPsdName, parsePsd, pickDefaultImageVarPsId, psdFiles]);

  // Handler: PSD Upload
  const handlePsdUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await addPsdFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePsd = useCallback((psdId) => {
    const id = String(psdId || '');
    if (!id) return;
    setPsdFiles((prev) => {
      const next = prev.filter((p) => String(p.id) !== id);
      if (String(basePsdId || '') === id) {
        const nextBase = next.find((p) => p && p.status === 'success')?.id || null;
        setBasePsdId(nextBase);
      }
      return next;
    });
    setSelectedPsIdsByPsdId((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setManualGuidePicksByPsdId((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setExportFormatsByPsdId((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setGenerationResults([]);
    setGenerationProgress({ current: 0, total: 0 });
  }, [basePsdId]);

  const clearAllPsds = useCallback(() => {
    setPsdFiles([]);
    setBasePsdId(null);
    setSelectedPsIdsByPsdId(new Map());
    setActiveHotspotId(null);
    setActiveHotspotIdByPsdId(new Map());
    setGuidePickMode(false);
    setManualGuidePicksByPsdId(new Map());
    setExportFormatsByPsdId(new Map());
    setGenerationResults([]);
    setGenerationProgress({ current: 0, total: 0 });
    setBundleExportResults([]);
    setMissingChannelHints([]);
  }, []);

  const addProductImages = useCallback(async (files) => {
    const list = Array.isArray(files) ? files : [];
    const imgList = list.filter((f) => {
      if (!f) return false;
      const type = String(f.type || '').toLowerCase();
      if (type.startsWith('image/')) return true;
      const name = String(f.name || '');
      return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    });
    if (imgList.length === 0) return;

    const newEntries = imgList.map((f) => {
      const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null;
      return {
        file: f,
        id: Math.random().toString(36).substr(2, 9),
        name: f.name,
        url,
        status: 'loaded',
        serverImagePath: null,
        uploadStatus: 'pending',
        uploadError: null,
      };
    });

    setProductImages(prev => [...prev, ...newEntries]);
    setGenerationResults([]);
    setGenerationProgress({ current: 0, total: 0 });
  }, []);

  const addChannelMaskFiles = useCallback(async (files) => {
    const list = Array.isArray(files) ? files : [];
    const imgList = list.filter((f) => {
      if (!f) return false;
      const name = String(f.name || '');
      return /\.tga$/i.test(name);
    });
    if (list.length > 0 && imgList.length === 0) {
      alert('仅支持上传 .tga 通道文件');
      return;
    }
    if (imgList.length === 0) return;

    const newEntries = imgList.map((f) => ({
      file: f,
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      status: 'loaded',
      uploadStatus: 'pending',
      uploadError: null,
      storedName: null,
    }));

    setChannelMasks((prev) => [...prev, ...newEntries]);
  }, []);

  // Handler: Product Image Upload
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await addProductImages(files);
    if (imgInputRef.current) imgInputRef.current.value = '';
  };

  const handleChannelMaskUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await addChannelMaskFiles(files);
    if (channelInputRef.current) channelInputRef.current.value = '';
  };

  const handlePsdDragEnter = useCallback((e) => {
    if (taskMode !== 'fresh') return;
    e.preventDefault();
    psdDragDepthRef.current += 1;
    setPsdDropActive(true);
  }, [taskMode]);

  const handlePsdDragOver = useCallback((e) => {
    if (taskMode !== 'fresh') return;
    e.preventDefault();
  }, [taskMode]);

  const handlePsdDragLeave = useCallback((e) => {
    if (taskMode !== 'fresh') return;
    e.preventDefault();
    psdDragDepthRef.current = Math.max(0, psdDragDepthRef.current - 1);
    if (psdDragDepthRef.current === 0) setPsdDropActive(false);
  }, [taskMode]);

  const handlePsdDrop = useCallback(async (e) => {
    if (taskMode !== 'fresh') return;
    e.preventDefault();
    psdDragDepthRef.current = 0;
    setPsdDropActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    const psdList = files.filter((f) => f && /\.psd$/i.test(String(f.name || '')));
    if (psdList.length === 0) return alert('请拖入 PSD 文件');
    await addPsdFiles(psdList);
  }, [addPsdFiles, taskMode]);

  const handleImgDragEnter = useCallback((e) => {
    e.preventDefault();
    imgDragDepthRef.current += 1;
    setImgDropActive(true);
  }, []);

  const handleImgDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleImgDragLeave = useCallback((e) => {
    e.preventDefault();
    imgDragDepthRef.current = Math.max(0, imgDragDepthRef.current - 1);
    if (imgDragDepthRef.current === 0) setImgDropActive(false);
  }, []);

  const handleImgDrop = useCallback(async (e) => {
    e.preventDefault();
    imgDragDepthRef.current = 0;
    setImgDropActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    const imgList = files.filter((f) => {
      if (!f) return false;
      const type = String(f.type || '').toLowerCase();
      if (type.startsWith('image/')) return true;
      const name = String(f.name || '');
      return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    });
    if (imgList.length === 0) return alert('请拖入图片文件');
    await addProductImages(imgList);
  }, [addProductImages]);

  const handleChannelDragEnter = useCallback((e) => {
    e.preventDefault();
    channelDragDepthRef.current += 1;
    setChannelDropActive(true);
  }, []);

  const handleChannelDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleChannelDragLeave = useCallback((e) => {
    e.preventDefault();
    channelDragDepthRef.current = Math.max(0, channelDragDepthRef.current - 1);
    if (channelDragDepthRef.current === 0) setChannelDropActive(false);
  }, []);

  const handleChannelDrop = useCallback(async (e) => {
    e.preventDefault();
    channelDragDepthRef.current = 0;
    setChannelDropActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    const list = files.filter((f) => f && /\.tga$/i.test(String(f.name || '')));
    if (list.length === 0) return alert('请拖入 .tga 通道图');
    await addChannelMaskFiles(list);
  }, [addChannelMaskFiles]);

  const taskTemplateVarLabelByPsId = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < taskTemplateItems.length; i += 1) {
      const it = taskTemplateItems[i] || {};
      const templateId = String(it?.templateId || '').trim();
      const vars = taskTemplateVarsByTemplateId.get(templateId);
      const ids = Array.isArray(it?.selectedPsIds) ? it.selectedPsIds : [];
      for (let j = 0; j < ids.length; j += 1) {
        const psId = Math.trunc(Number(ids[j]));
        if (!Number.isFinite(psId) || psId <= 0) continue;
        if (map.has(psId)) continue;
        const v = vars instanceof Map ? vars.get(psId) : null;
        const label = String(v?.label || v?.name || '');
        map.set(psId, label || `psId=${psId}`);
      }
    }
    for (let i = 0; i < taskTemplateUnionPsIds.length; i += 1) {
      const psId = taskTemplateUnionPsIds[i];
      if (map.has(psId)) continue;
      map.set(psId, `psId=${psId}`);
    }
    return map;
  }, [taskTemplateItems, taskTemplateUnionPsIds, taskTemplateVarsByTemplateId]);

  const taskTemplateImageUsageCount = useMemo(() => {
    const cnt = new Map();
    for (let i = 0; i < taskTemplateImageGroups.length; i += 1) {
      const g = taskTemplateImageGroups[i] || {};
      const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
      const keys = Object.keys(assignments);
      for (let j = 0; j < keys.length; j += 1) {
        const imgId = String(assignments[keys[j]] || '');
        if (!imgId) continue;
        cnt.set(imgId, (cnt.get(imgId) || 0) + 1);
      }
    }
    return cnt;
  }, [taskTemplateImageGroups]);

  const handleProductImageDragStart = useCallback((e, imageId) => {
    const id = String(imageId || '');
    if (!id) return;
    const dt = e?.dataTransfer;
    if (!dt || typeof dt.setData !== 'function') return;
    dt.setData('application/x-fdesign-image-id', id);
    dt.setData('text/plain', id);
    dt.effectAllowed = 'copy';
  }, []);

  const setTaskTemplateGroupName = useCallback((groupId, nextName) => {
    const id = String(groupId || '');
    if (!id) return;
    setTaskTemplateGroupsTouched(true);
    setTaskTemplateImageGroups((prev) =>
      prev.map((g) => (String(g?.id || '') === id ? { ...g, name: String(nextName || '') } : g)),
    );
  }, []);

  const assignTaskTemplateGroupImage = useCallback(
    ({ groupId, psId, imageId }) => {
      const gid = String(groupId || '');
      const pid = Math.trunc(Number(psId));
      const imgId = String(imageId || '');
      if (!gid) return;
      if (!Number.isFinite(pid) || pid <= 0) return;
      if (!imgId) return;
      if (!productImageById.has(imgId)) return;
      setTaskTemplateGroupsTouched(true);
      setTaskTemplateImageGroups((prev) =>
        prev.map((g) => {
          if (String(g?.id || '') !== gid) return g;
          const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
          return { ...g, assignments: { ...assignments, [String(pid)]: imgId } };
        }),
      );
    },
    [productImageById],
  );

  const clearTaskTemplateGroupSlot = useCallback((groupId, psId) => {
    const gid = String(groupId || '');
    const pid = Math.trunc(Number(psId));
    if (!gid) return;
    if (!Number.isFinite(pid) || pid <= 0) return;
    setTaskTemplateGroupsTouched(true);
    setTaskTemplateImageGroups((prev) =>
      prev.map((g) => {
        if (String(g?.id || '') !== gid) return g;
        const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
        if (!assignments[String(pid)]) return g;
        const next = { ...assignments };
        delete next[String(pid)];
        return { ...g, assignments: next };
      }),
    );
  }, []);

  const addEmptyTaskTemplateGroup = useCallback(() => {
    const required = taskTemplateUnionPsIds.length;
    if (required === 0) return;
    setTaskTemplateGroupsTouched(true);
    setTaskTemplateImageGroups((prev) => [
      ...prev,
      {
        id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: `组合_${prev.length + 1}`,
        assignments: {},
      },
    ]);
  }, [taskTemplateUnionPsIds.length]);

  const clearAllTaskTemplateGroups = useCallback(() => {
    setTaskTemplateGroupsTouched(true);
    setTaskTemplateImageGroups([]);
  }, []);

  const removeTaskTemplateGroup = useCallback((groupId) => {
    const gid = String(groupId || '');
    if (!gid) return;
    setTaskTemplateGroupsTouched(true);
    setTaskTemplateImageGroups((prev) => prev.filter((g) => String(g?.id || '') !== gid));
  }, []);

  // Derived: Base PSD
  const basePsd = useMemo(() => psdFiles.find(p => p.id === basePsdId), [psdFiles, basePsdId]);
  
  const activeTaskTemplateItem = useMemo(() => {
    const activeId = String(activeTaskTemplateCanvasId || '').trim();
    if (!activeId) return null;
    for (let i = 0; i < taskTemplateItems.length; i += 1) {
      const it = taskTemplateItems[i];
      if (String(it?.templateId || '').trim() === activeId) return it;
    }
    return null;
  }, [activeTaskTemplateCanvasId, taskTemplateItems]);

  const activeTaskTemplateMeta = useMemo(() => {
    const id = String(activeTaskTemplateCanvasId || '').trim();
    if (!id) return null;
    return taskTemplateMetaByTemplateId.get(id) || null;
  }, [activeTaskTemplateCanvasId, taskTemplateMetaByTemplateId]);
  
  const activeTaskTemplateSelectedPsIdSet = useMemo(() => {
    const ids = Array.isArray(activeTaskTemplateItem?.selectedPsIds) ? activeTaskTemplateItem.selectedPsIds : [];
    const set = new Set();
    for (let i = 0; i < ids.length; i += 1) {
      const n = Math.trunc(Number(ids[i]));
      if (!Number.isFinite(n) || n <= 0) continue;
      set.add(n);
    }
    return set;
  }, [activeTaskTemplateItem]);

  const activeTaskTemplateHighlightedHotspotIds = useMemo(() => {
    const vars = Array.isArray(activeTaskTemplateMeta?.variables) ? activeTaskTemplateMeta.variables : [];
    const out = [];
    for (let i = 0; i < vars.length; i += 1) {
      const v = vars[i];
      const psId = Math.trunc(Number(v?.psId));
      if (!Number.isFinite(psId) || psId <= 0) continue;
      if (!activeTaskTemplateSelectedPsIdSet.has(psId)) continue;
      if (v?.id == null) continue;
      out.push(v.id);
    }
    return out;
  }, [activeTaskTemplateMeta, activeTaskTemplateSelectedPsIdSet]);

  const activeTaskTemplateVariable = useMemo(() => {
    const vars = Array.isArray(activeTaskTemplateMeta?.variables) ? activeTaskTemplateMeta.variables : [];
    const id = activeTaskTemplateHotspotId != null ? String(activeTaskTemplateHotspotId) : '';
    if (!id) return null;
    return vars.find((v) => String(v?.id) === id) || null;
  }, [activeTaskTemplateHotspotId, activeTaskTemplateMeta]);

  const activeTaskTemplateGuidePicker = useMemo(() => {
    const psId = Math.trunc(Number(activeTaskTemplateVariable?.psId));
    if (!Number.isFinite(psId) || psId <= 0) return null;
    const picks = activeTaskTemplateItem?.guidePicks && typeof activeTaskTemplateItem.guidePicks === 'object' ? activeTaskTemplateItem.guidePicks : null;
    const gp = picks ? (picks[String(psId)] || picks[psId]) : null;
    const leftX = Number(gp?.leftX);
    const rightX = Number(gp?.rightX);
    if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) return null;
    return { enabled: false, selected: { leftX, rightX } };
  }, [activeTaskTemplateItem, activeTaskTemplateVariable]);

  useEffect(() => {
    if (taskMode !== 'template') return;
    if (!activeTaskTemplateMeta || !activeTaskTemplateItem) return;
    if (activeTaskTemplateHotspotId != null) return;
    const vars = Array.isArray(activeTaskTemplateMeta?.variables) ? activeTaskTemplateMeta.variables : [];
    const pickedPsIds = Array.isArray(activeTaskTemplateItem?.selectedPsIds) ? activeTaskTemplateItem.selectedPsIds : [];
    const firstPsId = pickedPsIds.length > 0 ? Math.trunc(Number(pickedPsIds[0])) : null;
    if (Number.isFinite(firstPsId) && firstPsId > 0) {
      const found = vars.find((v) => Math.trunc(Number(v?.psId)) === firstPsId);
      if (found?.id != null) {
        setActiveTaskTemplateHotspotId(found.id);
        return;
      }
    }
    if (vars.length > 0 && vars[0]?.id != null) {
      setActiveTaskTemplateHotspotId(vars[0].id);
    }
  }, [activeTaskTemplateHotspotId, activeTaskTemplateItem, activeTaskTemplateMeta, taskMode]);

  const [showGuides, setShowGuides] = useState(true);

  useEffect(() => {
    const key = String(basePsdId || '').trim();
    const id = activeHotspotId != null ? String(activeHotspotId) : '';
    if (!key || !id) return;
    const vars = Array.isArray(basePsd?.parsed?.variables) ? basePsd.parsed.variables : [];
    if (vars.length > 0 && !vars.some((v) => String(v?.id) === id)) return;
    setActiveHotspotIdByPsdId((prev) => {
      const next = new Map(prev);
      next.set(key, id);
      return next;
    });
  }, [activeHotspotId, basePsd, basePsdId]);

  const lastBaseRestoreKeyRef = useRef('');
  useEffect(() => {
    const restoreKey = `${String(basePsdId || '')}__${String(basePsd?.status || '')}`;
    if (lastBaseRestoreKeyRef.current === restoreKey) return;
    lastBaseRestoreKeyRef.current = restoreKey;

    setGuidePickMode(false);
    if (!basePsdId || !basePsd || basePsd.status !== 'success' || !basePsd.parsed) {
      setActiveHotspotId(null);
      return;
    }

    const vars = Array.isArray(basePsd.parsed.variables) ? basePsd.parsed.variables : [];
    const key = String(basePsdId || '').trim();
    const savedId = key ? String(activeHotspotIdByPsdId.get(key) || '').trim() : '';
    if (savedId && vars.some((v) => String(v?.id) === savedId)) {
      setActiveHotspotId(savedId);
      return;
    }

    const selectedSetRaw = selectedPsIdsByPsdId.get(key);
    const selectedSet = selectedSetRaw instanceof Set ? selectedSetRaw : new Set();
    if (selectedSet.size > 0) {
      const found = vars.find((v) => {
        const t = String(v?.varType || v?.type || '').toLowerCase();
        if (t !== 'img' && t !== 'image') return false;
        const psId = Number(v?.psId);
        return Number.isFinite(psId) && selectedSet.has(psId);
      });
      if (found?.id != null) {
        setActiveHotspotId(String(found.id));
        return;
      }
    }

    const firstImg = vars.find((v) => {
      const t = String(v?.varType || v?.type || '').toLowerCase();
      return (t === 'img' || t === 'image') && v?.id != null;
    });
    if (firstImg?.id != null) {
      setActiveHotspotId(String(firstImg.id));
      return;
    }
    if (vars[0]?.id != null) setActiveHotspotId(String(vars[0].id));
  }, [activeHotspotIdByPsdId, basePsd, basePsdId, selectedPsIdsByPsdId]);

  useEffect(() => {
    if (!showGuides) setGuidePickMode(false);
  }, [showGuides]);

  const selectedPsIdSetForBasePsd = useMemo(() => {
    if (!basePsdId) return new Set();
    const set = selectedPsIdsByPsdId.get(basePsdId);
    return set instanceof Set ? set : new Set();
  }, [basePsdId, selectedPsIdsByPsdId]);

  const activeVariable = useMemo(() => {
    const vars = Array.isArray(basePsd?.parsed?.variables) ? basePsd.parsed.variables : [];
    const id = activeHotspotId != null ? String(activeHotspotId) : '';
    if (!id) return null;
    return vars.find((v) => String(v?.id) === id) || null;
  }, [activeHotspotId, basePsd]);

  const activeVariablePsId = useMemo(() => {
    const psId = Number(activeVariable?.psId);
    return Number.isFinite(psId) ? psId : null;
  }, [activeVariable]);

  useEffect(() => {
    if (!isPickDebugEnabled) return;
    const byPsd = basePsdId ? manualGuidePicksByPsdId.get(basePsdId) : null;
    const countByPsd = byPsd instanceof Map ? byPsd.size : 0;
    const activePick = basePsdId && Number.isFinite(activeVariablePsId) && byPsd instanceof Map ? byPsd.get(activeVariablePsId) : null;
    console.log('[参考线绑定调试] manualGuidePicksByPsdId 更新', {
      psdCount: manualGuidePicksByPsdId.size,
      basePsdId,
      baseCount: countByPsd,
      activeVariablePsId,
      activePick,
    });
  }, [activeVariablePsId, basePsdId, isPickDebugEnabled, manualGuidePicksByPsdId]);

  const activeIsImageVariable = useMemo(() => {
    const t = String(activeVariable?.varType || activeVariable?.type || '').toLowerCase();
    return t === 'img' || t === 'image';
  }, [activeVariable]);

  const activeGuidePickDraft = useMemo(() => {
    if (!basePsdId) return null;
    if (!Number.isFinite(activeVariablePsId)) return null;
    const byPsd = manualGuidePicksByPsdId.get(basePsdId);
    if (!(byPsd instanceof Map)) return null;
    const raw = byPsd.get(activeVariablePsId) || null;
    if (!raw || typeof raw !== 'object') return null;
    const leftX = Number.isFinite(Number(raw.leftX)) ? Math.round(Number(raw.leftX)) : null;
    const rightX = Number.isFinite(Number(raw.rightX)) ? Math.round(Number(raw.rightX)) : null;
    if (leftX == null && rightX == null) return null;
    return { leftX, rightX };
  }, [activeVariablePsId, basePsdId, manualGuidePicksByPsdId]);

  const activeGuidePick = useMemo(() => {
    const leftX = activeGuidePickDraft?.leftX ?? null;
    const rightX = activeGuidePickDraft?.rightX ?? null;
    if (!Number.isFinite(Number(leftX)) || !Number.isFinite(Number(rightX))) return null;
    if (Number(rightX) <= Number(leftX)) return null;
    return { leftX: Number(leftX), rightX: Number(rightX) };
  }, [activeGuidePickDraft]);

  const guidePicker = useMemo(() => {
    if (!showGuides) return null;
    if (!activeIsImageVariable) return null;
    if (!activeVariable || !Number.isFinite(activeVariablePsId)) return null;
    if (!guidePickMode) {
      if (!activeGuidePickDraft) return null;
      return { enabled: false, selected: { ...activeGuidePickDraft } };
    }
    const x = Number(activeVariable?.x);
    const w = Number(activeVariable?.width);
    if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 1) return null;
    const rect = { left: Math.round(x), right: Math.round(x + w) };
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right) || rect.right <= rect.left) return null;
    const sources = [];
    if (guidePickSources?.native) sources.push('native');
    if (guidePickSources?.layer) sources.push('layer');
    if (sources.length === 0) sources.push('native', 'layer');

    const selected = activeGuidePickDraft ? { ...activeGuidePickDraft } : {};
    return {
      enabled: true,
      debug: isPickDebugEnabled,
      rect,
      selected,
      sources,
      onPick: (pickedX) => {
        const px = Math.round(Number(pickedX));
        if (!Number.isFinite(px)) return;
        setManualGuidePicksByPsdId((prev) => {
          if (isPickDebugEnabled) {
            const byPsdPrev = basePsdId ? prev.get(basePsdId) : null;
            const byPsdCount = byPsdPrev instanceof Map ? byPsdPrev.size : 0;
            const prevPick =
              byPsdPrev instanceof Map && Number.isFinite(activeVariablePsId) ? (byPsdPrev.get(activeVariablePsId) || null) : null;
            console.log('[参考线绑定调试] onPick 调用', {
              basePsdId,
              activeVariablePsId,
              pickedX: px,
              byPsdCount,
              prevPick,
            });
          }
          const next = new Map(prev);
          const byPsdPrev = next.get(basePsdId);
          const byPsd = byPsdPrev instanceof Map ? new Map(byPsdPrev) : new Map();
          const prevPick = byPsd.get(activeVariablePsId) || null;
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

          byPsd.set(activeVariablePsId, { leftX, rightX });
          next.set(basePsdId, byPsd);
          if (isPickDebugEnabled) {
            console.log('[参考线绑定调试] onPick 写入后', {
              basePsdId,
              activeVariablePsId,
              leftX,
              rightX,
              byPsdCount: byPsd.size,
              saved: byPsd.get(activeVariablePsId) || null,
            });
          }
          return next;
        });
      },
    };
  }, [
    activeGuidePickDraft,
    activeIsImageVariable,
    activeVariable,
    activeVariablePsId,
    basePsdId,
    guidePickMode,
    guidePickSources,
    isPickDebugEnabled,
    showGuides,
  ]);

  const selectedVariableBadgesForBasePsd = useMemo(() => {
    if (!basePsd?.parsed?.variables || selectedPsIdSetForBasePsd.size === 0) return [];
    const variables = basePsd.parsed.variables;
    const selectedVars = [];
    for (let i = 0; i < variables.length; i += 1) {
      const v = variables[i];
      const psId = Number(v?.psId);
      if (!Number.isFinite(psId)) continue;
      if (!selectedPsIdSetForBasePsd.has(psId)) continue;
      selectedVars.push(v);
    }
    if (selectedVars.length === 0) return [];

    const manual = manualGuidePicksByPsdId.get(basePsdId);
    const resolved = resolveGuidePickByRect({ variables, manualGuidePicksByPsId: manual, tolerancePx: 2 });

    const out = [];
    for (let i = 0; i < selectedVars.length; i += 1) {
      const v = selectedVars[i];
      const psId = Number(v?.psId);
      if (!Number.isFinite(psId)) continue;
      out.push({
        psId,
        name: String(v?.name || ''),
        hasGuidePick: Boolean(resolved.get(psId)),
      });
    }
    return out;
  }, [basePsd, basePsdId, manualGuidePicksByPsdId, selectedPsIdSetForBasePsd]);

  const totalSelectedVariableCount = useMemo(() => {
    let sum = 0;
    for (const set of selectedPsIdsByPsdId.values()) {
      if (set instanceof Set) sum += set.size;
    }
    return sum;
  }, [selectedPsIdsByPsdId]);

  const selectedCountByPsdId = useMemo(() => {
    const out = {};
    for (const [psdId, set] of selectedPsIdsByPsdId.entries()) {
      out[psdId] = set instanceof Set ? set.size : 0;
    }
    return out;
  }, [selectedPsIdsByPsdId]);

  const hasGuidePickByPsdId = useMemo(() => {
    const varsById = new Map();
    psdFiles.forEach((p) => {
      if (!p || p.status !== 'success') return;
      varsById.set(p.id, Array.isArray(p?.parsed?.variables) ? p.parsed.variables : []);
    });
    const out = {};
    for (const [psdId, set] of selectedPsIdsByPsdId.entries()) {
      if (!(set instanceof Set) || set.size === 0) {
        out[psdId] = false;
        continue;
      }
      const vars = varsById.get(psdId) || [];
      const manual = manualGuidePicksByPsdId.get(psdId);
      const resolved = resolveGuidePickByRect({ variables: vars, manualGuidePicksByPsId: manual, tolerancePx: 2 });
      let ok = false;
      for (const psId of set.values()) {
        const n = Number(psId);
        if (!Number.isFinite(n)) continue;
        if (resolved.get(n)) {
          ok = true;
          break;
        }
      }
      out[psdId] = ok;
    }
    return out;
  }, [manualGuidePicksByPsdId, psdFiles, selectedPsIdsByPsdId]);

  // Handler: Toggle Variable
  const toggleVariable = (varId) => {
    if (!basePsd?.parsed) return;
    if (!varId) {
      setActiveHotspotId(null);
      return;
    }
    const variable = basePsd.parsed.variables.find((v) => String(v?.id) === String(varId));
    if (!variable) return;

    const varType = String(variable?.varType || variable?.type || '').toLowerCase();
    if (varType !== 'img' && varType !== 'image') return;

    const vars = Array.isArray(basePsd?.parsed?.variables) ? basePsd.parsed.variables : [];
    const pickedVar = pickTopmostOverlappingImageVar(vars, variable) || variable;
    const nextHotspotId = pickedVar?.id != null ? String(pickedVar.id) : String(varId);
    setActiveHotspotId(nextHotspotId);

    const psId = Number(pickedVar?.psId);
    if (!Number.isFinite(psId)) return;

    setSelectedPsIdsByPsdId((prev) => {
      const next = new Map(prev);
      const key = basePsdId;
      if (!key) return next;
      const current = next.get(key) instanceof Set ? new Set(next.get(key)) : new Set();
      if (current.size === 1 && current.has(psId)) {
        next.set(key, current);
        return next;
      }
      next.set(key, new Set([psId]));
      return next;
    });
  };

  const ensurePsdsUploaded = async ({ psds, batchId }) => {
    const list = Array.isArray(psds) ? psds : [];
    const psdMap = new Map();
    const uploadErrorMap = new Map();
    let uploadSuccess = 0;
    let uploadFailed = 0;

    for (const psd of list) {
      if (psd.serverTemplateId) {
        psdMap.set(psd.id, psd.serverTemplateId);
        continue;
      }

      try {
        perfRef.current.uploads.set(psd.id, { start: now(), name: psd.name });
        setPsdFiles((prev) => prev.map((p) => (p.id === psd.id ? { ...p, uploadStatus: 'uploading', uploadError: null } : p)));
        const createFormData = () => {
          const formData = new FormData();
          formData.append('psd', psd.file);
          return formData;
        };

        const maxAttempts = 4;
        let lastErr = null;
        let res = null;
        let meta = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const ingestTemp = await fetchWithFallback('/api/template/ingest-temp', {
              method: 'POST',
              body: createFormData(),
            });
            res = ingestTemp.res;
            meta = ingestTemp.meta;
            if (res.status === 404) {
              const ingestFallback = await fetchWithFallback('/api/template/ingest', {
                method: 'POST',
                body: createFormData(),
              });
              res = ingestFallback.res;
              meta = {
                url: ingestFallback.meta?.url || meta?.url,
                attempts: [...(meta?.attempts || []), ...(ingestFallback.meta?.attempts || [])],
              };
            }

            const data = await readJsonSafely(res);
            if (!res.ok) {
              const msg = data?.message || data?.error || `HTTP ${res.status}`;
              const err = new Error(String(msg || '上传失败'));
              err.httpStatus = res.status;
              err.server = data;
              err.attempts = meta?.attempts;
              throw err;
            }
            if (!data || data.success !== true || !data.id) {
              throw new Error('服务端未返回有效的模板编号');
            }

            psdMap.set(psd.id, data.id);
            uploadSuccess += 1;
            setPsdFiles((prev) =>
              prev.map((p) => (p.id === psd.id ? { ...p, serverTemplateId: data.id, uploadStatus: 'success', uploadError: null } : p)),
            );
            const cost = Math.round(now() - (perfRef.current.uploads.get(psd.id)?.start || now()));
            console.info('[性能] 批量生成上传完成', { 批次: batchId, PSD: psd.name, 耗时: cost, 模板ID: data.id });
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            if (attempt >= maxAttempts || !isRetryableUploadError(e)) break;
            console.warn('[warn] PSD 上传失败，准备重试', { 批次: batchId, PSD: psd.name, 尝试: attempt, 错误: e?.message || String(e) });
            await sleepMs(1500 * attempt);
          }
        }
        if (lastErr) throw lastErr;

      } catch (e) {
        const msg = e && e.message ? String(e.message) : '上传失败';
        uploadErrorMap.set(psd.id, msg);
        setPsdFiles((prev) => prev.map((p) => (p.id === psd.id ? { ...p, uploadStatus: 'error', uploadError: msg } : p)));
        console.error(`上传 PSD 失败：${psd.name}`, e);
        uploadFailed += 1;
      } finally {
        advanceGenerationProgress(1, '上传PSD');
      }
    }

    return { psdMap, uploadErrorMap, uploadSuccess, uploadFailed };
  };

  const ensureProductImagesUploaded = async ({ images, batchId }) => {
    const list = Array.isArray(images) ? images : [];
    const toUpload = list.filter((img) => img && img.file && !img.serverImagePath);
    if (toUpload.length === 0) {
      const out = new Map();
      list.forEach((img) => {
        if (img?.id && img?.serverImagePath) out.set(img.id, img.serverImagePath);
      });
      return out;
    }

    const targetIds = new Set(toUpload.map((img) => img.id));
    setProductImages((prev) =>
      prev.map((p) => (targetIds.has(p.id) ? { ...p, uploadStatus: 'uploading', uploadError: null } : p)),
    );

    const uploadedMap = new Map();
    const pendingChunks = chunkArray(toUpload, 50);
    while (pendingChunks.length > 0) {
      const chunk = pendingChunks.shift();
      if (!Array.isArray(chunk) || chunk.length === 0) continue;
      const createFormData = () => {
        const formData = new FormData();
        formData.append('batchId', String(batchId || '').trim());
        chunk.forEach((img) => {
          const original = String(img?.name || 'image');
          formData.append('images', img.file, `cid_${img.id}__${original}`);
        });
        return formData;
      };

      const maxAttempts = 4;
      let lastErr = null;
      let data = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const { res } = await fetchWithFallback('/api/assets/upload-images', {
            method: 'POST',
            body: createFormData(),
          });
          data = await readJsonSafely(res);
          if (!res.ok) {
            const msg = data?.message || data?.error || `HTTP ${res.status}`;
            const err = new Error(String(msg || '上传产品图失败'));
            err.httpStatus = res.status;
            err.server = data;
            throw err;
          }
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt >= maxAttempts || !isRetryableUploadError(e)) break;
          console.warn('[warn] 产品图上传失败，准备重试', { 批次: batchId, 数量: chunk.length, 尝试: attempt, 错误: e?.message || String(e) });
          await sleepMs(1200 * attempt);
        }
      }

      if (lastErr) {
        if (chunk.length > 1 && isRetryableUploadError(lastErr)) {
          const mid = Math.ceil(chunk.length / 2);
          pendingChunks.unshift(chunk.slice(mid), chunk.slice(0, mid));
          continue;
        }
        const only = chunk[0];
        if (only?.id != null) {
          setProductImages((prev) =>
            prev.map((p) => (p.id === only.id ? { ...p, uploadStatus: 'error', uploadError: lastErr?.message || '上传失败' } : p)),
          );
        }
        advanceGenerationProgress(chunk.length, '上传产品图');
        continue;
      }

      const imagesRes = Array.isArray(data?.images) ? data.images : [];
      const map = new Map();
      imagesRes.forEach((it) => {
        const cid = it?.clientId != null ? String(it.clientId) : '';
        const p = it?.imagePath != null ? String(it.imagePath) : '';
        if (cid && p) map.set(cid, p);
      });
      chunk.forEach((img) => {
        const p = map.get(String(img.id));
        if (p) uploadedMap.set(img.id, p);
      });

      setProductImages((prev) =>
        prev.map((p) => {
          if (!targetIds.has(p.id)) return p;
          const nextPath = uploadedMap.get(p.id);
          if (!nextPath) return p;
          return { ...p, serverImagePath: nextPath, uploadStatus: 'success', uploadError: null };
        }),
      );
      advanceGenerationProgress(chunk.length, '上传产品图');
    }

    setProductImages((prev) =>
      prev.map((p) => {
        if (!targetIds.has(p.id)) return p;
        if (uploadedMap.has(p.id)) return p;
        return { ...p, uploadStatus: 'error', uploadError: '上传失败' };
      }),
    );

    const missing = toUpload.filter((img) => !uploadedMap.has(img.id));
    if (missing.length > 0) {
      throw new Error(`存在产品图上传失败：${missing.slice(0, 5).map((i) => i.name).join('、')}${missing.length > 5 ? '…' : ''}`);
    }

    return uploadedMap;
  };

  const ensureChannelMasksUploaded = async ({ masks }) => {
    const list = Array.isArray(masks) ? masks : [];
    const toUpload = list.filter((m) => m && m.file && m.uploadStatus !== 'success');
    if (toUpload.length === 0) return new Map();

    const targetIds = new Set(toUpload.map((m) => m.id));
    setChannelMasks((prev) =>
      prev.map((p) => (targetIds.has(p.id) ? { ...p, uploadStatus: 'uploading', uploadError: null } : p)),
    );

    const uploadedMap = new Map();
    const pendingChunks = chunkArray(toUpload, 50);
    while (pendingChunks.length > 0) {
      const chunk = pendingChunks.shift();
      if (!Array.isArray(chunk) || chunk.length === 0) continue;

      const createFormData = () => {
        const formData = new FormData();
        chunk.forEach((m) => {
          const original = String(m?.name || 'channel');
          formData.append('channels', m.file, `cid_${m.id}__${original}`);
        });
        return formData;
      };

      const maxAttempts = 4;
      let lastErr = null;
      let data = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const { res } = await fetchWithFallback('/api/assets/upload-channel-masks', {
            method: 'POST',
            body: createFormData(),
          });
          data = await readJsonSafely(res);
          if (!res.ok) {
            const msg = data?.message || data?.error || `HTTP ${res.status}`;
            const err = new Error(String(msg || '上传通道图失败'));
            err.httpStatus = res.status;
            err.server = data;
            throw err;
          }
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt >= maxAttempts || !isRetryableUploadError(e)) break;
          console.warn('[warn] 通道图上传失败，准备重试', { 数量: chunk.length, 尝试: attempt, 错误: e?.message || String(e) });
          await sleepMs(1200 * attempt);
        }
      }

      if (lastErr) {
        if (chunk.length > 1 && isRetryableUploadError(lastErr)) {
          const mid = Math.ceil(chunk.length / 2);
          pendingChunks.unshift(chunk.slice(mid), chunk.slice(0, mid));
          continue;
        }
        const only = chunk[0];
        if (only?.id != null) {
          setChannelMasks((prev) =>
            prev.map((p) => (p.id === only.id ? { ...p, uploadStatus: 'error', uploadError: lastErr?.message || '上传失败' } : p)),
          );
        }
        advanceGenerationProgress(chunk.length, '上传通道图');
        continue;
      }

      const channelsRes = Array.isArray(data?.channels) ? data.channels : [];
      const map = new Map();
      channelsRes.forEach((it) => {
        const cid = it?.clientId != null ? String(it.clientId) : '';
        const storedName = it?.storedName != null ? String(it.storedName) : '';
        if (cid && storedName) map.set(cid, storedName);
      });
      chunk.forEach((m) => {
        const storedName = map.get(String(m.id));
        if (storedName) uploadedMap.set(m.id, storedName);
      });

      setChannelMasks((prev) =>
        prev.map((p) => {
          if (!targetIds.has(p.id)) return p;
          const storedName = uploadedMap.get(p.id);
          if (!storedName) return p;
          return { ...p, storedName, uploadStatus: 'success', uploadError: null };
        }),
      );
      advanceGenerationProgress(chunk.length, '上传通道图');
    }

    setChannelMasks((prev) =>
      prev.map((p) => {
        if (!targetIds.has(p.id)) return p;
        if (uploadedMap.has(p.id)) return p;
        return { ...p, uploadStatus: 'error', uploadError: '上传失败' };
      }),
    );

    const missing = toUpload.filter((m) => !uploadedMap.has(m.id));
    if (missing.length > 0) {
      throw new Error(`存在通道图上传失败：${missing.slice(0, 5).map((i) => i.name).join('、')}${missing.length > 5 ? '…' : ''}`);
    }

    return uploadedMap;
  };

  const runCutoutComposeForPng = useCallback(
    async ({ images, uploadedImagePathById, targets, masks, requestMode }) => {
      const list = Array.isArray(images) ? images : [];
      const map = uploadedImagePathById instanceof Map ? uploadedImagePathById : new Map();
      const imagesWithServerPath = list.map((img) => ({
        ...img,
        serverImagePath: img?.serverImagePath || map.get(img?.id) || null,
      }));
      const masksForReq = Array.isArray(masks) ? masks : channelMasks;
      const mode = String(requestMode || 'fresh').toLowerCase() === 'template' ? 'template' : 'fresh';

      const req = buildCutoutNoPsdRequest({
        taskMode: mode,
        productImages: imagesWithServerPath,
        channelMasks: masksForReq,
        taskTemplateUnionPsIds,
        taskTemplateImageGroups,
        resizeMode: 'exact',
      });

      const byPath = new Map();
      imagesWithServerPath.forEach((img) => {
        const p = String(img?.serverImagePath || '').trim();
        if (!p) return;
        byPath.set(p, img);
      });

      const targetList = Array.isArray(targets) ? targets : [];
      if (targetList.length === 0) throw new Error('缺少 PSD 画布与参考线绑定信息');

      const compositions = [];
      for (let ti = 0; ti < targetList.length; ti += 1) {
        const t = targetList[ti] || {};
        const templateKey = String(t.templateKey || '').trim();
        if (!templateKey) continue;
        const canvasWidth = Math.floor(Number(t.canvasWidth));
        const canvasHeight = Math.floor(Number(t.canvasHeight));
        const guideLeftX = Math.round(Number(t.guideLeftX));
        const guideRightX = Math.round(Number(t.guideRightX));
        if (!(canvasWidth > 0) || !(canvasHeight > 0)) continue;
        if (!Number.isFinite(guideLeftX) || !Number.isFinite(guideRightX) || guideRightX <= guideLeftX) continue;
        for (let imageIndex = 0; imageIndex < req.images.length; imageIndex += 1) {
          compositions.push({ templateKey, canvasWidth, canvasHeight, guideLeftX, guideRightX, imageIndex });
        }
      }
      if (compositions.length === 0) throw new Error('无可用的 compositions（请先为每个 PSD 绑定参考线）');

      const { res } = await fetchWithFallback('/api/cutout/batch-no-psd-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, compositions }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const missing = Array.isArray(data?.missingChannels) ? data.missingChannels : [];
        if (missing.length > 0) setMissingChannelHints(missing);
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        throw new Error(String(msg || '无PSD抠图失败'));
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const byKey = new Map();
      results.forEach((r) => {
        if (!r) return;
        const k = `${String(r.templateKey ?? '')}__${String(r.imageIndex ?? '')}`;
        byKey.set(k, r);
      });

      const outRows = [];
      for (let ti = 0; ti < targetList.length; ti += 1) {
        const t = targetList[ti] || {};
        const templateKey = String(t.templateKey || '').trim();
        if (!templateKey) continue;
        const psdName = String(t.psdName || templateKey);
        for (let imageIndex = 0; imageIndex < req.images.length; imageIndex += 1) {
          const row = req.images[imageIndex];
          const origin = byPath.get(String(row?.imagePath || '').trim()) || null;
          const imgName = origin?.name ? String(origin.name) : String(row?.sourceName || `image_${imageIndex + 1}`);
          const imgId = origin?.id ? String(origin.id) : `cutout_${imageIndex}`;
          const r = byKey.get(`${templateKey}__${String(imageIndex)}`) || null;
          if (r && r.ok === true && r.url) {
            outRows.push({
              psdId: templateKey,
              psdName,
              imgId,
              imgName,
              imgUrl: origin?.url || null,
              serverImagePath: origin?.serverImagePath || row?.imagePath || null,
              status: 'success',
              formatResults: { png: { status: 'success', url: String(r.url), error: null } },
            });
          } else {
            const errMsg =
              r && Array.isArray(r.errors) && r.errors.length > 0
                ? String(r.errors[0]?.message || '抠图合成失败')
                : '抠图合成失败';
            outRows.push({
              psdId: templateKey,
              psdName,
              imgId,
              imgName,
              imgUrl: origin?.url || null,
              serverImagePath: origin?.serverImagePath || row?.imagePath || null,
              status: 'error',
              error: errMsg,
              formatResults: { png: { status: 'error', url: null, error: errMsg } },
            });
          }
        }
      }
      return outRows;
    },
    [channelMasks, fetchWithFallback, readJsonSafely, taskTemplateImageGroups, taskTemplateUnionPsIds],
  );

  const runCutoutComposeForPngByTemplateGroups = useCallback(
    async ({ exportGroups, targets, masks, uploadedImagePathById }) => {
      const groups = Array.isArray(exportGroups) ? exportGroups : [];
      const targetList = Array.isArray(targets) ? targets : [];
      if (groups.length === 0) throw new Error('缺少分组信息');
      if (targetList.length === 0) throw new Error('缺少 PSD 画布与参考线绑定信息');

      const uploadedMap = uploadedImagePathById instanceof Map ? uploadedImagePathById : new Map();
      const productById = new Map();
      (Array.isArray(productImages) ? productImages : []).forEach((img) => {
        const id = String(img?.id || '').trim();
        if (!id) return;
        productById.set(id, img);
      });

      const masksForReq = Array.isArray(masks) ? masks : channelMasks;
      const channels = (Array.isArray(masksForReq) ? masksForReq : []).map((m) => {
        const storedName = String(m?.storedName || '').trim();
        if (!storedName) throw new Error('通道图未上传或缺少 storedName');
        const sourceName = String(m?.name || m?.originalName || storedName).trim();
        return { storedName, sourceName };
      });
      if (channels.length === 0) throw new Error('缺少通道图');

      const outRows = [];
      for (let ti = 0; ti < targetList.length; ti += 1) {
        const t = targetList[ti] || {};
        const templateKey = String(t.templateKey || '').trim();
        if (!templateKey) continue;
        const canvasWidth = Math.floor(Number(t.canvasWidth));
        const canvasHeight = Math.floor(Number(t.canvasHeight));
        const guideLeftX = Math.round(Number(t.guideLeftX));
        const guideRightX = Math.round(Number(t.guideRightX));
        const boundPsId = Math.trunc(Number(t.boundPsId));
        if (!(canvasWidth > 0) || !(canvasHeight > 0)) continue;
        if (!Number.isFinite(guideLeftX) || !Number.isFinite(guideRightX) || guideRightX <= guideLeftX) continue;
        if (!Number.isFinite(boundPsId) || boundPsId <= 0) {
          throw new Error(`PNG 参考线绑定缺少 boundPsId：${templateKey}`);
        }

        const reqImages = [];
        const indexToGroup = [];
        for (let gi = 0; gi < groups.length; gi += 1) {
          const g = groups[gi] || {};
          const groupId = String(g?.id || '').trim() || `g_${gi + 1}`;
          const groupName = String(g?.name || `组合_${gi + 1}`);
          const assignments = g?.assignments && typeof g.assignments === 'object' ? g.assignments : {};
          const imageId = String(assignments[String(boundPsId)] || '').trim();
          if (!imageId) {
            throw new Error(`分组缺少 PNG 主变量图片：${groupName}`);
          }
          const img = productById.get(imageId) || null;
          const serverImagePath = String(img?.serverImagePath || uploadedMap.get(imageId) || '').trim();
          if (!serverImagePath) {
            throw new Error(`产品图未上传或缺少 serverImagePath：${img?.name ? String(img.name) : imageId}`);
          }
          const sourceName = String(img?.name || imageId).trim() || imageId;
          reqImages.push({ imagePath: serverImagePath, sourceName });
          indexToGroup.push({
            groupId,
            groupName,
            imgUrl: img?.url || null,
            serverImagePath,
          });
        }

        const compositions = indexToGroup.map((_row, idx) => ({
          templateKey,
          imageIndex: idx,
          canvasWidth,
          canvasHeight,
          guideLeftX,
          guideRightX,
        }));

        const { res } = await fetchWithFallback('/api/cutout/batch-no-psd-compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: reqImages, channels, resizeMode: 'exact', compositions }),
        });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(String(msg || '无PSD抠图失败'));
        }

        const results = Array.isArray(data?.results) ? data.results : [];
        const byIdx = new Map();
        results.forEach((r) => {
          const idx = Math.floor(Number(r?.imageIndex));
          if (!Number.isFinite(idx) || idx < 0) return;
          byIdx.set(idx, r);
        });

        for (let i = 0; i < indexToGroup.length; i += 1) {
          const row = indexToGroup[i];
          const r = byIdx.get(i) || null;
          const ok = r && r.ok === true && r.url;
          const url = ok ? String(r.url) : null;
          const errMsg =
            !ok && r && Array.isArray(r.errors) && r.errors.length > 0
              ? String(r.errors[0]?.message || '抠图合成失败')
              : (!ok ? '抠图合成失败' : null);
          outRows.push({
            psdId: templateKey,
            psdName: String(t.psdName || templateKey),
            imgId: row.groupId,
            imgName: row.groupName,
            imgUrl: row.imgUrl,
            serverImagePath: row.serverImagePath,
            status: ok ? 'success' : 'error',
            error: ok ? null : errMsg,
            formatResults: { png: { status: ok ? 'success' : 'error', url, error: ok ? null : errMsg } },
          });
        }
      }

      if (outRows.length === 0) throw new Error('无可用 PNG 导出任务');
      return outRows;
    },
    [channelMasks, fetchWithFallback, productImages, readJsonSafely],
  );

  const buildFreshPngTargets = useCallback(
    (psds) => {
      const list = Array.isArray(psds) ? psds : [];
      const out = [];
      for (let i = 0; i < list.length; i += 1) {
        const psd = list[i] || {};
        const psdId = String(psd?.id || '').trim();
        const parsed = psd?.parsed || null;
        if (!psdId || !parsed) continue;
        const vars = Array.isArray(parsed?.variables) ? parsed.variables : [];
        const imgVarPsIds = vars
          .filter((v) => String(v?.varType || v?.type || '').toLowerCase() === 'img')
          .map((v) => Math.trunc(Number(v?.psId)))
          .filter((n) => Number.isFinite(n) && n > 0);
        const selectedSet = selectedPsIdsByPsdId.get(psdId);
        const selected = selectedSet instanceof Set ? selectedSet : new Set();
        const selectedImgPsIds = imgVarPsIds.filter((psId) => selected.has(psId));
        const byPsd = manualGuidePicksByPsdId.get(psdId);
        const picks = byPsd instanceof Map ? byPsd : new Map();
        if (selectedImgPsIds.length === 0) {
          const autoBound = imgVarPsIds.filter((psId) => {
            const gp = picks.get(psId) || null;
            const leftX = Number(gp?.leftX);
            const rightX = Number(gp?.rightX);
            return Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX;
          });
          if (autoBound.length === 1) {
            selectedImgPsIds.push(autoBound[0]);
          } else {
            throw new Error(`PNG 导出需要选择图片变量并绑定参考线：${String(psd?.name || psdId)}`);
          }
        }
        const bound = selectedImgPsIds.filter((psId) => {
          const gp = picks.get(psId) || null;
          const leftX = Number(gp?.leftX);
          const rightX = Number(gp?.rightX);
          return Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX;
        });
        if (bound.length !== 1) {
          throw new Error(`PNG 导出每个 PSD 需要且仅需要 1 个“已绑定参考线”的图片变量：${String(psd?.name || psdId)}`);
        }
        const gp = picks.get(bound[0]) || null;
        out.push({
          templateKey: psdId,
          psdName: String(psd?.name || psdId).replace(/\.psd$/i, ''),
          canvasWidth: Math.floor(Number(parsed?.width) || 0),
          canvasHeight: Math.floor(Number(parsed?.height) || 0),
          guideLeftX: Math.round(Number(gp?.leftX)),
          guideRightX: Math.round(Number(gp?.rightX)),
        });
      }
      if (out.length === 0) throw new Error('PNG 导出需要至少 1 个已解析的 PSD');
      return out;
    },
    [manualGuidePicksByPsdId, selectedPsIdsByPsdId],
  );

  const buildTemplatePngTargets = useCallback(
    (items) => {
      const list = Array.isArray(items) ? items : [];
      const out = [];
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i] || {};
        const templateId = String(it?.templateId || '').trim();
        if (!templateId) continue;
        const meta = taskTemplateMetaByTemplateId.get(templateId) || null;
        const cw = Math.floor(Number(meta?.width) || 0);
        const ch = Math.floor(Number(meta?.height) || 0);
        if (!(cw > 0) || !(ch > 0)) {
          throw new Error(`模板 PSD 未解析出画布尺寸：${templateId}`);
        }
        const picked = Array.isArray(it?.selectedPsIds) ? it.selectedPsIds : [];
        const psIds = picked.map((n) => Math.trunc(Number(n))).filter((n) => Number.isFinite(n) && n > 0);
        const picks = it?.guidePicks && typeof it.guidePicks === 'object' ? it.guidePicks : null;
        if (psIds.length === 0 && picks) {
          const autoBoundKeys = Object.keys(picks).filter((k) => {
            const psId = Math.trunc(Number(k));
            if (!Number.isFinite(psId) || psId <= 0) return false;
            const gp = picks[String(psId)] || picks[psId] || null;
            const leftX = Number(gp?.leftX);
            const rightX = Number(gp?.rightX);
            return Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX;
          });
          if (autoBoundKeys.length === 1) {
            psIds.push(Math.trunc(Number(autoBoundKeys[0])));
          }
        }
        const bound = psIds.filter((psId) => {
          const gp = picks ? (picks[String(psId)] || picks[psId]) : null;
          const leftX = Number(gp?.leftX);
          const rightX = Number(gp?.rightX);
          return Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX;
        });
        if (bound.length !== 1) {
          throw new Error(`PNG 导出每个模板需要且仅需要 1 个“已绑定参考线”的图片变量：${templateId}`);
        }
        const gp = picks ? (picks[String(bound[0])] || picks[bound[0]]) : null;
        out.push({
          templateKey: templateId,
          psdName:
            (typeof it?.originalPsdName === 'string' && it.originalPsdName.trim()
              ? it.originalPsdName.trim()
              : '') || `${String(it?.__taskTemplateName || '任务模板')} · PSD_${templateId.slice(0, 6)}`,
          canvasWidth: cw,
          canvasHeight: ch,
          guideLeftX: Math.round(Number(gp?.leftX)),
          guideRightX: Math.round(Number(gp?.rightX)),
          boundPsId: bound[0],
        });
      }
      if (out.length === 0) throw new Error('PNG 导出需要至少 1 个任务模板 PSD');
      return out;
    },
    [taskTemplateMetaByTemplateId],
  );

  const openSaveDialog = () => {
    if (taskMode !== 'fresh') return;
    const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    setSaveTemplateName(`批量生成模板_${dateKey}`);
    setSaveDialogOpen(true);
  };

  const handleConfirmSaveTaskTemplate = async () => {
    if (isSavingTaskTemplate) return;
    if (taskMode !== 'fresh') return;
    const validPsds = psdFiles.filter((p) => p.status === 'success');
    if (validPsds.length === 0) return alert('无有效PSD');
    const missingSelected = validPsds.filter((p) => (selectedPsIdsByPsdId.get(p.id)?.size || 0) <= 0);
    if (missingSelected.length > 0) {
      return alert(`存在 PSD 未选择变量：${missingSelected.map((p) => p.name).join('、')}`);
    }
    const name = String(saveTemplateName || '').trim();
    if (!name) return alert('请输入任务模板名称');

    const batchId = `save_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    perfRef.current = { batchId, batchStart: now(), uploads: new Map(), exports: new Map() };
    setIsSavingTaskTemplate(true);
    try {
      const { psdMap, uploadErrorMap, uploadFailed } = await ensurePsdsUploaded({ psds: validPsds, batchId });
      if (uploadFailed > 0) {
        const msg = Array.from(uploadErrorMap.values()).filter(Boolean).join('；') || 'PSD 上传失败';
        throw new Error(msg);
      }

      const serverVarsByTemplateId = new Map();
      for (let i = 0; i < validPsds.length; i += 1) {
        const p = validPsds[i];
        const templateId = psdMap.get(p.id);
        if (!templateId) continue;
        const { res } = await fetchWithFallback(`/api/template/${encodeURIComponent(templateId)}`, { method: 'GET' });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(`模板信息加载失败：${String(p?.name || templateId)}（${String(msg)}）`);
        }
        const vars = Array.isArray(data?.variables) ? data.variables : [];
        serverVarsByTemplateId.set(String(templateId), vars);
      }

      const items = validPsds.map((p) => {
        const templateId = psdMap.get(p.id);
        const exportFormats = getFreshExportFormats(p.id, p.name);
        const set = selectedPsIdsByPsdId.get(p.id);
        const selectedPsIds = set instanceof Set ? Array.from(set) : [];
        const vars = Array.isArray(p?.parsed?.variables) ? p.parsed.variables : [];
        const imagePsIdSet = new Set(
          vars
            .filter((v) => {
              const t = String(v?.varType || v?.type || '').toLowerCase();
              return t === 'img' || t === 'image';
            })
            .map((v) => Math.trunc(Number(v?.psId)))
            .filter((n) => Number.isFinite(n) && n > 0),
        );
        const cleaned = selectedPsIds
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => Number.isFinite(n) && n > 0 && imagePsIdSet.has(n));
        const serverVars = serverVarsByTemplateId.get(String(templateId || '')) || [];
        const serverBySig = new Map();
        const serverByPathType = new Map();
        const serverByPsId = new Map();
        for (let i = 0; i < serverVars.length; i += 1) {
          const v = serverVars[i];
          const varId = v?.id != null ? String(v.id).trim() : '';
          if (!varId) continue;
          const vt = String(v?.varType || v?.type || '').toLowerCase();
          const path = String(v?.path || '');
          const key = String(v?.key || '');
          const sig = `${path}::${vt}::${key}`;
          serverBySig.set(sig, v);
          const pt = `${path}::${vt}`;
          const prev = serverByPathType.get(pt);
          if (prev === undefined) serverByPathType.set(pt, v);
          else serverByPathType.set(pt, null);
          const psId = Math.trunc(Number(v?.psId));
          if (Number.isFinite(psId) && psId > 0) serverByPsId.set(psId, v);
        }
        const clientByPsId = new Map();
        for (let i = 0; i < vars.length; i += 1) {
          const v = vars[i];
          const psId = Math.trunc(Number(v?.psId));
          if (!Number.isFinite(psId) || psId <= 0) continue;
          clientByPsId.set(psId, v);
        }
        const rectOf = (v) => {
          const x = Number(v?.x);
          const y = Number(v?.y);
          const w = Number(v?.width);
          const h = Number(v?.height);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
          if (w <= 0 || h <= 0) return null;
          return { x, y, w, h };
        };
        const iou = (a, b) => {
          if (!a || !b) return 0;
          const ax2 = a.x + a.w;
          const ay2 = a.y + a.h;
          const bx2 = b.x + b.w;
          const by2 = b.y + b.h;
          const ix1 = Math.max(a.x, b.x);
          const iy1 = Math.max(a.y, b.y);
          const ix2 = Math.min(ax2, bx2);
          const iy2 = Math.min(ay2, by2);
          const iw = Math.max(0, ix2 - ix1);
          const ih = Math.max(0, iy2 - iy1);
          const inter = iw * ih;
          const union = a.w * a.h + b.w * b.h - inter;
          if (!(union > 0)) return 0;
          return inter / union;
        };
        const serverNorm = [];
        for (let i = 0; i < serverVars.length; i += 1) {
          const v = serverVars[i];
          const varId = v?.id != null ? String(v.id).trim() : '';
          if (!varId) continue;
          const vt = String(v?.varType || v?.type || '').toLowerCase();
          const path = String(v?.path || '');
          const key = String(v?.key || '');
          const psId = Math.trunc(Number(v?.psId));
          serverNorm.push({ v, varId, vt, path, key, psId, rect: rectOf(v) });
        }
        const pickServerVar = (cv, psId) => {
          if (!cv) return null;
          const vt = String(cv?.varType || cv?.type || '').toLowerCase();
          const path = String(cv?.path || '');
          const key = String(cv?.key || '');
          const sig = `${path}::${vt}::${key}`;
          const byPsId = serverByPsId.get(psId) || null;
          if (byPsId) return byPsId;
          const bySig = serverBySig.get(sig) || null;
          if (bySig) return bySig;
          const cr = rectOf(cv);
          let best = null;
          let bestScore = 0;
          if (cr) {
            for (let i = 0; i < serverNorm.length; i += 1) {
              const s = serverNorm[i];
              if (!s || s.vt !== vt) continue;
              const scoreIou = iou(cr, s.rect);
              if (scoreIou <= 0) continue;
              let score = scoreIou;
              if (s.path === path) score += 0.15;
              if (s.key === key) score += 0.15;
              if (score > bestScore) {
                bestScore = score;
                best = s.v;
              }
            }
          }
          if (best && bestScore >= 0.18) return best;
          const byPathType = (path && vt) ? serverByPathType.get(`${path}::${vt}`) : null;
          return byPathType || null;
        };
        const selectedVarIds = [];
        const selectedVarIdSet = new Set();
        const selectedVarIdByPsId = new Map();
        for (let i = 0; i < cleaned.length; i += 1) {
          const psId = cleaned[i];
          const cv = clientByPsId.get(psId) || null;
          const sv = pickServerVar(cv, psId);
          const varId = sv?.id != null ? String(sv.id).trim() : '';
          if (!varId) continue;
          if (selectedVarIdSet.has(varId)) continue;
          selectedVarIdSet.add(varId);
          selectedVarIds.push(varId);
          selectedVarIdByPsId.set(psId, varId);
        }
        if (selectedVarIds.length !== cleaned.length) {
          throw new Error(`无法将变量选择映射到模板变量ID：${String(p?.name || templateId)}`);
        }
        const byPsd = manualGuidePicksByPsdId.get(p.id);
        const guidePicks = {};
        const guidePicksVarIds = {};
        const bound = cleaned.filter((psId) => {
          const gp = byPsd instanceof Map ? byPsd.get(psId) : null;
          const leftX = Number(gp?.leftX);
          const rightX = Number(gp?.rightX);
          if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) return false;
          guidePicks[String(psId)] = { leftX, rightX };
          const varId = selectedVarIdByPsId.get(psId) || '';
          if (varId) guidePicksVarIds[varId] = { leftX, rightX };
          return true;
        });
        if (exportFormats.includes('png') && bound.length !== 1) {
          throw new Error(`PNG 导出每个模板需要且仅需要 1 个“已绑定参考线”的图片变量：${String(p?.name || templateId)}`);
        }
        return { templateId, selectedPsIds: cleaned, selectedVarIds, guidePicks, guidePicksVarIds, exportFormats };
      });
      const emptyItems = items.filter((it) => !it.templateId || !Array.isArray(it.selectedPsIds) || it.selectedPsIds.length === 0);
      if (emptyItems.length > 0) {
        throw new Error('存在 PSD 未选择变量或未成功上传，无法保存任务模板');
      }
      {
        const ids = items.map((it) => String(it?.templateId || '').trim()).filter((v) => v);
        const seen = new Set();
        const dup = new Set();
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          if (seen.has(id)) dup.add(id);
          else seen.add(id);
        }
        if (dup.size > 0) {
          throw new Error(`存在重复的 PSD 模板ID：${Array.from(dup.values()).slice(0, 6).join('、')}`);
        }
      }

      const { res } = await fetchWithFallback('/api/task-templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, items }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        throw new Error(String(msg));
      }
      setSaveDialogOpen(false);
      const newId = String(data?.template?.id ?? data?.id ?? '').trim();
      if (newId) {
        setSelectedTaskTemplateIds([newId]);
        setSelectedTaskTemplateId(newId);
      }
      await loadTaskTemplates();
      if (newId) {
        await loadTaskTemplateDetail(newId);
      }
      alert('任务模板已保存');
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '保存失败';
      alert(msg);
    } finally {
      setIsSavingTaskTemplate(false);
    }
  };

  // Real Implementation of Generate with Pre-upload
  const handleBatchGenerateReal = async () => {
    if (productImages.length === 0) return alert('请上传产品图');
    const readyImages = productImages.filter((img) => {
      if (!img || img.status !== 'loaded') return false;
      if (img.serverImagePath) return true;
      if (img.file) return true;
      return typeof img.url === 'string' && img.url.startsWith('data:');
    });
    if (readyImages.length === 0) return alert('产品图仍在读取中，请稍后再试');
    if (readyImages.length !== productImages.length) {
      return alert(`仍有 ${productImages.length - readyImages.length} 张产品图正在读取中，请稍后再试`);
    }
    const validPsds = psdFiles.filter((p) => p.status === 'success');
    const formatsByPsdId = new Map();
    const activeFormatSet = new Set();
    const order = ['png', 'jpeg', 'psd'];
    for (let i = 0; i < validPsds.length; i += 1) {
      const p = validPsds[i];
      const formats = getFreshExportFormats(p.id, p.name);
      formatsByPsdId.set(String(p.id), formats);
      for (let j = 0; j < formats.length; j += 1) {
        const f = String(formats[j] || '').toLowerCase();
        if (f && f !== 'png') activeFormatSet.add(f);
      }
    }
    const activeFormats = Array.from(activeFormatSet.values()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const wantsPng = Array.from(formatsByPsdId.values()).some((fs) => Array.isArray(fs) && fs.includes('png'));
    const needsPsdExport = activeFormats.length > 0;
    if ((needsPsdExport || wantsPng) && validPsds.length === 0) return alert('无有效PSD');
    if (needsPsdExport) {
      const missingSelected = [];
      const multiSelected = [];
      for (let i = 0; i < validPsds.length; i += 1) {
        const p = validPsds[i];
        const size = selectedPsIdsByPsdId.get(p.id)?.size || 0;
        if (size <= 0) missingSelected.push(p);
        else if (size !== 1) multiSelected.push(p);
      }
      if (missingSelected.length > 0) {
        return alert(`存在 PSD 未选择变量：${missingSelected.map((p) => p.name).join('、')}`);
      }
      if (multiSelected.length > 0) {
        return alert(`每个PSD仅支持选择 1 个图片变量：${multiSelected.map((p) => p.name).join('、')}`);
      }
    }

    const forcedSelectedSetByPsdId = new Map();
    if (needsPsdExport) {
      const changes = [];
      for (let i = 0; i < validPsds.length; i += 1) {
        const psd = validPsds[i] || {};
        const psdId = String(psd?.id || '').trim();
        if (!psdId) continue;
        const parsed = psd?.parsed || null;
        if (!parsed) continue;
        const vars = Array.isArray(parsed?.variables) ? parsed.variables : [];
        const set = selectedPsIdsByPsdId.get(psdId);
        const selected = set instanceof Set ? Array.from(set.values()) : [];
        const picked = selected.length === 1 ? Math.trunc(Number(selected[0])) : null;
        if (!Number.isFinite(picked) || picked <= 0) continue;
        const seedVar = vars.find((v) => Math.trunc(Number(v?.psId)) === picked) || null;
        if (!seedVar) continue;
        const best = pickTopmostOverlappingImageVar(vars, seedVar) || seedVar;
        const bestPsId = Math.trunc(Number(best?.psId));
        if (!Number.isFinite(bestPsId) || bestPsId <= 0) continue;
        if (bestPsId === picked) continue;
        forcedSelectedSetByPsdId.set(psdId, new Set([bestPsId]));
        changes.push({ psdId, fromPsId: picked, toPsId: bestPsId, toVarId: best?.id != null ? String(best.id) : null, name: psd?.name || '' });
      }
      if (changes.length > 0) {
        console.info('[info] 自动提升图片变量到最上层', {
          count: changes.length,
          items: changes.slice(0, 8),
        });
        setSelectedPsIdsByPsdId((prev) => {
          const next = new Map(prev);
          for (let i = 0; i < changes.length; i += 1) {
            const c = changes[i];
            if (!c?.psdId) continue;
            next.set(String(c.psdId), new Set([c.toPsId]));
          }
          return next;
        });
        if (changes.some((c) => String(c.psdId) === String(basePsdId || ''))) {
          const hit = changes.find((c) => String(c.psdId) === String(basePsdId || '')) || null;
          if (hit?.toVarId) setActiveHotspotId(String(hit.toVarId));
        }
      }
    }

    {
      const missingGuidePickPsds = [];
      for (let i = 0; i < validPsds.length; i += 1) {
        const psd = validPsds[i] || {};
        const psdId = String(psd?.id || '').trim();
        const parsed = psd?.parsed || null;
        if (!psdId || !parsed) continue;
        const vars = Array.isArray(parsed?.variables) ? parsed.variables : [];
        const imgVarPsIds = vars
          .filter((v) => String(v?.varType || v?.type || '').toLowerCase() === 'img')
          .map((v) => Math.trunc(Number(v?.psId)))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (imgVarPsIds.length === 0) continue;
        const selectedSet = forcedSelectedSetByPsdId.get(psdId) || selectedPsIdsByPsdId.get(psdId);
        const selected = selectedSet instanceof Set ? selectedSet : new Set();
        const selectedImgPsIds = imgVarPsIds.filter((psId) => selected.has(psId));
        const byPsd = manualGuidePicksByPsdId.get(psdId);
        const picks = byPsd instanceof Map ? byPsd : new Map();
        if (selectedImgPsIds.length > 0) {
          const ok = selectedImgPsIds.every((psId) => isValidGuidePick(picks.get(psId)));
          if (!ok) missingGuidePickPsds.push(psd);
          continue;
        }
        const anyBound = imgVarPsIds.some((psId) => isValidGuidePick(picks.get(psId)));
        if (!anyBound) missingGuidePickPsds.push(psd);
      }
      if (missingGuidePickPsds.length > 0) {
        const names = missingGuidePickPsds
          .map((p) => String(p?.name || p?.id || '').trim())
          .filter(Boolean);
        const shown = names.slice(0, 8).join('、');
        const suffix = names.length > 8 ? '…' : '';
        return alert(`以下 PSD 尚未绑定参考线，已阻止导出：${shown}${suffix}\n\n操作：选择对应 PSD → 点击“绑定参考线” → 选中图片变量 → 在画布上点两次（左/右）完成绑定。`);
      }
    }

    let pngTargets = [];
    if (wantsPng) {
      try {
        const pngPsds = validPsds.filter((p) => (formatsByPsdId.get(String(p.id)) || []).includes('png'));
        pngTargets = buildFreshPngTargets(pngPsds);
      } catch (e) {
        const msg = e && e.message ? String(e.message) : 'PNG 导出缺少参考线绑定';
        return alert(msg);
      }
    }

    const wantsTransparentPsd = needsPsdExport && validPsds.some((p) => /png/i.test(String(p?.name || '')));
    const psdsForPsdExport = validPsds.filter((p) => {
      const fs = formatsByPsdId.get(String(p?.id || '')) || [];
      return Array.isArray(fs) && fs.some((f) => String(f || '').toLowerCase() !== 'png');
    });
    const expectedFormatsByPsdId = new Map();
    for (let i = 0; i < psdsForPsdExport.length; i += 1) {
      const p = psdsForPsdExport[i];
      const fs = formatsByPsdId.get(String(p?.id || '')) || [];
      const expected = Array.isArray(fs) ? fs.filter((f) => String(f || '').toLowerCase() !== 'png') : [];
      expectedFormatsByPsdId.set(String(p?.id || ''), expected);
    }
    const bundlePsdWantedByPsdId = new Set();
    if (bundlePsdEnabled === true) {
      for (let i = 0; i < psdsForPsdExport.length; i += 1) {
        const id = String(psdsForPsdExport[i]?.id || '');
        const expected = expectedFormatsByPsdId.get(id) || [];
        if (Array.isArray(expected) && expected.includes('psd')) bundlePsdWantedByPsdId.add(id);
      }
    }
    let totalNonPng = 0;
    if (needsPsdExport) {
      for (let i = 0; i < psdsForPsdExport.length; i += 1) {
        const id = String(psdsForPsdExport[i]?.id || '');
        const expected = expectedFormatsByPsdId.get(id) || [];
        const perTaskExpected =
          bundlePsdWantedByPsdId.has(id) && Array.isArray(expected) ? expected.filter((f) => String(f || '').toLowerCase() !== 'psd') : expected;
        totalNonPng += readyImages.length * (Array.isArray(perTaskExpected) ? perTaskExpected.length : 0);
      }
    }
    const totalPng = wantsPng ? readyImages.length * (Array.isArray(pngTargets) ? pngTargets.length : 0) : 0;
    const totalBundleTasks = bundlePsdWantedByPsdId.size > 0 ? bundlePsdWantedByPsdId.size * readyImages.length : 0;
    const uploadPsdCount = needsPsdExport ? validPsds.filter((p) => p && !p.serverTemplateId).length : 0;
    const uploadProductImageCount = readyImages.filter((img) => img && img.file && !img.serverImagePath).length;
    const uploadChannelCount =
      (wantsPng || wantsTransparentPsd) ? channelMasks.filter((m) => m && m.file && m.uploadStatus !== 'success').length : 0;
    const totalWork = uploadPsdCount + uploadProductImageCount + uploadChannelCount + totalNonPng + totalPng + totalBundleTasks;

    const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    perfRef.current = { batchId, batchStart: now(), uploads: new Map(), exports: new Map() };
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark(`batch_gen_${batchId}_start`);
    }

    setIsGenerating(true);
    setGenerationProgress({
      current: 0,
      total: totalWork,
      phase: '准备上传',
    });
    setBundleExportResults([]);
    setMissingChannelHints([]);

    let uploadedChannelStoredNameById = new Map();
    if (wantsPng || wantsTransparentPsd) {
      try {
        uploadedChannelStoredNameById = await ensureChannelMasksUploaded({ masks: channelMasks });
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '上传通道图失败';
        setIsGenerating(false);
        return alert(msg);
      }
    }
    const masksForCutoutCompose = wantsPng || wantsTransparentPsd
      ? channelMasks.map((m) => ({
          ...m,
          storedName: String(m?.storedName || uploadedChannelStoredNameById.get(m?.id) || ''),
        }))
      : [];

    let uploadedImagePathById = new Map();
    try {
      uploadedImagePathById = await ensureProductImagesUploaded({ images: readyImages, batchId });
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '上传产品图失败';
      setIsGenerating(false);
      return alert(msg);
    }
    setGenerationProgress((p) => ({ ...p, phase: '正在导出' }));

    if (!needsPsdExport) {
      try {
        const pngRows = await runCutoutComposeForPng({
          images: readyImages,
          uploadedImagePathById,
          targets: pngTargets,
          masks: masksForCutoutCompose,
          requestMode: 'fresh',
        });
        setGenerationResults(pngRows);
        advanceGenerationProgress(pngRows.length, '合成PNG');
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '无PSD抠图合成失败';
        const fallback = [];
        for (let pi = 0; pi < validPsds.length; pi += 1) {
          const psd = validPsds[pi];
          for (let ii = 0; ii < readyImages.length; ii += 1) {
            const img = readyImages[ii];
            fallback.push({
              psdId: String(psd?.id || 'psd'),
              psdName: String(psd?.name || 'PSD').replace(/\.psd$/i, ''),
              imgId: String(img?.id || `img_${ii}`),
              imgName: String(img?.name || `image_${ii + 1}`),
              imgUrl: img?.url || null,
              serverImagePath: img?.serverImagePath || uploadedImagePathById.get(img?.id) || null,
              status: 'error',
              error: msg,
              formatResults: { png: { status: 'error', url: null, error: msg } },
            });
          }
        }
        setGenerationResults(fallback);
        advanceGenerationProgress(fallback.length, '合成PNG');
        alert(msg);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // 1. Prepare PSDs (Upload to server if needed)
    const { psdMap, uploadErrorMap, uploadSuccess, uploadFailed } = await ensurePsdsUploaded({ psds: validPsds, batchId });

    // 2. Generate
    const tasks = [];
    const bundleEntryGroups = new Map();
    readyImages.forEach((img) => {
      psdsForPsdExport.forEach((psd) => {
        const serverImagePath = img.serverImagePath || uploadedImagePathById.get(img.id) || null;
        const psdIdKey = String(psd?.id || '');
        const serverTemplateId = psdMap.get(psd.id) || null;
        const expectedAll = expectedFormatsByPsdId.get(psdIdKey) || [];
        const expectedFormats =
          bundlePsdWantedByPsdId.has(psdIdKey) && Array.isArray(expectedAll)
            ? expectedAll.filter((f) => String(f || '').toLowerCase() !== 'psd')
            : expectedAll;
        const task = {
          psdId: psd.id,
          psdName: psd.name,
          imgId: img.id,
          imgName: img.name,
          imgUrl: img.url,
          serverImagePath,
          serverTemplateId,
          expectedFormats,
          status: 'pending',
        };
        if (bundlePsdWantedByPsdId.has(psdIdKey) && serverTemplateId) {
          const arr = bundleEntryGroups.get(String(serverTemplateId)) || [];
          arr.push({ task });
          bundleEntryGroups.set(String(serverTemplateId), arr);
        }
        if (Array.isArray(expectedFormats) && expectedFormats.length > 0) {
          tasks.push(task);
        }
      });
    });
    
    let exportSuccess = 0;
    let exportFailed = 0;

    const selectedVarsByPsdId = new Map();
    const resolvedGuidePicksByPsdId = new Map();
    psdsForPsdExport.forEach((p) => {
      const psdKey = String(p?.id || '');
      const set = forcedSelectedSetByPsdId.get(psdKey) || selectedPsIdsByPsdId.get(psdKey) || selectedPsIdsByPsdId.get(p.id);
      const selectedSet = set instanceof Set ? set : new Set();
      const vars = Array.isArray(p?.parsed?.variables) ? p.parsed.variables : [];
      const matches = vars.filter((v) => {
        const psId = Number(v?.psId);
        return Number.isFinite(psId) && selectedSet.has(psId);
      });
      selectedVarsByPsdId.set(p.id, matches);
      const manual = manualGuidePicksByPsdId.get(psdKey) || manualGuidePicksByPsdId.get(p.id);
      resolvedGuidePicksByPsdId.set(p.id, resolveGuidePickByRect({ variables: vars, manualGuidePicksByPsId: manual, tolerancePx: 2 }));
    });

    const initial = tasks.map((t) => ({ ...t }));
    let initialDone = 0;
    for (let i = 0; i < initial.length; i += 1) {
      const task = initial[i];
      if (task.serverTemplateId) continue;
      const psdErr = uploadErrorMap.get(task.psdId);
      initial[i] = { ...task, status: 'error', error: psdErr ? `PSD上传失败：${psdErr}` : 'PSD上传失败' };
      initialDone += 1;
    }
    setGenerationResults(initial);
    if (initialDone > 0) {
      advanceGenerationProgress(initialDone, '正在导出');
      exportFailed += initialDone;
    }

    const groups = new Map();
    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      if (!task.serverTemplateId) continue;
      const key = String(task.serverTemplateId);
      const arr = groups.get(key) || [];
      arr.push({ index: i, task });
      groups.set(key, arr);
    }

    if (bundlePsdWantedByPsdId.size > 0) {
      const bundleRows = [];
      psdsForPsdExport
        .filter((psd) => bundlePsdWantedByPsdId.has(String(psd?.id || '')))
        .forEach((psd) => {
          const serverTemplateId = psdMap.get(psd.id) || null;
          const psdErr = uploadErrorMap.get(psd.id) || null;
          const tplId = serverTemplateId ? String(serverTemplateId) : null;
          if (!tplId) {
            bundleRows.push({
              bundleKey: `failed_${String(psd.id)}`,
              templateId: `failed_${String(psd.id)}`,
              serverTemplateId: null,
              psdName: psd.name,
              imgName: `合并 ${readyImages.length} 张产品图`,
              status: 'error',
              error: `PSD上传失败：${psdErr || '上传失败'}`,
              resultUrl: null,
              resultFormat: 'psd',
              bundlePart: 1,
              bundleParts: 1,
              bundleStart: 0,
              bundleCount: readyImages.length,
            });
            return;
          }
          const entries = bundleEntryGroups.get(tplId) || [];
          const totalCount = entries.length;
          const maxBundleTasks = Math.min(200, computeChunkSize(tplId, totalCount));
          const parts = Math.max(1, Math.ceil(totalCount / maxBundleTasks));
          for (let part = 0; part < parts; part += 1) {
            const start = part * maxBundleTasks;
            const count = Math.max(0, Math.min(maxBundleTasks, totalCount - start));
            const partLabel = parts > 1 ? `（第${part + 1}/${parts}卷）` : '';
            bundleRows.push({
              bundleKey: `${tplId}__part_${part + 1}`,
              templateId: tplId,
              serverTemplateId: tplId,
              psdName: psd.name,
              imgName: `合并 ${count} 张产品图${partLabel}`,
              status: 'pending',
              error: null,
              resultUrl: null,
              resultFormat: 'psd',
              bundlePart: part + 1,
              bundleParts: parts,
              bundleStart: start,
              bundleCount: count,
            });
          }
        });
      setBundleExportResults(bundleRows);

      for (let bi = 0; bi < bundleRows.length; bi += 1) {
        const row = bundleRows[bi];
        const bundleKey = String(row?.bundleKey || '');
        const templateId = row.serverTemplateId;
        const workUnits = Math.max(0, Math.floor(Number(row?.bundleCount) || 0));
        if (!templateId) {
          exportFailed += Math.max(1, workUnits || 0);
          advanceGenerationProgress(workUnits, '合并PSD');
          continue;
        }
        const entriesAll = bundleEntryGroups.get(String(templateId)) || [];
        const partEntries = entriesAll.slice(Number(row?.bundleStart) || 0, (Number(row?.bundleStart) || 0) + (Number(row?.bundleCount) || 0));
        if (partEntries.length === 0) {
          setBundleExportResults((prev) =>
            prev.map((b) =>
              b.bundleKey === bundleKey
                ? { ...b, status: 'error', error: '未找到可导出的任务（请检查变量选择与产品图）' }
                : b,
            ),
          );
          exportFailed += Math.max(1, workUnits);
          advanceGenerationProgress(Math.max(1, workUnits), '合并PSD');
          continue;
        }

        setBundleExportResults((prev) =>
          prev.map((b) => (b.bundleKey === bundleKey ? { ...b, status: 'processing', error: null } : b)),
        );

        const apiTasks = partEntries.map(({ task }, idx) => {
          const matches = selectedVarsByPsdId.get(task.psdId) || [];
          const updates = matches.map((v) => ({
            psId: Number(v.psId),
            varType: 'img',
            ...(task.serverImagePath ? { imagePath: task.serverImagePath } : { value: task.imgUrl }),
            sourceName: task.imgName,
            name: v.name,
            id: v.id,
            x: Number(v.x),
            y: Number(v.y),
            width: Number(v.width),
            height: Number(v.height),
            ...(resolvedGuidePicksByPsdId.get(task.psdId)?.get(Number(v?.psId))
              ? { guidePick: { ...resolvedGuidePicksByPsdId.get(task.psdId).get(Number(v.psId)) } }
              : {}),
          }));

          const label = `${task.imgId}__${task.imgName || String((Number(row?.bundleStart) || 0) + idx + 1)}`;
          return { label, updates };
        });

        try {
          const psdName = partEntries?.[0]?.task?.psdName ? String(partEntries[0].task.psdName) : '';
          const needChannelsForPsd = /png/i.test(psdName);
          const channelsForReq = needChannelsForPsd
            ? masksForCutoutCompose
                .map((m) => {
                  const storedName = String(m?.storedName || '').trim();
                  if (!storedName) return null;
                  const sourceName = String(m?.name || m?.originalName || storedName).trim();
                  return { storedName, sourceName };
                })
                .filter(Boolean)
            : null;
          const out = await requestBatchExportWithRetry(
            {
              templateId,
              tasks: apiTasks,
              format: 'psd',
              bundlePsd: true,
              ...(needChannelsForPsd ? { channels: channelsForReq } : {}),
            },
            { maxAttempts: 4, baseDelayMs: 2500 },
          );
          const data = out?.data || null;

          const url = data?.bundle?.url ? String(data.bundle.url) : '';
          if (!url) {
            throw new Error('服务端未返回合并PSD下载地址');
          }

          setBundleExportResults((prev) =>
            prev.map((b) =>
              b.bundleKey === bundleKey ? { ...b, status: 'success', resultUrl: url, resultFormat: 'psd' } : b,
            ),
          );
          exportSuccess += Math.max(1, partEntries.length);
        } catch (e) {
          const msg = e && e.message ? String(e.message) : '合并导出失败';
          setBundleExportResults((prev) =>
            prev.map((b) => (b.bundleKey === bundleKey ? { ...b, status: 'error', error: msg } : b)),
          );
          exportFailed += Math.max(1, partEntries.length);
        }

        advanceGenerationProgress(partEntries.length, '合并PSD');
      }
    }

    const perTaskFormats = bundlePsdWantedByPsdId.size > 0 ? activeFormats.filter((f) => String(f || '').toLowerCase() !== 'psd') : activeFormats;
    for (const currentFormat of perTaskFormats) {
      const effectiveQuality = currentFormat === 'jpeg' ? exportJpegQuality : 100;
      const formatLabel = currentFormat.toUpperCase();

      for (const [templateId, entries] of groups.entries()) {
        const expected = Array.isArray(entries?.[0]?.task?.expectedFormats) ? entries[0].task.expectedFormats : [];
        if (expected.length === 0 || !expected.includes(currentFormat)) continue;
        let cursor = 0;
        while (cursor < entries.length) {
          const chunkSize = computeChunkSize(templateId, entries.length - cursor);
          const chunk = entries.slice(cursor, cursor + chunkSize);
          cursor += chunk.length;
          setGenerationResults((prev) => {
            const next = [...prev];
            chunk.forEach(({ index }) => {
              const existing = next[index] || {};
              const formatResults = existing.formatResults || {};
              formatResults[currentFormat] = { status: 'processing', url: null, error: null };
              next[index] = { ...existing, formatResults, status: 'processing' };
            });
            return next;
          });

          chunk.forEach(({ task }) => {
            perfRef.current.exports.set(`${task.psdId}_${task.imgId}_${currentFormat}`, { start: now(), psdName: task.psdName, imgName: task.imgName, format: currentFormat });
          });

          const buildApiTasks = (list) => {
            return list.map(({ task }) => {
              const matches = selectedVarsByPsdId.get(task.psdId) || [];
              const updates = matches.map((v) => ({
                psId: Number(v.psId),
                varType: 'img',
                ...(task.serverImagePath ? { imagePath: task.serverImagePath } : { value: task.imgUrl }),
                sourceName: task.imgName,
                name: v.name,
                id: v.id,
                x: Number(v.x),
                y: Number(v.y),
                width: Number(v.width),
                height: Number(v.height),
                ...(resolvedGuidePicksByPsdId.get(task.psdId)?.get(Number(v?.psId))
                  ? { guidePick: { ...resolvedGuidePicksByPsdId.get(task.psdId).get(Number(v.psId)) } }
                  : {}),
              }));
              const rawImgName = String(task.imgName || task.imgUrl || 'image');
              const safeImgName = sanitizeZipNameSegment(rawImgName).replace(/\.[^/.]+$/g, '');
              return {
                label: `${task.psdId}_${task.imgId}_${currentFormat}`,
                fileBase: `${safeImgName}_${formatLabel}`,
                updates,
                format: currentFormat,
                quality: effectiveQuality,
              };
            });
          };

          const pendingChunks = [chunk];
          while (pendingChunks.length > 0) {
            const part = pendingChunks.shift();
            const apiTasks = buildApiTasks(part);
            try {
              const chunkStartedAt = now();
              const payload = {
                templateId,
                tasks: apiTasks,
                format: currentFormat,
                quality: effectiveQuality,
                transparentBackground: currentFormat === 'png',
                ...(String(currentFormat || '').toLowerCase() === 'psd' &&
                /png/i.test(String(entries?.[0]?.task?.psdName || '')) &&
                masksForCutoutCompose.length > 0
                  ? {
                      channels: masksForCutoutCompose
                        .map((m) => {
                          const storedName = String(m?.storedName || '').trim();
                          if (!storedName) return null;
                          const sourceName = String(m?.name || m?.originalName || storedName).trim();
                          return { storedName, sourceName };
                        })
                        .filter(Boolean),
                    }
                  : {}),
              };
              const out = await requestBatchExportWithRetry(payload, { maxAttempts: 3, baseDelayMs: 2000 });
              const data = out?.data || null;
              const attempts = out?.attempts || null;
              const chunkCost = Math.max(0, now() - chunkStartedAt);
              updateChunkStatsOnSuccess({ templateId, tasksCount: part.length, costMs: chunkCost });
              const results = Array.isArray(data?.results) ? data.results : [];
              const byLabel = new Map();
              results.forEach((r) => {
                if (!r) return;
                const label = r.label != null ? String(r.label) : '';
                if (!label) return;
                byLabel.set(label, r);
              });

              let partSuccess = 0;
              let partFailed = 0;
              const changes = part.map(({ index, task }) => {
                const label = `${task.psdId}_${task.imgId}_${currentFormat}`;
                const r = byLabel.get(label) || null;
                const exportKey = `${task.psdId}_${task.imgId}_${currentFormat}`;
                const cost = Math.round(now() - (perfRef.current.exports.get(exportKey)?.start || now()));
                if (r && r.ok === true && r.url) {
                  partSuccess += 1;
                  console.info('[性能] 批量生成导出完成', { 批次: batchId, PSD: task.psdName, 产品图: task.imgName, 格式: currentFormat, 耗时: cost, 导出地址: r.url });
                  return { index, formatStatus: 'success', formatUrl: r.url, formatError: null, currentFormat };
                }
                partFailed += 1;
                const errText =
                  Array.isArray(r?.errors) && r.errors.length > 0
                    ? String(r.errors[0]?.message || r.errors[0]?.name || '导出失败')
                    : '导出失败';
                console.warn('[性能] 批量生成导出失败', { 批次: batchId, PSD: task.psdName, 产品图: task.imgName, 格式: currentFormat, 耗时: cost, 尝试: attempts });
                return { index, formatStatus: 'error', formatUrl: null, formatError: errText, currentFormat };
              });

              exportSuccess += partSuccess;
              exportFailed += partFailed;

              setGenerationResults((prev) => {
                const next = [...prev];
                changes.forEach((cc) => {
                  const existing = next[cc.index] || {};
                  const formatResults = existing.formatResults || {};
                  formatResults[cc.currentFormat] = {
                    status: cc.formatStatus,
                    url: cc.formatUrl,
                    error: cc.formatError,
                  };
                  const expectedFormats = Array.isArray(existing.expectedFormats) ? existing.expectedFormats : activeFormats;
                  const allFormatsDone = expectedFormats.every((f) => formatResults[f]?.status !== 'processing');
                  const anySuccess = expectedFormats.some((f) => formatResults[f]?.status === 'success');
                  const allFailed = expectedFormats.every((f) => formatResults[f]?.status === 'error');
                  let overallStatus = 'processing';
                  if (allFormatsDone) {
                    overallStatus = anySuccess ? 'success' : (allFailed ? 'error' : 'success');
                  }
                  const isSingleFormat = expectedFormats.length === 1;
                  const singleFormatUrl = isSingleFormat && cc.formatStatus === 'success' ? cc.formatUrl : existing.resultUrl;
                  next[cc.index] = {
                    ...existing,
                    formatResults,
                    status: overallStatus,
                    resultUrl: singleFormatUrl || existing.resultUrl,
                    resultFormat: isSingleFormat ? cc.currentFormat : existing.resultFormat,
                  };
                });
                return next;
              });

              advanceGenerationProgress(part.length, '正在导出');
            } catch (e) {
              updateChunkStatsOnFailure({ templateId, err: e });
              const missing =
                String(currentFormat || '').toLowerCase() === 'png' && Array.isArray(e?.server?.missingChannels)
                  ? e.server.missingChannels
                  : [];
              if (missing.length > 0) setMissingChannelHints(missing);
              if (part.length > 1 && isRetryableBatchExportError(e)) {
                const mid = Math.ceil(part.length / 2);
                pendingChunks.unshift(part.slice(mid), part.slice(0, mid));
                continue;
              }
              setGenerationResults((prev) => {
                const next = [...prev];
                part.forEach(({ index }) => {
                  const msg = e && e.message ? String(e.message) : '批量导出失败';
                  const existing = next[index] || {};
                  const formatResults = existing.formatResults || {};
                  formatResults[currentFormat] = { status: 'error', url: null, error: msg };
                  next[index] = { ...existing, formatResults, status: 'error' };
                });
                return next;
              });
              exportFailed += part.length;
              advanceGenerationProgress(part.length, '正在导出');
            }
          }
        }
      }
    }
    
    if (wantsPng) {
      try {
        const pngRows = await runCutoutComposeForPng({
          images: readyImages,
          uploadedImagePathById,
          targets: pngTargets,
          masks: masksForCutoutCompose,
          requestMode: 'fresh',
        });
        setGenerationResults((prev) => mergeRowsByKey(prev, pngRows));
        advanceGenerationProgress(pngRows.length, '合成PNG');
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '无PSD抠图合成失败';
        const fallback = [];
        for (let pi = 0; pi < validPsds.length; pi += 1) {
          const psd = validPsds[pi];
          for (let ii = 0; ii < readyImages.length; ii += 1) {
            const img = readyImages[ii];
            fallback.push({
              psdId: String(psd?.id || 'psd'),
              psdName: String(psd?.name || 'PSD').replace(/\.psd$/i, ''),
              imgId: String(img?.id || `img_${ii}`),
              imgName: String(img?.name || `image_${ii + 1}`),
              imgUrl: img?.url || null,
              serverImagePath: img?.serverImagePath || uploadedImagePathById.get(img?.id) || null,
              status: 'error',
              error: msg,
              formatResults: { png: { status: 'error', url: null, error: msg } },
            });
          }
        }
        setGenerationResults((prev) => mergeRowsByKey(prev, fallback));
        advanceGenerationProgress(fallback.length, '合成PNG');
        alert(msg);
      }
    }

    setIsGenerating(false);
    const totalCost = Math.round(now() - (perfRef.current.batchStart || now()));
    console.info('[性能] 批量生成完成', { 批次: batchId, 耗时: totalCost, 上传成功: uploadSuccess, 上传失败: uploadFailed, 导出成功: exportSuccess, 导出失败: exportFailed });
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      performance.mark(`batch_gen_${batchId}_end`);
    }
  };

  const handleBatchGenerateFromTaskTemplate = async () => {
    const parseAngleHint = (s) => {
      const str = String(s || '').toLowerCase();
      if (!str) return '';
      if (str.includes('45') || str.includes('45度') || str.includes('45°')) return '45';
      if (str.includes('90') || str.includes('90度') || str.includes('90°')) return '侧';
      if (str.includes('侧') || str.includes('side')) return '侧';
      if (str.includes('正') || str.includes('front')) return '正';
      return '';
    };
    const parseModelHint = (s) => {
      const str = String(s || '');
      const m = /([A-Za-z]{1,6}\d{3,14})/.exec(str);
      return m ? String(m[1]) : '';
    };
    if (productImages.length === 0) return alert('请上传产品图');
    const readyImages = productImages.filter((img) => {
      if (!img || img.status !== 'loaded') return false;
      if (img.serverImagePath) return true;
      if (img.file) return true;
      return typeof img.url === 'string' && img.url.startsWith('data:');
    });
    if (readyImages.length === 0) return alert('产品图仍在读取中，请稍后再试');
    if (readyImages.length !== productImages.length) {
      return alert(`仍有 ${productImages.length - readyImages.length} 张产品图正在读取中，请稍后再试`);
    }

    const rawItems = taskTemplateItems;
    const imagePsIdSetByTemplateId = new Map();
    const imageVarMapsByTemplateId = new Map();
    const getImagePsIdSetForTemplate = (templateId) => {
      const id = String(templateId || '').trim();
      if (!id) return null;
      if (imagePsIdSetByTemplateId.has(id)) return imagePsIdSetByTemplateId.get(id) || null;
      const meta = taskTemplateMetaByTemplateId.get(id) || null;
      if (!meta) {
        throw new Error(`模板信息仍在加载中：${id}`);
      }
      if (meta?.error) {
        throw new Error(`模板无法加载：${id}（${String(meta.error)}）`);
      }
      const vars = Array.isArray(meta?.variables) ? meta.variables : [];
      const set = new Set();
      for (let i = 0; i < vars.length; i += 1) {
        const v = vars[i];
        const t = String(v?.varType || v?.type || '').toLowerCase();
        if (t !== 'img' && t !== 'image') continue;
        const psId = Math.trunc(Number(v?.psId));
        if (!Number.isFinite(psId) || psId <= 0) continue;
        set.add(psId);
      }
      const out = set.size > 0 ? set : null;
      imagePsIdSetByTemplateId.set(id, out);
      return out;
    };
    const getImageVarMapsForTemplate = (templateId) => {
      const id = String(templateId || '').trim();
      if (!id) return { psIdToVarId: new Map(), varIdToPsId: new Map() };
      if (imageVarMapsByTemplateId.has(id)) return imageVarMapsByTemplateId.get(id);
      const meta = taskTemplateMetaByTemplateId.get(id) || null;
      if (!meta) {
        throw new Error(`模板信息仍在加载中：${id}`);
      }
      if (meta?.error) {
        throw new Error(`模板无法加载：${id}（${String(meta.error)}）`);
      }
      const vars = Array.isArray(meta?.variables) ? meta.variables : [];
      const psIdToVarId = new Map();
      const varIdToPsId = new Map();
      for (let i = 0; i < vars.length; i += 1) {
        const v = vars[i];
        const t = String(v?.varType || v?.type || '').toLowerCase();
        if (t !== 'img' && t !== 'image') continue;
        const varId = v?.id != null ? String(v.id).trim() : '';
        const psId = Math.trunc(Number(v?.psId));
        if (!varId) continue;
        if (!Number.isFinite(psId) || psId <= 0) continue;
        psIdToVarId.set(psId, varId);
        varIdToPsId.set(varId, psId);
      }
      const out = { psIdToVarId, varIdToPsId };
      imageVarMapsByTemplateId.set(id, out);
      return out;
    };

    setTaskTemplateNotice('');
    const repairedTemplateIds = [];
    const repairedRecords = [];
    const items = rawItems
      .map((it) => {
        const templateId = String(it?.templateId || '').trim();
        if (!templateId) return null;
        const allowed = getImagePsIdSetForTemplate(templateId);
        const { psIdToVarId, varIdToPsId } = getImageVarMapsForTemplate(templateId);
        const rawPicks = it?.guidePicks && typeof it.guidePicks === 'object' ? it.guidePicks : null;
        const taskTemplateId = String(it?.__taskTemplateId || '').trim();
        const rawSelectedVarIds = Array.isArray(it?.selectedVarIds) ? it.selectedVarIds : [];
        const selectedVarIds = Array.from(
          new Set(rawSelectedVarIds.map((v) => String(v || '').trim()).filter((v) => v)),
        );
        const selectedFromVarIds = selectedVarIds
          .map((vid) => varIdToPsId.get(vid))
          .filter((n) => Number.isFinite(n) && n > 0)
          .filter((n) => !(allowed instanceof Set) || allowed.has(n));
        const rawSelected = Array.isArray(it?.selectedPsIds) ? it.selectedPsIds : [];
        const selectedFromPsIds = rawSelected
          .map((n) => Math.trunc(Number(n)))
          .filter((n) => {
            if (!Number.isFinite(n) || n <= 0) return false;
            if (allowed instanceof Set) return allowed.has(n);
            return true;
          });
        let uniq = Array.from(new Set((selectedFromVarIds.length > 0 ? selectedFromVarIds : selectedFromPsIds)));
        if ((allowed instanceof Set) && allowed.size > 0 && uniq.length === 0) {
          const candidates = [];
          if (rawPicks && typeof rawPicks === 'object') {
            const keys = Object.keys(rawPicks);
            for (let i = 0; i < keys.length; i += 1) {
              const k = keys[i];
              const psId = Math.trunc(Number(k));
              if (!Number.isFinite(psId) || psId <= 0) continue;
              if (!allowed.has(psId)) continue;
              const gp = rawPicks[String(psId)] || rawPicks[psId] || null;
              const leftX = Number(gp?.leftX);
              const rightX = Number(gp?.rightX);
              if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) continue;
              candidates.push(psId);
            }
          }
          const fallbackPsId = candidates.length > 0 ? candidates[0] : Math.min(...Array.from(allowed.values()));
          if (Number.isFinite(fallbackPsId) && fallbackPsId > 0) {
            uniq = [fallbackPsId];
            repairedTemplateIds.push(templateId);
            if (taskTemplateId) {
              const inferredVarIds = uniq.map((psId) => psIdToVarId.get(psId)).filter((v) => v);
              repairedRecords.push({
                taskTemplateId,
                templateId,
                selectedPsIds: uniq,
                selectedVarIds: inferredVarIds.length > 0 ? inferredVarIds : undefined,
              });
            }
          }
        }
        const finalSelectedVarIds =
          selectedVarIds.length > 0
            ? selectedVarIds
            : uniq.map((psId) => psIdToVarId.get(psId)).filter((v) => v);
        const guidePicks = {};
        for (let i = 0; i < uniq.length; i += 1) {
          const psId = uniq[i];
          const gp = rawPicks ? (rawPicks[String(psId)] || rawPicks[psId]) : null;
          const leftX = Number(gp?.leftX);
          const rightX = Number(gp?.rightX);
          if (Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX) {
            guidePicks[String(psId)] = { leftX, rightX };
          }
        }
        if (taskTemplateId && repairedTemplateIds.includes(templateId)) {
          const last = repairedRecords[repairedRecords.length - 1];
          if (last && last.taskTemplateId === taskTemplateId && last.templateId === templateId) {
            last.guidePicks = guidePicks;
            last.exportFormats = it?.exportFormats ?? null;
          }
        }
        return {
          ...it,
          templateId,
          selectedPsIds: uniq,
          selectedVarIds: finalSelectedVarIds,
          guidePicks,
          exportFormats: it?.exportFormats ?? null,
        };
      })
      .filter(Boolean);
    if (repairedRecords.length > 0) {
      const repairCount = repairedTemplateIds.length;
      const byTaskTemplateId = new Map();
      for (let i = 0; i < repairedRecords.length; i += 1) {
        const r = repairedRecords[i];
        const tid = String(r?.taskTemplateId || '').trim();
        if (!tid) continue;
        const arr = byTaskTemplateId.get(tid) || [];
        arr.push(r);
        byTaskTemplateId.set(tid, arr);
      }
      let savedOk = 0;
      let savedFail = 0;
      for (const [taskTemplateId, changes] of byTaskTemplateId.entries()) {
        const detail = taskTemplateDetailById.get(taskTemplateId) || null;
        const originalItems = Array.isArray(detail?.items) ? detail.items : [];
        if (originalItems.length === 0) {
          savedFail += 1;
          continue;
        }
        const patchByTemplateId = new Map();
        for (let i = 0; i < changes.length; i += 1) {
          const c = changes[i];
          patchByTemplateId.set(String(c.templateId), c);
        }
        const nextItems = originalItems.map((row) => {
          const tplId = String(row?.templateId || '').trim();
          const patched = patchByTemplateId.get(tplId) || null;
          if (!patched) return row;
          const nextRow = { ...row, selectedPsIds: patched.selectedPsIds };
          if (Array.isArray(patched.selectedVarIds) && patched.selectedVarIds.length > 0) nextRow.selectedVarIds = patched.selectedVarIds;
          if (patched.guidePicks && typeof patched.guidePicks === 'object') nextRow.guidePicks = patched.guidePicks;
          if (Array.isArray(patched.exportFormats)) nextRow.exportFormats = patched.exportFormats;
          return nextRow;
        });
        try {
          const { res } = await fetchWithFallback(`/api/task-templates/${encodeURIComponent(taskTemplateId)}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: nextItems }),
          });
          const data = await readJsonSafely(res);
          if (!res.ok) {
            savedFail += 1;
            continue;
          }
          setTaskTemplateDetailById((prev) => {
            const next = new Map(prev);
            next.set(String(taskTemplateId), data);
            return next;
          });
          savedOk += 1;
        } catch {
          savedFail += 1;
        }
      }
      if (savedOk > 0 && savedFail === 0) {
        setTaskTemplateNotice(`检测到图片变量绑定已变化，已自动修复并自动保存（影响 ${repairCount} 个模板）。`);
      } else if (savedOk > 0 && savedFail > 0) {
        setTaskTemplateNotice(`检测到图片变量绑定已变化，已自动修复；其中 ${savedOk} 个任务模板已自动保存，${savedFail} 个保存失败。`);
      } else {
        setTaskTemplateNotice(`检测到图片变量绑定已变化，已自动修复；但自动保存失败（可能未登录管理后台）。`);
      }
    }

    const primaryPsIdByTemplateId = new Map();
    const primaryPsIdSet = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i] || {};
      const templateId = String(it?.templateId || '').trim();
      if (!templateId) continue;
      const selected = Array.isArray(it?.selectedPsIds) ? it.selectedPsIds : [];
      const guidePicks = it?.guidePicks && typeof it.guidePicks === 'object' ? it.guidePicks : null;
      let primary = null;
      for (let j = 0; j < selected.length; j += 1) {
        const psId = Math.trunc(Number(selected[j]));
        if (!Number.isFinite(psId) || psId <= 0) continue;
        const gp = guidePicks ? (guidePicks[String(psId)] || guidePicks[psId]) : null;
        const leftX = Number(gp?.leftX);
        const rightX = Number(gp?.rightX);
        if (Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX) {
          primary = psId;
          break;
        }
      }
      if (!primary) {
        const first = Math.trunc(Number(selected[0]));
        if (Number.isFinite(first) && first > 0) primary = first;
      }
      if (!primary) continue;
      if (!primaryPsIdByTemplateId.has(templateId)) primaryPsIdByTemplateId.set(templateId, primary);
      primaryPsIdSet.add(primary);
    }

    const formatsByTemplateId = new Map();
    const activeFormatSet = new Set();
    const order = ['png', 'jpeg', 'psd'];
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const templateId = String(it?.templateId || '').trim();
      if (!templateId) continue;
      const formats = getTemplateExportFormats(templateId, it?.exportFormats);
      formatsByTemplateId.set(templateId, formats);
      for (let j = 0; j < formats.length; j += 1) {
        const f = String(formats[j] || '').toLowerCase();
        if (f && f !== 'png') activeFormatSet.add(f);
      }
    }
    const activeFormats = Array.from(activeFormatSet.values()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const wantsPng = Array.from(formatsByTemplateId.values()).some((fs) => Array.isArray(fs) && fs.includes('png'));
    const needsPsdExport = activeFormats.length > 0;
    if (needsPsdExport || wantsPng) {
      if (!Array.isArray(selectedTaskTemplateIds) || selectedTaskTemplateIds.length === 0 || rawItems.length === 0) {
        return alert('请先选择至少一个任务模板');
      }
      if (primaryPsIdSet.size === 0) return alert('该任务模板未配置图片变量');
    }

    const missingPrimary = items
      .map((it) => {
        const templateId = String(it?.templateId || '').trim();
        if (!templateId) return null;
        const fs = formatsByTemplateId.get(templateId) || getTemplateExportFormats(templateId, it?.exportFormats);
        const needsNonPng = Array.isArray(fs) && fs.some((f) => String(f || '').toLowerCase() !== 'png');
        if (!needsNonPng) return null;
        if (primaryPsIdByTemplateId.get(templateId)) return null;
        const name =
          (typeof it?.originalPsdName === 'string' && it.originalPsdName.trim() ? it.originalPsdName.trim() : '') ||
          `PSD_${templateId.slice(0, 6)}`;
        return `${toFriendlyUploadedName(name)}（${templateId}）`;
      })
      .filter(Boolean);
    if (missingPrimary.length > 0) {
      return alert(`存在模板未匹配到图片变量，已阻止导出：${missingPrimary.slice(0, 6).join('、')}${missingPrimary.length > 6 ? '…' : ''}`);
    }

    {
      const missingGuidePickTemplates = [];
      const getPick = (picks, psId) => {
        if (!picks || typeof picks !== 'object') return null;
        if (Object.prototype.hasOwnProperty.call(picks, String(psId))) return picks[String(psId)];
        if (Object.prototype.hasOwnProperty.call(picks, psId)) return picks[psId];
        return null;
      };
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i] || {};
        const templateId = String(it?.templateId || '').trim();
        if (!templateId) continue;
        const picks = it?.guidePicks && typeof it.guidePicks === 'object' ? it.guidePicks : null;
        const psIds = Array.isArray(it?.selectedPsIds) ? it.selectedPsIds : [];
        const cleaned = psIds.map((n) => Math.trunc(Number(n))).filter((n) => Number.isFinite(n) && n > 0);
        if (cleaned.length > 0) {
          const ok = cleaned.every((psId) => isValidGuidePick(getPick(picks, psId)));
          if (!ok) missingGuidePickTemplates.push(it);
          continue;
        }
        if (!picks) {
          missingGuidePickTemplates.push(it);
          continue;
        }
        const keys = Object.keys(picks);
        const anyBound = keys.some((k) => {
          const psId = Math.trunc(Number(k));
          if (!Number.isFinite(psId) || psId <= 0) return false;
          return isValidGuidePick(getPick(picks, psId));
        });
        if (!anyBound) missingGuidePickTemplates.push(it);
      }
      if (missingGuidePickTemplates.length > 0) {
        const shown = missingGuidePickTemplates
          .map((it) => {
            const templateId = String(it?.templateId || '').trim();
            const name =
              (typeof it?.originalPsdName === 'string' && it.originalPsdName.trim() ? it.originalPsdName.trim() : '') ||
              `PSD_${String(templateId).slice(0, 6)}`;
            return toFriendlyUploadedName(name);
          })
          .filter(Boolean)
          .slice(0, 8)
          .join('、');
        const suffix = missingGuidePickTemplates.length > 8 ? '…' : '';
        return alert(`以下 PSD 尚未绑定参考线，已阻止导出：${shown}${suffix}\n\n操作：进入“绑定参考线”模式 → 选中图片变量 → 在画布上点两次（左/右）完成绑定。`);
      }
    }

    const primaryPsIds = Array.from(primaryPsIdSet.values()).sort((a, b) => a - b);
    const templateUnionPsIds = (() => {
      const set = new Set();
      for (let i = 0; i < items.length; i += 1) {
        const ids = Array.isArray(items[i]?.selectedPsIds) ? items[i].selectedPsIds : [];
        for (let j = 0; j < ids.length; j += 1) {
          const n = Math.trunc(Number(ids[j]));
          if (!Number.isFinite(n) || n <= 0) continue;
          set.add(n);
        }
      }
      return Array.from(set.values()).sort((a, b) => a - b);
    })();

    const wantsTransparentPsd = needsPsdExport && items.some((it) => /png/i.test(String(it?.originalPsdName || it?.name || '')));
    setMissingChannelHints([]);
    let uploadedChannelStoredNameById = new Map();
    if (wantsPng || wantsTransparentPsd) {
      try {
        uploadedChannelStoredNameById = await ensureChannelMasksUploaded({ masks: channelMasks });
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '上传通道图失败';
        return alert(msg);
      }
    }
    const masksForCutoutCompose = wantsPng || wantsTransparentPsd
      ? channelMasks.map((m) => ({
          ...m,
          storedName: String(m?.storedName || uploadedChannelStoredNameById.get(m?.id) || ''),
        }))
      : [];

    let pngTargets = [];
    if (wantsPng) {
      try {
        const pngItems = items.filter((it) => {
          const templateId = String(it?.templateId || '').trim();
          if (!templateId) return false;
          const fs = formatsByTemplateId.get(templateId) || getTemplateExportFormats(templateId, it?.exportFormats);
          return Array.isArray(fs) && fs.includes('png');
        });
        pngTargets = buildTemplatePngTargets(pngItems);
      } catch (e) {
        const msg = e && e.message ? String(e.message) : 'PNG 导出缺少参考线绑定';
        return alert(msg);
      }
    }

    if (!needsPsdExport) {
      const batchId = `cutout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      perfRef.current = { batchId, batchStart: now(), uploads: new Map(), exports: new Map() };
      setIsGenerating(true);
      const needGrouping = taskTemplateGroupingEnabled && templateUnionPsIds.length > 1;
      let exportGroups = [];
      if (needGrouping) {
        const groups = Array.isArray(taskTemplateImageGroups) ? taskTemplateImageGroups : [];
        const valid = [];
        const invalidNames = [];
        for (let i = 0; i < groups.length; i += 1) {
          const g = groups[i] || {};
          const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
          let ok = true;
          for (let j = 0; j < templateUnionPsIds.length; j += 1) {
            const psId = templateUnionPsIds[j];
            const imgId = String(assignments[String(psId)] || '');
            if (!imgId) {
              ok = false;
              break;
            }
          }
          if (ok) valid.push(g);
          else invalidNames.push(String(g?.name || `组合_${i + 1}`));
        }
        if (valid.length === 0) return alert('请先完成分组分配（每组需要为所有变量选择图片）');
        if (invalidNames.length > 0) {
          alert(`已忽略未完成分组：${invalidNames.slice(0, 6).join('、')}${invalidNames.length > 6 ? '…' : ''}`);
        }
        exportGroups = valid;
      } else {
        exportGroups = readyImages.map((img, idx) => ({
          id: String(img?.id || idx),
          name: String(img?.name || `产品图_${idx + 1}`),
          assignments: primaryPsIds.reduce((acc, psId) => {
            acc[String(psId)] = String(img?.id || '');
            return acc;
          }, {}),
        }));
      }
      const uploadProductImageCount = readyImages.filter((img) => img && img.file && !img.serverImagePath).length;
      const exportTotal = exportGroups.length * (Array.isArray(pngTargets) ? pngTargets.length : 0);
      setGenerationProgress({
        current: 0,
        total: uploadProductImageCount + exportTotal,
        phase: '准备上传',
      });
      setBundleExportResults([]);

      let uploadedImagePathById = new Map();
      try {
        uploadedImagePathById = await ensureProductImagesUploaded({ images: readyImages, batchId });
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '上传产品图失败';
        setIsGenerating(false);
        return alert(msg);
      }
      setGenerationProgress((p) => ({ ...p, phase: '合成PNG' }));

      try {
        const pngRows = await runCutoutComposeForPngByTemplateGroups({
          exportGroups,
          uploadedImagePathById,
          targets: pngTargets,
          masks: masksForCutoutCompose,
        });
        setGenerationResults(pngRows);
        advanceGenerationProgress(pngRows.length, '合成PNG');
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '无PSD抠图合成失败';
        const fallback = [];
        const targetList = Array.isArray(pngTargets) ? pngTargets : [];
        for (let pi = 0; pi < targetList.length; pi += 1) {
          const t = targetList[pi];
          for (let gi = 0; gi < exportGroups.length; gi += 1) {
            const g = exportGroups[gi] || {};
            fallback.push({
              psdId: String(t?.templateKey || 'template'),
              psdName: String(t?.psdName || '模板'),
              imgId: String(g?.id || `g_${gi}`),
              imgName: String(g?.name || `组合_${gi + 1}`),
              imgUrl: null,
              serverImagePath: null,
              status: 'error',
              error: msg,
              formatResults: { png: { status: 'error', url: null, error: msg } },
            });
          }
        }
        setGenerationResults(fallback);
        advanceGenerationProgress(fallback.length, '合成PNG');
        alert(msg);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    const needGrouping = taskTemplateGroupingEnabled && templateUnionPsIds.length > 1;
    let exportGroups = [];
    if (needGrouping) {
      const groups = Array.isArray(taskTemplateImageGroups) ? taskTemplateImageGroups : [];
      const valid = [];
      const invalidNames = [];
      for (let i = 0; i < groups.length; i += 1) {
        const g = groups[i] || {};
        const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
        let ok = true;
        for (let j = 0; j < templateUnionPsIds.length; j += 1) {
          const psId = templateUnionPsIds[j];
          const imgId = String(assignments[String(psId)] || '');
          if (!imgId) {
            ok = false;
            break;
          }
        }
        if (ok) valid.push(g);
        else invalidNames.push(String(g?.name || `组合_${i + 1}`));
      }
      if (valid.length === 0) return alert('请先完成分组分配（每组需要为所有变量选择图片）');
      if (invalidNames.length > 0) {
        alert(`已忽略未完成分组：${invalidNames.slice(0, 6).join('、')}${invalidNames.length > 6 ? '…' : ''}`);
      }
      exportGroups = valid;
    } else {
      exportGroups = readyImages.map((img, idx) => ({
        id: String(img?.id || idx),
        name: String(img?.name || `产品图_${idx + 1}`),
        assignments: primaryPsIds.reduce((acc, psId) => {
          acc[String(psId)] = String(img?.id || '');
          return acc;
        }, {}),
      }));
    }
    const usedImageIds = new Set();
    for (let i = 0; i < exportGroups.length; i += 1) {
      const g = exportGroups[i] || {};
      const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
      const keys = Object.keys(assignments);
      for (let j = 0; j < keys.length; j += 1) {
        const v = String(assignments[keys[j]] || '');
        if (!v) continue;
        usedImageIds.add(v);
      }
    }
    const imagesToUpload = readyImages.filter((img) => usedImageIds.has(String(img?.id || '')));
    const batchId = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    perfRef.current = { batchId, batchStart: now(), uploads: new Map(), exports: new Map() };
    const templatesForPsdExport = items.filter((it) => {
      const templateId = String(it?.templateId || '').trim();
      if (!templateId) return false;
      if (!primaryPsIdByTemplateId.get(templateId)) return false;
      const fs = formatsByTemplateId.get(templateId) || getTemplateExportFormats(templateId, it?.exportFormats);
      return Array.isArray(fs) && fs.some((f) => String(f || '').toLowerCase() !== 'png');
    });
    const expectedFormatsByTemplateId = new Map();
    for (let i = 0; i < templatesForPsdExport.length; i += 1) {
      const templateId = String(templatesForPsdExport[i]?.templateId || '').trim();
      if (!templateId) continue;
      const fs = formatsByTemplateId.get(templateId) || getTemplateExportFormats(templateId, templatesForPsdExport[i]?.exportFormats);
      const expected = Array.isArray(fs) ? fs.filter((f) => String(f || '').toLowerCase() !== 'png') : [];
      expectedFormatsByTemplateId.set(templateId, expected);
    }
    const bundlePsdWantedByTemplateId = new Set();
    const effectiveBundlePsd = bundlePsdEnabled === true && exportSummary.canBundlePsd === true;
    if (effectiveBundlePsd) {
      for (let i = 0; i < templatesForPsdExport.length; i += 1) {
        const templateId = String(templatesForPsdExport[i]?.templateId || '').trim();
        if (!templateId) continue;
        const expected = expectedFormatsByTemplateId.get(templateId) || [];
        if (Array.isArray(expected) && expected.includes('psd')) bundlePsdWantedByTemplateId.add(templateId);
      }
    }
    console.info('[EXPORT_DEBUG] 任务模板导出计划', {
      bundlePsdEnabled,
      canBundlePsd: exportSummary.canBundlePsd,
      effectiveBundlePsd,
      productImages: Array.isArray(productImages) ? productImages.length : 0,
      taskTemplateItems: Array.isArray(taskTemplateItems) ? taskTemplateItems.length : 0,
      templateIds: Array.from(new Set(items.map((it) => String(it?.templateId || '').trim()).filter(Boolean))).length,
      templatesForPsdExport: templatesForPsdExport.length,
      wantsPng,
      activeFormats,
      templates: Array.from(expectedFormatsByTemplateId.entries()).map(([templateId, fs]) => ({ templateId, formats: fs })),
    });
    let totalNonPng = 0;
    if (needsPsdExport) {
      for (let i = 0; i < templatesForPsdExport.length; i += 1) {
        const templateId = String(templatesForPsdExport[i]?.templateId || '').trim();
        const expected = expectedFormatsByTemplateId.get(templateId) || [];
        const perTaskExpected =
          bundlePsdWantedByTemplateId.has(templateId) && Array.isArray(expected)
            ? expected.filter((f) => String(f || '').toLowerCase() !== 'psd')
            : expected;
        totalNonPng += exportGroups.length * (Array.isArray(perTaskExpected) ? perTaskExpected.length : 0);
      }
    }
    const totalPng = wantsPng ? exportGroups.length * (Array.isArray(pngTargets) ? pngTargets.length : 0) : 0;
    const totalBundleTasks = bundlePsdWantedByTemplateId.size > 0 ? bundlePsdWantedByTemplateId.size * exportGroups.length : 0;
    const uploadProductImageCount = imagesToUpload.filter((img) => img && img.file && !img.serverImagePath).length;
    setIsGenerating(true);
    setGenerationProgress({
      current: 0,
      total: uploadProductImageCount + totalNonPng + totalPng + totalBundleTasks,
      phase: '准备上传',
    });
    setBundleExportResults([]);

    let uploadedImagePathById = new Map();
    try {
      uploadedImagePathById = await ensureProductImagesUploaded({ images: imagesToUpload, batchId });
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '上传产品图失败';
      setIsGenerating(false);
      return alert(msg);
    }
    setGenerationProgress((p) => ({ ...p, phase: '正在导出' }));

    const templateIds = Array.from(
      new Set(
        items
          .map((it) => String(it?.templateId || '').trim())
          .filter((id) => id),
      ),
    );
    const templateVarMapById = new Map();
    try {
      for (let i = 0; i < templateIds.length; i += 1) {
        const templateId = templateIds[i];
        const { res } = await fetchWithFallback(`/api/template/${templateId}`);
        const data = await readJsonSafely(res);
        if (!res.ok) {
          const msg = data?.message || data?.error || `HTTP ${res.status}`;
          throw new Error(`加载模板变量失败（${templateId}）：${msg}`);
        }
        const vars = Array.isArray(data?.variables) ? data.variables : [];
        const byPsId = new Map();
        vars.forEach((v) => {
          const psId = Number(v?.psId);
          if (!Number.isFinite(psId)) return;
          byPsId.set(psId, v);
        });
        templateVarMapById.set(templateId, byPsId);
      }
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '加载模板变量失败';
      setIsGenerating(false);
      return alert(msg);
    }

    const tasks = [];
    const bundleEntryGroups = new Map();
    exportGroups.forEach((g, gi) => {
      templatesForPsdExport.forEach((it) => {
        const templateId = String(it?.templateId || '');
        const tId = String(templateId || '').trim();
        const primaryPsId = primaryPsIdByTemplateId.get(tId) || null;
        const expectedAll = expectedFormatsByTemplateId.get(tId) || [];
        const expectedFormats =
          bundlePsdWantedByTemplateId.has(tId) && Array.isArray(expectedAll)
            ? expectedAll.filter((f) => String(f || '').toLowerCase() !== 'psd')
            : expectedAll;
        const task = {
          psdId: templateId,
          psdName:
            (typeof it?.originalPsdName === 'string' && it.originalPsdName.trim() ? it.originalPsdName.trim() : '') ||
            `PSD_${templateId.slice(0, 6)}`,
          imgId: String(g?.id || `g_${gi + 1}`),
          imgName: String(g?.name || `组合_${gi + 1}`),
          serverTemplateId: templateId,
          selectedPsIds: primaryPsId ? [primaryPsId] : [],
          guidePicks: it?.guidePicks || it?.guidePick || null,
          assignments: g?.assignments && typeof g.assignments === 'object' ? g.assignments : {},
          expectedFormats,
          status: 'pending',
        };
        if (bundlePsdWantedByTemplateId.has(tId)) {
          const arr = bundleEntryGroups.get(String(templateId)) || [];
          arr.push({ task });
          bundleEntryGroups.set(String(templateId), arr);
        }
        if (Array.isArray(expectedFormats) && expectedFormats.length > 0) {
          tasks.push(task);
        }
      });
    });

    setGenerationResults(tasks.map((t) => ({ ...t })));

    const groups = new Map();
    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      const key = String(task.serverTemplateId);
      const arr = groups.get(key) || [];
      arr.push({ index: i, task });
      groups.set(key, arr);
    }

    if (bundlePsdWantedByTemplateId.size > 0) {
      const seen = new Set();
      const orderedTemplateIds = [];
      templatesForPsdExport.forEach((it) => {
        const tid = String(it?.templateId || '').trim();
        if (!tid) return;
        if (!bundlePsdWantedByTemplateId.has(tid)) return;
        if (seen.has(tid)) return;
        seen.add(tid);
        orderedTemplateIds.push(tid);
      });

      const bundleRows = [];
      orderedTemplateIds.forEach((templateId) => {
        const tplId = String(templateId);
        const entries = bundleEntryGroups.get(tplId) || [];
        const hint =
          templatesForPsdExport.find((it) => String(it?.templateId || '').trim() === String(tplId || '').trim()) || null;
        const psdName =
          (typeof hint?.originalPsdName === 'string' && hint.originalPsdName.trim() ? hint.originalPsdName.trim() : '') ||
          `PSD_${String(tplId).slice(0, 6)}`;
        const totalCount = entries.length;
        const maxBundleTasks = Math.min(200, computeChunkSize(tplId, totalCount));
        const parts = Math.max(1, Math.ceil(totalCount / maxBundleTasks));
        for (let part = 0; part < parts; part += 1) {
          const start = part * maxBundleTasks;
          const count = Math.max(0, Math.min(maxBundleTasks, totalCount - start));
          const partLabel = parts > 1 ? `（第${part + 1}/${parts}卷）` : '';
          bundleRows.push({
            bundleKey: `${tplId}__part_${part + 1}`,
            templateId: tplId,
            serverTemplateId: tplId,
            psdName,
            imgName: `合并 ${count} 张产品图${partLabel}`,
            status: 'pending',
            error: null,
            resultUrl: null,
            resultFormat: 'psd',
            bundlePart: part + 1,
            bundleParts: parts,
            bundleStart: start,
            bundleCount: count,
          });
        }
      });
      setBundleExportResults(bundleRows);

      for (let bi = 0; bi < bundleRows.length; bi += 1) {
        const row = bundleRows[bi];
        const bundleKey = String(row?.bundleKey || '');
        const templateId = row.serverTemplateId;
        const workUnits = Math.max(0, Math.floor(Number(row?.bundleCount) || 0));
        const entriesAll = bundleEntryGroups.get(String(templateId)) || [];
        const partEntries = entriesAll.slice(Number(row?.bundleStart) || 0, (Number(row?.bundleStart) || 0) + (Number(row?.bundleCount) || 0));
        if (partEntries.length === 0) {
          setBundleExportResults((prev) =>
            prev.map((b) =>
              b.bundleKey === bundleKey
                ? { ...b, status: 'error', error: '未找到可导出的任务（请检查变量选择与产品图）' }
                : b,
            ),
          );
          advanceGenerationProgress(Math.max(1, workUnits), '合并PSD');
          continue;
        }

        setBundleExportResults((prev) =>
          prev.map((b) => (b.bundleKey === bundleKey ? { ...b, status: 'processing', error: null } : b)),
        );

        const apiTasks = partEntries.map(({ task }, idx) => {
          const psIds = Array.isArray(task.selectedPsIds) ? task.selectedPsIds : [];
          const varMap = templateVarMapById.get(templateId) || null;
          const updates = psIds
            .map((psId) => Number(psId))
            .filter((n) => Number.isFinite(n))
            .map((psId) => {
              const base = varMap ? varMap.get(psId) : null;
              const assignments = task.assignments && typeof task.assignments === 'object' ? task.assignments : {};
              const imgId = String(assignments[String(psId)] || '');
              const img = imgId ? productImageById.get(imgId) : null;
              const serverImagePath = img?.serverImagePath || uploadedImagePathById.get(imgId) || null;
              const update = serverImagePath
                ? { psId, varType: 'img', imagePath: serverImagePath }
                : { psId, varType: 'img', value: img?.url || '' };
              if (base?.name != null) update.name = String(base.name);
              if (base?.id != null) update.id = String(base.id);
              {
                const src0 = String(img?.name || task.imgName || '').trim();
                const vname = base?.name != null ? String(base.name).trim() : '';
                update.sourceName = [src0, vname].filter(Boolean).join(' ');
                const angleHint = parseAngleHint(src0) || parseAngleHint(vname);
                const modelHint = parseModelHint(src0);
                if (angleHint) update.angleHint = angleHint;
                if (modelHint) update.modelHint = modelHint;
              }
              const x = Number(base?.x);
              const y = Number(base?.y);
              const width = Number(base?.width);
              const height = Number(base?.height);
              if (Number.isFinite(x)) update.x = x;
              if (Number.isFinite(y)) update.y = y;
              if (Number.isFinite(width)) update.width = width;
              if (Number.isFinite(height)) update.height = height;
              const guidePicks = task.guidePicks && typeof task.guidePicks === 'object' ? task.guidePicks : null;
              const gp = guidePicks ? (guidePicks[String(psId)] || guidePicks[psId]) : null;
              const leftX = Math.round(Number(gp?.leftX));
              const rightX = Math.round(Number(gp?.rightX));
              if (Number.isFinite(leftX) && Number.isFinite(rightX)) {
                update.guidePick = { leftX, rightX };
              }
              return update;
            });
          const label = `${task.psdId}_${task.imgId}__${task.imgName || String((Number(row?.bundleStart) || 0) + idx + 1)}`;
          return { label, updates };
        });

        try {
          const psdName =
            partEntries?.[0]?.task?.originalPsdName != null
              ? String(partEntries[0].task.originalPsdName)
              : partEntries?.[0]?.task?.psdName != null
                ? String(partEntries[0].task.psdName)
                : '';
          const needChannelsForPsd = /png/i.test(psdName);
          const channelsForReq = needChannelsForPsd
            ? masksForCutoutCompose
                .map((m) => {
                  const storedName = String(m?.storedName || '').trim();
                  if (!storedName) return null;
                  const sourceName = String(m?.name || m?.originalName || storedName).trim();
                  return { storedName, sourceName };
                })
                .filter(Boolean)
            : null;
          const out = await requestBatchExportWithRetry(
            {
              templateId,
              tasks: apiTasks,
              format: 'psd',
              bundlePsd: true,
              ...(needChannelsForPsd ? { channels: channelsForReq } : {}),
            },
            { maxAttempts: 4, baseDelayMs: 2500 },
          );
          const data = out?.data || null;
          const url = data?.bundle?.url ? String(data.bundle.url) : '';
          if (!url) throw new Error('服务端未返回合并PSD下载地址');
          setBundleExportResults((prev) =>
            prev.map((b) =>
              b.bundleKey === bundleKey ? { ...b, status: 'success', resultUrl: url, resultFormat: 'psd' } : b,
            ),
          );
        } catch (e) {
          const msg = e && e.message ? String(e.message) : '合并导出失败';
          setBundleExportResults((prev) =>
            prev.map((b) => (b.bundleKey === bundleKey ? { ...b, status: 'error', error: msg } : b)),
          );
        }

        advanceGenerationProgress(partEntries.length, '合并PSD');
      }
    }

    const perTaskFormats = bundlePsdWantedByTemplateId.size > 0 ? activeFormats.filter((f) => String(f || '').toLowerCase() !== 'psd') : activeFormats;
    for (const currentFormat of perTaskFormats) {
      const effectiveQuality = currentFormat === 'jpeg' ? exportJpegQuality : 100;
      const formatLabel = currentFormat.toUpperCase();

      for (const [templateId, entries] of groups.entries()) {
        const expected = Array.isArray(entries?.[0]?.task?.expectedFormats) ? entries[0].task.expectedFormats : [];
        if (expected.length === 0 || !expected.includes(currentFormat)) continue;
        let cursor = 0;
        while (cursor < entries.length) {
          const chunkSize = computeChunkSize(templateId, entries.length - cursor);
          const chunk = entries.slice(cursor, cursor + chunkSize);
          cursor += chunk.length;
          setGenerationResults((prev) => {
            const next = [...prev];
            chunk.forEach(({ index }) => {
              const existing = next[index] || {};
              const formatResults = existing.formatResults || {};
              formatResults[currentFormat] = { status: 'processing', url: null, error: null };
              next[index] = { ...existing, formatResults, status: 'processing' };
            });
            return next;
          });

          chunk.forEach(({ task }) => {
            perfRef.current.exports.set(`${templateId}_${task.imgId}_${task.psdId}_${currentFormat}`, {
              start: now(),
              psdName: task.psdName,
              imgName: task.imgName,
              format: currentFormat,
            });
          });

          const buildApiTasks = (list) => {
            return list.map(({ task }) => {
              const psIds = Array.isArray(task.selectedPsIds) ? task.selectedPsIds : [];
              const varMap = templateVarMapById.get(templateId) || null;
              const imgForName = task.imgId ? productImageById.get(String(task.imgId)) : null;
              const updates = psIds
                .map((psId) => Number(psId))
                .filter((n) => Number.isFinite(n))
                .map((psId) => {
                  const base = varMap ? varMap.get(psId) : null;
                  const assignments = task.assignments && typeof task.assignments === 'object' ? task.assignments : {};
                  const imgId = String(assignments[String(psId)] || '');
                  const img = imgId ? productImageById.get(imgId) : null;
                  const serverImagePath = img?.serverImagePath || uploadedImagePathById.get(imgId) || null;
                  const update = serverImagePath
                    ? { psId, varType: 'img', imagePath: serverImagePath }
                    : { psId, varType: 'img', value: img?.url || '' };
                  if (base?.name != null) update.name = String(base.name);
                  if (base?.id != null) update.id = String(base.id);
                  {
                    const src0 = String(img?.name || task.imgName || task.imgId || '').trim();
                    const vname = base?.name != null ? String(base.name).trim() : '';
                    update.sourceName = [src0, vname].filter(Boolean).join(' ');
                    const angleHint = parseAngleHint(src0) || parseAngleHint(vname);
                    const modelHint = parseModelHint(src0);
                    if (angleHint) update.angleHint = angleHint;
                    if (modelHint) update.modelHint = modelHint;
                  }
                  const x = Number(base?.x);
                  const y = Number(base?.y);
                  const width = Number(base?.width);
                  const height = Number(base?.height);
                  if (Number.isFinite(x)) update.x = x;
                  if (Number.isFinite(y)) update.y = y;
                  if (Number.isFinite(width)) update.width = width;
                  if (Number.isFinite(height)) update.height = height;
                  const guidePicks = task.guidePicks && typeof task.guidePicks === 'object' ? task.guidePicks : null;
                  const gp = guidePicks ? (guidePicks[String(psId)] || guidePicks[psId]) : null;
                  const leftX = Math.round(Number(gp?.leftX));
                  const rightX = Math.round(Number(gp?.rightX));
                  if (Number.isFinite(leftX) && Number.isFinite(rightX)) {
                    update.guidePick = { leftX, rightX };
                  }
                  return update;
                });
              const rawImgName = String(imgForName?.name || task.imgName || task.imgId || 'image');
              const safeImgName = sanitizeZipNameSegment(rawImgName).replace(/\.[^/.]+$/g, '');
              return {
                label: `${task.psdId}_${task.imgId}_${currentFormat}`,
                fileBase: `${safeImgName}_${formatLabel}`,
                updates,
                format: currentFormat,
                quality: effectiveQuality,
              };
            });
          };

          const pendingChunks = [chunk];
          while (pendingChunks.length > 0) {
            const part = pendingChunks.shift();
            const apiTasks = buildApiTasks(part);
            try {
              const chunkStartedAt = now();
              const payload = {
                templateId,
                tasks: apiTasks,
                format: currentFormat,
                quality: effectiveQuality,
                transparentBackground: currentFormat === 'png',
                ...(String(currentFormat || '').toLowerCase() === 'psd' &&
                /png/i.test(String(entries?.[0]?.task?.originalPsdName || entries?.[0]?.task?.psdName || '')) &&
                masksForCutoutCompose.length > 0
                  ? {
                      channels: masksForCutoutCompose
                        .map((m) => {
                          const storedName = String(m?.storedName || '').trim();
                          if (!storedName) return null;
                          const sourceName = String(m?.name || m?.originalName || storedName).trim();
                          return { storedName, sourceName };
                        })
                        .filter(Boolean),
                    }
                  : {}),
              };
              const out = await requestBatchExportWithRetry(payload, { maxAttempts: 3, baseDelayMs: 2000 });
              const data = out?.data || null;
              const chunkCost = Math.max(0, now() - chunkStartedAt);
              updateChunkStatsOnSuccess({ templateId, tasksCount: part.length, costMs: chunkCost });
              const results = Array.isArray(data?.results) ? data.results : [];
              const byLabel = new Map();
              results.forEach((r) => {
                if (!r) return;
                const label = r.label != null ? String(r.label) : '';
                if (!label) return;
                byLabel.set(label, r);
              });

              const changes = part.map(({ index, task }) => {
                const label = `${task.psdId}_${task.imgId}_${currentFormat}`;
                const r = byLabel.get(label) || null;
                const exportKey = `${templateId}_${task.imgId}_${task.psdId}_${currentFormat}`;
                const cost = Math.round(now() - (perfRef.current.exports.get(exportKey)?.start || now()));
                if (r && r.ok === true && r.url) {
                  console.info('[性能] 批量生成导出完成', { 批次: batchId, PSD: task.psdName, 产品图: task.imgName, 格式: currentFormat, 耗时: cost, 导出地址: r.url });
                  return { index, formatStatus: 'success', formatUrl: r.url, formatError: null, currentFormat };
                }
                const errText =
                  Array.isArray(r?.errors) && r.errors.length > 0
                    ? String(r.errors[0]?.message || r.errors[0]?.name || '导出失败')
                    : '导出失败';
                return { index, formatStatus: 'error', formatUrl: null, formatError: errText, currentFormat };
              });
            {
              const okCount = changes.filter((c) => c.formatStatus === 'success').length;
              const errCount = changes.length - okCount;
              if (errCount > 0) {
                const sample = changes.find((c) => c.formatStatus === 'error');
                console.warn('[EXPORT_DEBUG] 批量导出存在失败项', {
                  templateId,
                  format: currentFormat,
                  chunk: changes.length,
                  ok: okCount,
                  error: errCount,
                  sampleError: sample?.formatError || null,
                });
              }
            }

              setGenerationResults((prev) => {
                const next = [...prev];
                changes.forEach((cc) => {
                  const existing = next[cc.index] || {};
                  const formatResults = existing.formatResults || {};
                  formatResults[cc.currentFormat] = {
                    status: cc.formatStatus,
                    url: cc.formatUrl,
                    error: cc.formatError,
                  };
                  const expectedFormats = Array.isArray(existing.expectedFormats) ? existing.expectedFormats : activeFormats;
                  const allFormatsDone = expectedFormats.every((f) => formatResults[f]?.status !== 'processing');
                  const anySuccess = expectedFormats.some((f) => formatResults[f]?.status === 'success');
                  const allFailed = expectedFormats.every((f) => formatResults[f]?.status === 'error');
                  let overallStatus = 'processing';
                  if (allFormatsDone) {
                    overallStatus = anySuccess ? 'success' : (allFailed ? 'error' : 'success');
                  }
                  const isSingleFormat = expectedFormats.length === 1;
                  const singleFormatUrl = isSingleFormat && cc.formatStatus === 'success' ? cc.formatUrl : existing.resultUrl;
                  next[cc.index] = {
                    ...existing,
                    formatResults,
                    status: overallStatus,
                    resultUrl: singleFormatUrl || existing.resultUrl,
                    resultFormat: isSingleFormat ? cc.currentFormat : existing.resultFormat,
                  };
                });
                return next;
              });
              advanceGenerationProgress(part.length, '正在导出');
            } catch (e) {
              updateChunkStatsOnFailure({ templateId, err: e });
              const missing =
                String(currentFormat || '').toLowerCase() === 'png' && Array.isArray(e?.server?.missingChannels)
                  ? e.server.missingChannels
                  : [];
              if (missing.length > 0) setMissingChannelHints(missing);
              if (part.length > 1 && isRetryableBatchExportError(e)) {
                const mid = Math.ceil(part.length / 2);
                pendingChunks.unshift(part.slice(mid), part.slice(0, mid));
                continue;
              }
              setGenerationResults((prev) => {
                const next = [...prev];
                part.forEach(({ index }) => {
                  const msg = e && e.message ? String(e.message) : '批量导出失败';
                  const existing = next[index] || {};
                  const formatResults = existing.formatResults || {};
                  formatResults[currentFormat] = { status: 'error', url: null, error: msg };
                  next[index] = { ...existing, formatResults, status: 'error' };
                });
                return next;
              });
              advanceGenerationProgress(part.length, '正在导出');
            }
          }
        }
      }
    }

    if (wantsPng) {
      try {
        const pngRows = await runCutoutComposeForPngByTemplateGroups({
          exportGroups,
          uploadedImagePathById,
          targets: pngTargets,
          masks: masksForCutoutCompose,
        });
        setGenerationResults((prev) => mergeRowsByKey(prev, pngRows));
        advanceGenerationProgress(pngRows.length, '合成PNG');
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '无PSD抠图合成失败';
        const fallback = [];
        const targetList = Array.isArray(pngTargets) ? pngTargets : [];
        for (let pi = 0; pi < targetList.length; pi += 1) {
          const t = targetList[pi];
          for (let gi = 0; gi < exportGroups.length; gi += 1) {
            const g = exportGroups[gi] || {};
            fallback.push({
              psdId: String(t?.templateKey || 'template'),
              psdName: String(t?.psdName || '模板'),
              imgId: String(g?.id || `g_${gi}`),
              imgName: String(g?.name || `组合_${gi + 1}`),
              imgUrl: null,
              serverImagePath: null,
              status: 'error',
              error: msg,
              formatResults: { png: { status: 'error', url: null, error: msg } },
            });
          }
        }
        setGenerationResults((prev) => mergeRowsByKey(prev, fallback));
        advanceGenerationProgress(fallback.length, '合成PNG');
        alert(msg);
      }
    }

    setIsGenerating(false);
  };

  const handleBatchGenerate = async () => {
    if (isGenerating) return;
    if (taskMode === 'template') return handleBatchGenerateFromTaskTemplate();
    return handleBatchGenerateReal();
  };
  
  const handleExportAll = async () => {
     if (isZipping) return;
     const seen = new Set();
     const successes = [];
     (Array.isArray(bundleExportResults) ? bundleExportResults : []).forEach((r) => {
       if (!r || r.status !== 'success' || !r.resultUrl) return;
       const fmt = String(r?.resultFormat || 'psd').toLowerCase();
       const key = `${String(r.resultUrl)}__${fmt}`;
       if (seen.has(key)) return;
       seen.add(key);
       successes.push({ ...r, resultFormat: fmt });
     });
     generationResults.forEach((r) => {
       if (!r) return;
      const expectedFormatsRaw = Array.isArray(r.expectedFormats) ? r.expectedFormats : [];
      const expectedFormats =
        expectedFormatsRaw.length > 0
          ? expectedFormatsRaw
              .map((x) => String(x || '').trim().toLowerCase())
              .map((x) => (x === 'jpg' ? 'jpeg' : x))
              .filter(Boolean)
          : null;
       const formatResults = r.formatResults || {};
       Object.keys(formatResults).forEach((fmt) => {
         const fr = formatResults[fmt] || null;
         if (!fr || fr.status !== 'success' || !fr.url) return;
         const f = String(fmt || '').toLowerCase();
        const normalized = f === 'jpg' ? 'jpeg' : f;
        if (expectedFormats && !expectedFormats.includes(normalized)) return;
        const key = `${String(fr.url)}__${normalized}`;
         if (seen.has(key)) return;
         seen.add(key);
         successes.push({
           ...r,
           resultUrl: fr.url,
          resultFormat: normalized,
         });
       });
     });
     if (successes.length === 0) return alert('没有生成成功的文件');

     const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
     const total = successes.length;
    const platformLabel = (() => {
      const labels = new Set();
      for (let i = 0; i < successes.length; i += 1) {
        const it = successes[i] || {};
        const p = detectPlatform(it?.psdName || it?.originalPsdName || it?.name || '');
        const label = String(p?.platformLabel || '').trim();
        if (!label || label === '未识别平台') continue;
        labels.add(label);
      }
      if (labels.size === 1) return Array.from(labels.values())[0];
      if (labels.size > 1) return '多平台';
      return '未识别平台';
    })();
    const zipBaseName = `${sanitizeZipNameSegment(platformLabel)}_批量导出_${timestamp}`;
    const runPolicy = normalizeZipPolicyForRun(zipPolicy, successes);
    const maxBytesPerPart = Math.max(1, Math.floor(Number(runPolicy.maxSizeMB) * 1024 * 1024));
    const hardMaxBytesPerPart = Math.max(1, Math.floor(Number(runPolicy.hardMaxSizeMB) * 1024 * 1024));

     setIsZipping(true);
     setZipProgress({ current: 0, total, part: 1, parts: null });

     let failed = 0;
     let skipped = 0;
     let oversizeDirect = 0;
     let splitReason = '';
     try {
       let partIndex = 1;
       let partFiles = 0;
       let partBytes = 0;
       let zip = new JSZip();
       let usedPaths = new Set();

       const flushZip = async () => {
         if (!zip || partFiles <= 0) return;
         const content = await zip.generateAsync({ type: 'blob' });
         const name = partIndex <= 1 ? `${zipBaseName}.zip` : `${zipBaseName}_第${partIndex}卷.zip`;
         downloadBlob(content, name);
       };

       for (let i = 0; i < successes.length; i += 1) {
         const item = successes[i];
         try {
           const picked = await pickUsableDownloadResponse(item.resultUrl);
           if (!picked) {
             failed += 1;
             continue;
           }
           const blob = await picked.res.blob();
           const blobSize = Number(blob?.size) || 0;
           const urlExt = extFromUrl(item.resultUrl);
           const fileName = buildExportFileName({
             psdName: item.psdName,
             imgName: item.imgName,
             urlExt,
             fallbackFormat: pickFallbackFormatFromTask(item),
           });
           if (blobSize > hardMaxBytesPerPart) {
             oversizeDirect += 1;
             downloadBlob(blob, fileName);
             continue;
           }
           const entry = buildZipEntry({
             psdName: item.psdName,
             imgName: item.imgName,
             resultFormat: item.resultFormat,
             defaultFileName: fileName,
           });
           if (entry && entry.skip) {
             skipped += 1;
             continue;
           }
           const relativePath = dedupeZipRelativePath(entry?.relativePath || fileName, usedPaths);
           if (!relativePath) {
             skipped += 1;
             continue;
           }

           const wouldExceedHard = partFiles > 0 && partBytes + blobSize > hardMaxBytesPerPart;
           const wouldExceedSoft =
             partFiles > 0 && (partFiles >= Number(runPolicy.maxFiles) || partBytes + blobSize > maxBytesPerPart);
           if (wouldExceedHard || wouldExceedSoft) {
             if (!splitReason) {
               splitReason = wouldExceedHard ? '单卷体积超过硬上限' : '单卷体积或文件数超过阈值';
             }
             await flushZip();
             partIndex += 1;
             setZipProgress((prev) => ({ ...prev, part: partIndex, parts: partIndex }));
             zip = new JSZip();
             usedPaths = new Set();
             partFiles = 0;
             partBytes = 0;
           }

           usedPaths.add(relativePath);
           zip.file(relativePath, blob);
           partFiles += 1;
           partBytes += blobSize;
         } catch {
           failed += 1;
         } finally {
           setZipProgress((prev) => ({ ...prev, current: Math.min(prev.total, prev.current + 1) }));
         }
       }

       await flushZip();
       setZipProgress((prev) => ({ ...prev, parts: partIndex }));
     } finally {
       setIsZipping(false);
     }
    const tips = [];
    if (splitReason) tips.push(`已自动分卷：${splitReason}（策略：${runPolicy.label}）`);
    if (failed > 0) tips.push(`存在 ${failed} 个文件下载失败，已打包其余文件`);
    if (skipped > 0) tips.push(`存在 ${skipped} 个文件按规则已跳过`);
    if (oversizeDirect > 0) tips.push(`存在 ${oversizeDirect} 个超大文件已改为单独下载`);
    if (tips.length > 0) alert(tips.join('；'));
  };

  const exportSummary = (() => {
    const out = { hasPng: false, hasJpeg: false, hasPsd: false, canBundlePsd: false, bundlePsdReason: '' };
    if (taskMode === 'fresh') {
      const psds = psdFiles.filter((p) => p && p.status === 'success');
      let psdExportCount = 0;
      let singleImageVarOk = true;
      for (let i = 0; i < psds.length; i += 1) {
        const p = psds[i];
        const fs = getFreshExportFormats(p.id, p.name);
        if (fs.includes('png')) out.hasPng = true;
        if (fs.includes('jpeg')) out.hasJpeg = true;
        if (fs.includes('psd')) out.hasPsd = true;
        const nonPng = fs.filter((f) => f !== 'png');
        if (nonPng.length > 0) {
          psdExportCount += 1;
        }
        if (fs.includes('psd')) {
          const key = String(p?.id || '');
          const selectedSetRaw = selectedPsIdsByPsdId.get(key);
          const selectedSet = selectedSetRaw instanceof Set ? selectedSetRaw : new Set();
          if (selectedSet.size <= 0) {
            singleImageVarOk = false;
          } else {
            const vars = Array.isArray(p?.parsed?.variables) ? p.parsed.variables : [];
            let imgCount = 0;
            vars.forEach((v) => {
              const psId = Math.trunc(Number(v?.psId));
              if (!Number.isFinite(psId)) return;
              if (!selectedSet.has(psId)) return;
              const t = String(v?.varType || v?.type || '').toLowerCase();
              if (t === 'img' || t === 'image') imgCount += 1;
            });
            if (imgCount !== 1) singleImageVarOk = false;
          }
        }
      }
      if (!out.hasPsd) out.bundlePsdReason = '未勾选 PSD 导出';
      else if (psdExportCount <= 0) out.bundlePsdReason = '无可导出的 PSD 模板';
      else if (!singleImageVarOk) out.bundlePsdReason = '合并PSD要求每个PSD选择且仅选择 1 个图片变量（可同时选文本变量）';
      else out.canBundlePsd = true;
      return out;
    }
    if (taskMode === 'template') {
      const items = Array.isArray(taskTemplateItems) ? taskTemplateItems : [];
      const seen = new Set();
      let psdExportCount = 0;
      let singleImageVarOk = true;
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i] || {};
        const templateId = String(it?.templateId || '').trim();
        if (!templateId || seen.has(templateId)) continue;
        seen.add(templateId);
        const fs = getTemplateExportFormats(templateId, it?.exportFormats);
        if (fs.includes('png')) out.hasPng = true;
        if (fs.includes('jpeg')) out.hasJpeg = true;
        if (fs.includes('psd')) out.hasPsd = true;
        const nonPng = fs.filter((f) => f !== 'png');
        if (nonPng.length > 0) {
          psdExportCount += 1;
        }
        if (fs.includes('psd')) {
          const ids = Array.isArray(it?.selectedPsIds) ? it.selectedPsIds : [];
          const picked = ids
            .map((v) => Math.trunc(Number(v)))
            .filter((v) => Number.isFinite(v) && v > 0);
          if (picked.length !== 1) singleImageVarOk = false;
        }
      }
      if (!out.hasPsd) out.bundlePsdReason = '未勾选 PSD 导出';
      else if (psdExportCount <= 0) out.bundlePsdReason = '无可导出的 PSD 模板';
      else if (!singleImageVarOk) out.bundlePsdReason = '合并PSD要求每个PSD选择且仅选择 1 个图片变量（可同时选文本变量）';
      else out.canBundlePsd = true;
      return out;
    }
    return out;
  })();

  return (
    <BatchTabErrorBoundary>
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-100px)]">
      {/* Left: Inputs */}
      <div className="col-span-3 flex flex-col gap-4 min-h-0">
        {/* PSD Upload */}
        <div
          className={[
            'bg-gray-800/50 border rounded-2xl p-4 flex flex-col gap-3 shadow-lg flex-1 min-h-0 relative',
            psdDropActive && taskMode === 'fresh'
              ? 'border-emerald-400/40 ring-2 ring-emerald-400/20 bg-emerald-500/5'
              : 'border-white/10',
          ].join(' ')}
          onDragEnter={handlePsdDragEnter}
          onDragOver={handlePsdDragOver}
          onDragLeave={handlePsdDragLeave}
          onDrop={handlePsdDrop}
        >
           <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                 <Layers className="w-4 h-4 text-emerald-500" /> {taskMode === 'template' ? '任务模板 PSD' : 'PSD 模板'} ({taskMode === 'template' ? taskTemplateItems.length : psdFiles.length})
              </h3>
              <div className="flex items-center gap-2">
                {taskMode === 'fresh' && (
                  <>
                    <button
                      type="button"
                      onClick={openSaveDialog}
                      disabled={psdFiles.filter((p) => p.status === 'success').length === 0 || totalSelectedVariableCount === 0}
                      className="p-1.5 bg-indigo-500/15 text-indigo-300 rounded-lg hover:bg-indigo-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="保存为任务模板（需要管理员登录）"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={clearAllPsds}
                      disabled={psdFiles.length === 0}
                      className="p-1.5 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 hover:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="清空当前 PSD 列表"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
                      title="上传 PSD"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    <input ref={fileInputRef} type="file" multiple accept=".psd" className="hidden" onChange={handlePsdUpload} />
                  </>
                )}
                {taskMode === 'template' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await loadTaskTemplates();
                      const ids = Array.isArray(selectedTaskTemplateIds)
                        ? selectedTaskTemplateIds.map((x) => String(x || '').trim()).filter(Boolean)
                        : [];
                      for (let i = 0; i < ids.length; i += 1) {
                        await loadTaskTemplateDetail(ids[i]);
                      }
                    }}
                    className="p-1.5 bg-emerald-500/15 text-emerald-300 rounded-lg hover:bg-emerald-500/25 transition-colors"
                    title="刷新任务模板列表"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>
           </div>
           <div className="flex items-center gap-2">
             <div className="flex items-center p-1 bg-black/20 border border-white/10 rounded-xl">
               <button
                 type="button"
                 onClick={() => setTaskMode('fresh')}
                 className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                   taskMode === 'fresh' ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                 }`}
               >
                 从0创建
               </button>
               <button
                 type="button"
                 onClick={() => setTaskMode('template')}
                 className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                   taskMode === 'template' ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                 }`}
               >
                 从任务模板
               </button>
             </div>
             {taskMode === 'template' && (
             <div className="flex items-center gap-2 flex-1 min-w-0">
              <div ref={taskTemplateSelectRootRef} className="w-full min-w-0 relative">
                <button
                  type="button"
                  onClick={() => setTaskTemplateSelectOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 bg-black/20 border border-white/10 rounded-xl px-2.5 py-1.5 text-[11px] text-gray-200 outline-none hover:border-emerald-500/25"
                  aria-expanded={taskTemplateSelectOpen}
                >
                  <span className="truncate">
                    {selectedTaskTemplateIds.length > 0
                      ? `已选 ${selectedTaskTemplateIds.length} 个任务模板（预览：${selectedTaskTemplate ? selectedTaskTemplate.name : '未选择'}）`
                      : '请选择任务模板'}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {isTaskTemplateLoading ? <Loader2 className="w-4 h-4 text-gray-500 animate-spin" /> : null}
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </span>
                </button>

                {taskTemplateSelectOpen ? (
                  <div className="absolute left-0 top-full mt-2 z-30 min-w-[420px] w-fit rounded-2xl border border-white/10 bg-gray-950/90 backdrop-blur-md shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
                      <div className="text-[11px] text-gray-400 truncate">勾选可多选，点击名称可切换预览</div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            selectAllTaskTemplates();
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10"
                        >
                          全选
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                      {taskTemplates.length === 0 ? (
                        <div className="px-3 py-8 text-center text-[11px] text-gray-500">暂无任务模板</div>
                      ) : (
                        taskTemplates.map((t) => {
                          const tid = String(t?.id || '');
                          const checked = selectedTaskTemplateIdSet.has(tid);
                          const isPreview = String(selectedTaskTemplateId || '') === tid;
                          return (
                            <div
                              key={tid}
                              className={[
                                'flex items-center gap-2 px-3 py-2 border-b border-white/5',
                                isPreview ? 'bg-emerald-500/10' : 'bg-transparent',
                              ].join(' ')}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTaskTemplateSelection(tid)}
                                className="accent-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!checked) toggleTaskTemplateSelection(tid);
                                  setSelectedTaskTemplateId(tid);
                                  setTaskTemplateSelectOpen(false);
                                }}
                                className="flex-1 min-w-0 text-left text-[11px] text-gray-200 truncate hover:text-white"
                                title={String(t?.name || tid)}
                              >
                                {String(t?.name || tid)}
                              </button>
                              {isPreview ? (
                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/25">
                                  预览中
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="shrink-0 p-1 rounded-md border border-white/10 bg-white/5 text-gray-300 hover:bg-rose-500/15 hover:border-rose-500/25 hover:text-rose-200 transition-colors"
                                title="删除任务模板"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!confirm(`确认删除任务模板：${String(t?.name || tid)}？`)) return;
                                  deleteTaskTemplate(tid);
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleExportAllTaskTemplates}
                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors shrink-0 z-10 relative"
                title="导出全部任务模板"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <label
                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors shrink-0 cursor-pointer z-10 relative"
                title="导入任务模板"
              >
                <Upload className="w-3.5 h-3.5" />
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportAllTaskTemplates}
                />
              </label>
             </div>
             )}
           </div>
           <div className="text-[10px] text-gray-500">
              {taskMode === 'template'
                ? '从任务模板发起时无需上传 PSD，直接上传产品图并生成'
                : '每个 PSD 可独立选择变量，列表显示该 PSD 已选数量'}
           </div>
           {taskMode === 'template' && taskTemplateError ? (
             <div className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-2 py-1">
               {taskTemplateError}
             </div>
           ) : null}
           {taskMode === 'template' && taskTemplateNotice ? (
             <div className="text-[10px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-2 py-1">
               {taskTemplateNotice}
             </div>
           ) : null}
           
           {psdDropActive && taskMode === 'fresh' ? (
             <div className="absolute inset-3 rounded-2xl border border-emerald-400/30 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
               <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-100 text-xs">
                 松开即可添加 PSD
               </div>
             </div>
           ) : null}

          <div className="flex-1 overflow-y-auto flex flex-col space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
              {taskMode === 'fresh' &&
                psdFiles.map((psd) => {
                  const formats = getFreshExportFormats(psd.id, psd.name);
                  return (
                 <div 
                   key={psd.id} 
                   onClick={() => psd.status === 'success' && setBasePsdId(psd.id)}
                   className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                      basePsdId === psd.id 
                      ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/20' 
                      : 'bg-black/20 border-white/5 hover:bg-white/5'
                   }`}
                 >
                    <div className="flex flex-col truncate">
                       <span className="text-gray-300 truncate font-medium" title={psd.name}>{psd.name}</span>
                       <span className="text-[10px] text-gray-500">
                          {psd.status === 'parsing' ? '解析中...' : 
                           psd.status === 'error' ? '解析失败' : 
                           `${psd.parsed?.width}x${psd.parsed?.height}`}
                       </span>
                       <div className="mt-1 flex flex-wrap gap-1">
                         {[
                           { key: 'png', label: 'PNG' },
                           { key: 'jpeg', label: 'JPG' },
                           { key: 'psd', label: 'PSD' },
                         ].map((fmt) => {
                           const checked = formats.includes(fmt.key);
                           const onlyOne = formats.length === 1;
                           return (
                             <button
                               key={fmt.key}
                               type="button"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (psd.status !== 'success') return;
                                 if (checked && onlyOne) return;
                                 setExportFormatsByPsdId((prev) => {
                                   const next = new Map(prev);
                                   const current = normalizeExportFormats(next.get(psd.id), defaultExportFormatsFromPsdName(psd.name));
                                   const nextSet = new Set(current);
                                   if (nextSet.has(fmt.key)) nextSet.delete(fmt.key);
                                   else nextSet.add(fmt.key);
                                   const normalized = normalizeExportFormats(Array.from(nextSet.values()), defaultExportFormatsFromPsdName(psd.name));
                                   next.set(psd.id, normalized);
                                   return next;
                                 });
                                 setBundleExportResults([]);
                               }}
                               className={[
                                 'px-2 py-0.5 rounded-full border text-[10px] transition-colors',
                                 checked
                                   ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                                   : 'bg-black/20 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20',
                                 checked && onlyOne ? 'opacity-80' : '',
                               ].join(' ')}
                               title={psd.status !== 'success' ? 'PSD 解析完成后可调整导出格式' : '导出格式'}
                             >
                               {fmt.label}
                             </button>
                           );
                         })}
                       </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(selectedCountByPsdId[psd.id] || 0) > 0 ? (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            psd.id === basePsdId
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20'
                          }`}
                        >
                          已选 {selectedCountByPsdId[psd.id]}层
                        </span>
                      ) : null}
                      {(selectedCountByPsdId[psd.id] || 0) > 0 ? (
                        <span
                          className={[
                            'text-[10px] px-1.5 py-0.5 rounded-full border',
                            hasGuidePickByPsdId[psd.id]
                              ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-200/70 border-rose-500/15',
                          ].join(' ')}
                        >
                          {hasGuidePickByPsdId[psd.id] ? '已绑参考线' : '未绑参考线'}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePsd(psd.id);
                        }}
                        className="p-1 rounded-md border border-white/10 bg-white/5 text-gray-300 hover:bg-rose-500/15 hover:border-rose-500/25 hover:text-rose-200 transition-colors"
                        title="删除 PSD"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                 </div>
                  );
                })}
              {taskMode === 'template' &&
                taskTemplateItems.map((it, idx) => {
                  const templateId = String(it?.templateId || '').trim();
                  const formats = getTemplateExportFormats(templateId, it?.exportFormats);
                  const originalPsdNameRaw =
                    (typeof it?.originalPsdName === 'string' && it.originalPsdName.trim() ? it.originalPsdName.trim() : '') ||
                    `PSD_${String(it?.templateId || '').slice(0, 6)}`;
                  const originalPsdName = toFriendlyUploadedName(originalPsdNameRaw);
                  return (
                  <div
                    key={`${String(it?.__taskTemplateId || 't')}_${String(it?.templateId || 'psd')}_${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveTaskTemplateCanvasId(String(it?.templateId || '').trim());
                      setActiveTaskTemplateHotspotId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTaskTemplateCanvasId(String(it?.templateId || '').trim());
                        setActiveTaskTemplateHotspotId(null);
                      }
                    }}
                    className={[
                      'p-2 rounded-lg border text-xs flex items-center justify-between transition-all cursor-pointer',
                      String(activeTaskTemplateCanvasId || '').trim() === String(it?.templateId || '').trim()
                        ? 'bg-emerald-500/10 border-emerald-500/35 ring-1 ring-emerald-500/20'
                        : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10',
                    ].join(' ')}
                  >
                    <div className="flex flex-col truncate">
                      <span
                        className="text-gray-300 truncate font-medium"
                        title={`${originalPsdName} / ${String(it?.templateId || '')}`}
                      >
                        {originalPsdName}
                      </span>
                      <span className="text-[10px] text-gray-500">{String(it?.__taskTemplateName || '任务模板')} / {String(it.templateId)}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {[
                          { key: 'png', label: 'PNG' },
                          { key: 'jpeg', label: 'JPG' },
                          { key: 'psd', label: 'PSD' },
                        ].map((fmt) => {
                          const checked = formats.includes(fmt.key);
                          const onlyOne = formats.length === 1;
                          return (
                            <button
                              key={fmt.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!templateId) return;
                                if (checked && onlyOne) return;
                                setExportFormatsByTemplateId((prev) => {
                                  const next = new Map(prev);
                                  const current = getTemplateExportFormats(templateId, it?.exportFormats);
                                  const nextSet = new Set(current);
                                  if (nextSet.has(fmt.key)) nextSet.delete(fmt.key);
                                  else nextSet.add(fmt.key);
                                  const normalized = normalizeExportFormats(Array.from(nextSet.values()), current);
                                  next.set(templateId, normalized);
                                  return next;
                                });
                                setBundleExportResults([]);
                              }}
                              className={[
                                'px-2 py-0.5 rounded-full border text-[10px] transition-colors',
                                checked
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                                  : 'bg-black/20 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20',
                                checked && onlyOne ? 'opacity-80' : '',
                              ].join(' ')}
                              title="导出格式"
                            >
                              {fmt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">
                      变量 {Array.isArray(it.selectedPsIds) ? it.selectedPsIds.length : 0}
                    </span>
                  </div>
                  );
                })}
              {taskMode === 'fresh' && psdFiles.length === 0 && (
                 <button
                   type="button"
                   onClick={() => fileInputRef.current?.click()}
                   className={[
                     'flex-1 text-center py-10 text-xs border-2 border-dashed rounded-xl w-full transition-colors',
                     psdDropActive ? 'border-emerald-400/35 text-emerald-200 bg-emerald-500/10' : 'border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/15',
                   ].join(' ')}
                 >
                    拖拽或点击上传 PSD
                 </button>
              )}
              {taskMode === 'template' && selectedTaskTemplateIds.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-center py-10 text-gray-600 text-xs border-2 border-dashed border-white/5 rounded-xl">
                  请选择任务模板
                </div>
              )}
              {taskMode === 'template' && selectedTaskTemplateIds.length > 0 && taskTemplateItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center py-10 text-gray-600 text-xs border-2 border-dashed border-white/5 rounded-xl">
                  正在加载任务模板详情...
                </div>
              ) : null}
           </div>
        </div>

        {/* Product Images */}
        <div
          className={[
            'bg-gray-800/50 border rounded-2xl p-4 flex flex-col gap-3 shadow-lg flex-1 min-h-0 relative',
            imgDropActive ? 'border-indigo-400/40 ring-2 ring-indigo-400/20 bg-indigo-500/5' : 'border-white/10',
          ].join(' ')}
          onDragEnter={handleImgDragEnter}
          onDragOver={handleImgDragOver}
          onDragLeave={handleImgDragLeave}
          onDrop={handleImgDrop}
        >
           <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                 <FileImage className="w-4 h-4 text-indigo-500" /> 产品图 ({productImages.length})
              </h3>
              <button onClick={() => imgInputRef.current?.click()} className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors">
                 <Upload className="w-4 h-4" />
              </button>
              <input ref={imgInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
           </div>

           {imgDropActive ? (
             <div className="absolute inset-3 rounded-2xl border border-indigo-400/30 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
               <div className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/25 text-indigo-100 text-xs">
                 松开即可添加产品图
               </div>
             </div>
           ) : null}

           {productImages.length === 0 ? (
             <button
               type="button"
               onClick={() => imgInputRef.current?.click()}
               className={[
                 'flex-1 text-center py-10 text-xs border-2 border-dashed rounded-xl w-full transition-colors',
                 imgDropActive ? 'border-indigo-400/35 text-indigo-200 bg-indigo-500/10' : 'border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/15',
               ].join(' ')}
             >
               拖拽或点击上传产品图
             </button>
           ) : (
             <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2 pr-1 scrollbar-thin scrollbar-thumb-white/10 content-start">
                {productImages.map(img => (
                  <div
                    key={img.id}
                    className="aspect-square bg-black/30 rounded-lg overflow-hidden border border-white/5 relative group"
                    draggable={taskMode === 'template' && taskTemplateUnionPsIds.length > 1}
                    onDragStart={(e) => handleProductImageDragStart(e, img.id)}
                  >
                      {img.url ? (
                         <img src={img.url} className="w-full h-full object-cover" />
                      ) : (
                         <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                         </div>
                      )}
                     {taskMode === 'template' && taskTemplateUnionPsIds.length > 1 ? (
                       (() => {
                         const used = taskTemplateImageUsageCount.get(String(img.id)) || 0;
                         if (!used) return null;
                         return (
                           <div className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded-md bg-black/70 border border-white/10 text-[10px] text-white">
                             已用 {used}
                           </div>
                         );
                       })()
                     ) : null}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                         <span className="text-[10px] text-white text-center break-all line-clamp-2">{img.name}</span>
                      </div>
                      <button 
                         onClick={() => {
                            setProductImages(prev => prev.filter(p => p.id !== img.id));
                            setGenerationResults([]);
                            setGenerationProgress({ current: 0, total: 0 });
                         }}
                         className="absolute top-0 right-0 p-1 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                      >
                         <X className="w-3 h-3" />
                      </button>
                   </div>
                ))}
             </div>
           )}
        </div>

        {/* Channel Masks */}
        <div
          className={[
            'bg-gray-800/50 border rounded-2xl p-4 flex flex-col gap-3 shadow-lg flex-1 min-h-0 relative',
            channelDropActive ? 'border-emerald-400/40 ring-2 ring-emerald-400/20 bg-emerald-500/5' : 'border-white/10',
          ].join(' ')}
          onDragEnter={handleChannelDragEnter}
          onDragOver={handleChannelDragOver}
          onDragLeave={handleChannelDragLeave}
          onDrop={handleChannelDrop}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" /> 通道图 ({channelMasks.length})
            </h3>
            <button
              type="button"
              onClick={() => channelInputRef.current?.click()}
              className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg hover:bg-emerald-500/30 transition-colors"
              title="上传通道图"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              ref={channelInputRef}
              type="file"
              multiple
              accept=".tga"
              className="hidden"
              onChange={handleChannelMaskUpload}
            />
          </div>

          {channelDropActive ? (
            <div className="absolute inset-3 rounded-2xl border border-emerald-400/30 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-100 text-xs">
                松开即可添加通道图（.tga）
              </div>
            </div>
          ) : null}

          {missingChannelHints.length > 0 ? (
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2">
              <div className="font-medium">
                缺少通道图（PNG 抠图需要每个型号 3 个角度：正/侧/45）。请先上传对应通道图后再导出。
              </div>
              <div className="mt-1 text-[11px] text-amber-200/80">
                缺失项（最多显示 6 条）：
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {missingChannelHints.slice(0, 6).map((m, idx) => {
                  const srcRaw = m?.sourceName ? String(m.sourceName) : (m?.label ? String(m.label) : `任务${idx + 1}`);
                  const src = toFriendlyUploadedName(srcRaw);
                  const model = m?.model ? String(m.model) : '未识别型号';
                  const angle = m?.angle ? String(m.angle) : '未识别角度';
                  return (
                    <span
                      key={`${srcRaw}_${idx}`}
                      className="px-1.5 py-0.5 rounded-md bg-black/20 border border-white/10 text-[11px] text-amber-100"
                      title={src}
                    >
                      {src}（{model}/{angle}）
                    </span>
                  );
                })}
                {missingChannelHints.length > 6 ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-black/20 border border-white/10 text-[11px] text-amber-200/80">
                    …共 {missingChannelHints.length} 条
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-[11px] text-amber-200/80">
                命名建议：通道图文件名包含“型号 + 角度”，例如 BA7072 B30 正；或仅用“正/侧/45”三张通用通道图。
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-gray-500">
              PNG 抠图需要通道图。命名建议包含型号与角度，例如：BA7072 B30 正 / BA7072 B30 侧 / BA7072 B30 45。
            </div>
          )}

          {channelMasks.length === 0 ? (
            <button
              type="button"
              onClick={() => channelInputRef.current?.click()}
              className="flex-1 text-center py-6 text-xs border-2 border-dashed rounded-xl w-full transition-colors border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/15"
            >
              拖拽或点击上传通道图（.tga，可多选）
            </button>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
              {channelMasks.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 bg-black/20 border border-white/5 rounded-xl px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div
                      className="text-xs text-gray-200 truncate"
                      title={toFriendlyUploadedName(m.name || m.storedName || '')}
                    >
                      {toFriendlyUploadedName(m.name || m.storedName || '')}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {m.uploadStatus === 'uploading'
                        ? '上传中...'
                        : m.uploadStatus === 'success'
                          ? '已上传'
                          : m.uploadStatus === 'error'
                            ? `上传失败：${m.uploadError || '未知错误'}`
                            : '未上传'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.uploadStatus === 'success' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : m.uploadStatus === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    ) : m.uploadStatus === 'uploading' ? (
                      <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setChannelMasks((prev) => prev.filter((x) => x.id !== m.id))}
                      className="p-1 rounded-md text-gray-500 hover:text-rose-300 hover:bg-rose-500/10"
                      title="移除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Canvas */}
      <div className="col-span-6 bg-gray-900/50 border border-white/10 rounded-2xl p-6 flex flex-col relative shadow-xl overflow-hidden">
         {taskMode === 'template' ? (
           <div className="flex-1 flex flex-col min-h-0">
             <div className="flex items-start justify-between gap-3 mb-4">
               <div className="min-w-0">
                 <h2 className="text-lg font-bold text-gray-200 truncate">
                   任务模板：{selectedTaskTemplate ? selectedTaskTemplate.name : '未选择'}
                 </h2>
                 <p className="text-xs text-gray-500 mt-1">
                   已选图片变量 {taskTemplateUnionPsIds.length} 个
                   {taskTemplateGroupingEnabled
                     ? (taskTemplateUnionPsIds.length > 1 ? `，当前分组 ${taskTemplateImageGroups.length} 组` : '，无需分配')
                     : '（自动回填，无需分组）'}
                 </p>
               </div>
              {taskTemplateGroupingEnabled &&
              selectedTaskTemplateIds.length > 0 &&
              taskTemplateItems.length > 0 &&
              taskTemplateUnionPsIds.length > 1 ? (
                 <div className="flex items-center gap-2 flex-wrap justify-end">
                   <button
                     type="button"
                     onClick={() => rebuildTaskTemplateGroups({ force: true })}
                     className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200"
                   >
                     按顺序自动分组
                   </button>
                   <button
                     type="button"
                     onClick={addEmptyTaskTemplateGroup}
                     className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200"
                   >
                     新增空组
                   </button>
                   <button
                     type="button"
                     onClick={clearAllTaskTemplateGroups}
                     className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 text-red-200"
                   >
                     清空分组
                   </button>
                 </div>
               ) : null}
             </div>

            {selectedTaskTemplateIds.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                <Layers className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-sm text-gray-300">请先选择任务模板</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col gap-4">
                <div
                  className={[
                    'rounded-2xl border border-white/10 bg-black/20 overflow-hidden relative',
                    taskTemplateUnionPsIds.length <= 1 || !taskTemplateGroupingEnabled
                      ? 'flex-1 min-h-0'
                      : 'h-[clamp(620px,70vh,1020px)]',
                  ].join(' ')}
                >
                  {activeTaskTemplateMeta && Number(activeTaskTemplateMeta?.width) > 0 && Number(activeTaskTemplateMeta?.height) > 0 ? (
                    <HudEditor
                      width={activeTaskTemplateMeta.width}
                      height={activeTaskTemplateMeta.height}
                      referenceImage={activeTaskTemplateMeta.imageUrl}
                      showGuides={showGuides}
                      guides={activeTaskTemplateMeta.guides}
                      guideLayers={activeTaskTemplateMeta.guideLayers}
                      guidePicker={activeTaskTemplateGuidePicker}
                      hotspots={(Array.isArray(activeTaskTemplateMeta.variables) ? activeTaskTemplateMeta.variables : []).map((v) => ({
                        ...v,
                        type: v.varType === 'img' ? 'image' : v.varType,
                        rect: { x: v.x, y: v.y, w: v.width, h: v.height },
                      }))}
                      selectedId={activeTaskTemplateHotspotId}
                      highlightedIds={activeTaskTemplateHighlightedHotspotIds}
                      onSelect={(id) => setActiveTaskTemplateHotspotId(id)}
                      showSidePanel={false}
                      readOnly
                      showActiveHotspotLabel={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 p-6 text-center">
                      {activeTaskTemplateMeta?.error ? (
                        <div className="max-w-xl w-full bg-black/30 border border-rose-500/20 rounded-2xl p-4">
                          <div className="text-rose-200 font-medium">任务模板 PSD 无法加载</div>
                          <div className="mt-2 text-[11px] text-gray-400 break-all">
                            templateId: {String(activeTaskTemplateCanvasId || '')}
                          </div>
                          <div className="mt-2 text-[11px] text-rose-200/90 whitespace-pre-wrap break-words">
                            {String(activeTaskTemplateMeta.error)}
                          </div>
                          <div className="mt-3 text-[11px] text-gray-400">
                            该任务模板引用的 PSD 可能已被清理/删除，请在管理后台重新上传对应模板 PSD 或重新保存任务模板。
                          </div>
                        </div>
                      ) : (
                        <div>正在加载任务模板 PSD...</div>
                      )}
                    </div>
                  )}
                  {taskTemplateUnionPsIds.length <= 1 ? (
                    <div className="absolute left-3 bottom-3 px-2 py-1 rounded-lg text-[11px] border border-white/10 bg-black/60 text-gray-200 pointer-events-none">
                      单变量：按产品图逐张回填；仅展示参考线绑定状态
                    </div>
                  ) : null}
                </div>

                {taskTemplateUnionPsIds.length <= 1 || !taskTemplateGroupingEnabled ? null : (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="mb-2 px-3 py-2 rounded-xl border border-white/10 bg-black/20 text-[11px] text-gray-400">
                      拖拽产品图到变量槽位，或点击槽位选择图片；每一组代表一次导出
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                      {taskTemplateImageGroups.length === 0 ? (
                        <div className="py-14 text-center text-xs text-gray-500 border border-dashed border-white/10 rounded-xl">
                          还没有分组，请点击“按顺序自动分组”或“新增空组”
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {taskTemplateImageGroups.map((g, idx) => {
                            const gid = String(g?.id || '');
                            const assignments = g?.assignments && typeof g.assignments === 'object' ? g.assignments : {};
                            let filled = 0;
                            for (let i = 0; i < taskTemplateUnionPsIds.length; i += 1) {
                              const psId = taskTemplateUnionPsIds[i];
                              if (assignments[String(psId)]) filled += 1;
                            }
                            return (
                              <div key={gid || idx} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={String(g?.name || '')}
                                    onChange={(e) => setTaskTemplateGroupName(gid, e.target.value)}
                                    className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600"
                                    placeholder="请输入组名"
                                  />
                                  <div className="text-xs text-gray-500 whitespace-nowrap">
                                    完成 {filled}/{taskTemplateUnionPsIds.length}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeTaskTemplateGroup(gid)}
                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200"
                                    title="删除该组"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-3">
                                  {taskTemplateUnionPsIds.map((psId) => {
                                    const key = String(psId);
                                    const imgId = String(assignments[key] || '');
                                    const img = imgId ? productImageById.get(imgId) : null;
                                    const label = taskTemplateVarLabelByPsId.get(psId) || `psId=${psId}`;
                                    return (
                                      <div key={`${gid}_${key}`} className="w-[180px]">
                                        <div className="text-[11px] text-gray-400 mb-1 truncate">{label}</div>
                                        <div
                                          className={[
                                            'rounded-xl border bg-black/30 overflow-hidden',
                                            img ? 'border-white/10' : 'border-white/10 border-dashed',
                                          ].join(' ')}
                                          onDragOver={(e) => e.preventDefault()}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            const dropped =
                                              e.dataTransfer?.getData?.('application/x-fdesign-image-id') ||
                                              e.dataTransfer?.getData?.('text/plain') ||
                                              '';
                                            assignTaskTemplateGroupImage({ groupId: gid, psId, imageId: dropped });
                                          }}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => setTaskTemplatePicker({ groupId: gid, psId })}
                                            className="w-full h-[96px] flex items-center justify-center text-xs text-gray-300 hover:bg-white/5"
                                          >
                                            {img?.url ? (
                                              <div className="w-full h-full relative">
                                                <img src={img.url} className="w-full h-full object-cover" />
                                                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-white truncate">
                                                  {img.name}
                                                </div>
                                              </div>
                                            ) : (
                                              <span className="text-gray-500">{imgId ? '图片不存在' : '拖入或点击选择'}</span>
                                            )}
                                          </button>
                                        </div>
                                        <div className="mt-1 flex items-center justify-end">
                                          <button
                                            type="button"
                                            onClick={() => clearTaskTemplateGroupSlot(gid, psId)}
                                            className="text-[11px] text-gray-400 hover:text-gray-200"
                                          >
                                            清空
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                 {taskTemplatePicker ? (
                   <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20 p-6">
                     <div className="w-full max-w-3xl bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                       <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                         <div className="text-sm font-semibold text-gray-200">选择产品图</div>
                         <button
                           type="button"
                           onClick={() => setTaskTemplatePicker(null)}
                           className="p-2 rounded-lg hover:bg-white/5 text-gray-300"
                         >
                           <X className="w-4 h-4" />
                         </button>
                       </div>
                       <div className="p-4">
                         {productImages.length === 0 ? (
                           <div className="py-10 text-center text-xs text-gray-500">还没有产品图</div>
                         ) : (
                           <div className="grid grid-cols-6 gap-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                             {productImages.map((img) => (
                               <button
                                 key={img.id}
                                 type="button"
                                 onClick={() => {
                                   assignTaskTemplateGroupImage({
                                     groupId: taskTemplatePicker.groupId,
                                     psId: taskTemplatePicker.psId,
                                     imageId: img.id,
                                   });
                                   setTaskTemplatePicker(null);
                                 }}
                                 className="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/30 hover:border-indigo-400/40"
                                 title={img.name}
                               >
                                 {img.url ? (
                                   <img src={img.url} className="w-full h-full object-cover" />
                                 ) : (
                                   <div className="w-full h-full flex items-center justify-center">
                                     <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                                   </div>
                                 )}
                               </button>
                             ))}
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 ) : null}
               </div>
             )}
           </div>
         ) : basePsd ? (
            <>
               <div className="flex items-center justify-between mb-4 z-10">
                  <div>
                     <h2 className="text-lg font-bold text-gray-200">{basePsd.name}</h2>
                     <p className="text-xs text-gray-500">点击选中要替换的图片变量 (已选 {selectedPsIdSetForBasePsd.size} 个)</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => setShowGuides((v) => !v)}
                      className={[
                        'px-2 py-1 rounded text-xs border transition-colors',
                        showGuides
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                          : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10',
                      ].join(' ')}
                    >
                      {showGuides ? '隐藏参考线' : '显示参考线'}
                    </button>
                    <div className="relative group">
                      <button
                        type="button"
                        disabled={!showGuides || !activeIsImageVariable}
                        onClick={() => {
                          if (!showGuides) return;
                          if (guidePickMode) {
                            setGuidePickMode(false);
                            setGuidePickSaveHint('已保存绑定');
                            const prev = guidePickSaveTimerRef.current;
                            if (prev) clearTimeout(prev);
                            guidePickSaveTimerRef.current = setTimeout(() => setGuidePickSaveHint(''), 2000);
                            return;
                          }
                          setGuidePickMode(true);
                        }}
                        className={[
                          'px-2 py-1 rounded text-xs border transition-colors',
                          !showGuides || !activeIsImageVariable
                            ? 'bg-white/5 text-gray-500 border-white/10 opacity-60 cursor-not-allowed'
                            : guidePickMode
                              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-indigo-500/25 text-indigo-100 border-indigo-400/40 hover:bg-indigo-500/30 hover:border-indigo-300/45 shadow-sm shadow-indigo-500/10',
                        ].join(' ')}
                      >
                        {guidePickMode ? '保存绑定' : '绑定参考线'}
                      </button>
                      {guidePickSaveHint ? (
                        <span className="ml-2 text-[10px] px-2 py-1 rounded border border-emerald-500/25 bg-emerald-500/10 text-emerald-200">
                          {guidePickSaveHint}
                        </span>
                      ) : null}
                      <div
                        className={[
                          'absolute right-0 top-full mt-2 w-[260px] rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
                          'bg-black/80 backdrop-blur-md border-white/10 text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
                          'opacity-0 translate-y-1 pointer-events-none transition-all duration-150',
                          'group-hover:opacity-100 group-hover:translate-y-0',
                        ].join(' ')}
                      >
                        <div className="font-medium text-emerald-100">绑定参考线用法</div>
                        <div className="mt-1 text-gray-200/90">
                          1）先点选画布中的图片变量
                          <br />
                          2）点击“绑定参考线”进入绑定模式
                          <br />
                          3）在绿色框内依次点两条竖向参考线（左→右）
                        </div>
                        {!showGuides ? (
                          <div className="mt-2 text-amber-200/90">提示：先打开“参考线显示”</div>
                        ) : !activeIsImageVariable ? (
                          <div className="mt-2 text-amber-200/90">提示：需要先选中一个图片变量</div>
                        ) : null}
                      </div>
                    </div>
                    {showGuides && activeIsImageVariable ? (
                      <div className="flex items-center gap-2 px-2 py-1 rounded border border-white/10 bg-black/20">
                        <span className="text-[10px] text-gray-400">
                          {activeVariable?.name ? `当前：${String(activeVariable.name)}` : '当前：未选择'}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {activeGuidePick
                            ? `已绑 ${Math.round(activeGuidePick.leftX)}-${Math.round(activeGuidePick.rightX)}px`
                            : activeGuidePickDraft
                              ? (
                                activeGuidePickDraft.leftX != null && activeGuidePickDraft.rightX != null
                                  ? `已选 ${Math.round(activeGuidePickDraft.leftX)}-${Math.round(activeGuidePickDraft.rightX)}px`
                                  : activeGuidePickDraft.leftX != null
                                    ? `已选 左 ${Math.round(activeGuidePickDraft.leftX)}px`
                                    : `已选 右 ${Math.round(activeGuidePickDraft.rightX)}px`
                              )
                              : '未绑定'}
                        </span>
                        {activeGuidePickDraft ? (
                          <button
                            type="button"
                            className="text-[10px] px-2 py-0.5 rounded border border-rose-500/25 text-rose-200 bg-rose-500/10 hover:bg-rose-500/15 transition-colors"
                            onClick={() => {
                              if (!basePsdId || !Number.isFinite(activeVariablePsId)) return;
                              setManualGuidePicksByPsdId((prev) => {
                                const next = new Map(prev);
                                const byPsdPrev = next.get(basePsdId);
                                if (!(byPsdPrev instanceof Map)) return next;
                                const byPsd = new Map(byPsdPrev);
                                byPsd.delete(activeVariablePsId);
                                next.set(basePsdId, byPsd);
                                return next;
                              });
                            }}
                          >
                            清除
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {guidePickMode && showGuides ? (
                      <div className="flex items-center gap-2 px-2 py-1 rounded border border-white/10 bg-black/20">
                        <label className="flex items-center gap-1 text-[10px] text-gray-300 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(guidePickSources?.native)}
                            onChange={(e) => setGuidePickSources((p) => ({ ...(p || {}), native: e.target.checked }))}
                          />
                          原生
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-gray-300 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(guidePickSources?.layer)}
                            onChange={(e) => setGuidePickSources((p) => ({ ...(p || {}), layer: e.target.checked }))}
                          />
                          图层
                        </label>
                        <span className="text-[10px] text-gray-500">先点左边界，再点右边界（可反复重选）</span>
                      </div>
                    ) : null}
                    {isPickDebugEnabled ? (
                      <div className="px-2 py-1 rounded border border-fuchsia-500/20 bg-fuchsia-500/10 text-[10px] text-fuchsia-200">
                        调试：{showGuides ? '参考线开' : '参考线关'} / {guidePickMode ? '绑定开' : '绑定关'} / {activeIsImageVariable ? `psId=${String(activeVariablePsId ?? '')}` : '未选图片变量'} / {guidePicker ? `rect=${Math.round(Number(guidePicker.rect.left))}-${Math.round(Number(guidePicker.rect.right))}` : '无picker'}
                      </div>
                    ) : null}
                    {selectedVariableBadgesForBasePsd.map(({ psId, name, hasGuidePick }) => (
                      <span
                        key={psId}
                        className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30 flex items-center gap-1"
                      >
                        <span className="truncate max-w-[240px]" title={String(name || '')}>{name}</span>
                        <span
                          className={[
                            'text-[10px] px-1.5 py-0.5 rounded-full border',
                            hasGuidePick
                              ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25'
                              : 'bg-rose-500/10 text-rose-200/80 border-rose-500/20',
                          ].join(' ')}
                        >
                          {hasGuidePick ? '已绑' : '未绑'}
                        </span>
                        <X
                          className="w-3 h-3 cursor-pointer hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPsIdsByPsdId((prev) => {
                              const next = new Map(prev);
                              const key = basePsdId;
                              if (!key) return next;
                              const current = next.get(key) instanceof Set ? new Set(next.get(key)) : new Set();
                              current.delete(Number(psId));
                              next.set(key, current);
                              return next;
                            });
                          }}
                        />
                      </span>
                    ))}
                  </div>
               </div>
               <div className="flex-1 relative bg-black/20 rounded-xl overflow-hidden border border-white/5">
                  <HudEditor
                     width={basePsd.parsed.width}
                     height={basePsd.parsed.height}
                     referenceImage={basePsd.parsed.canvasUrl}
                     showGuides={showGuides}
                     guides={basePsd.parsed.guides}
                     guideLayers={basePsd.parsed.guideLayers}
                     guidePicker={guidePicker}
                     hotspots={basePsd.parsed.variables.map(v => ({
                        ...v,
                        type: v.varType === 'img' ? 'image' : v.varType,
                        rect: { x: v.x, y: v.y, w: v.width, h: v.height }
                     }))}
                     selectedId={activeHotspotId}
                     highlightedIds={
                        basePsd.parsed.variables
                          .filter((v) => {
                            const psId = Number(v?.psId);
                            return Number.isFinite(psId) && selectedPsIdSetForBasePsd.has(psId);
                          })
                          .map((v) => v.id)
                     }
                     onSelect={(id) => toggleVariable(id)}
                     showSidePanel={false}
                     readOnly
                     showActiveHotspotLabel={false}
                  />
               </div>
            </>
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
               <Layers className="w-16 h-16 mb-4 opacity-20" />
               <p>请先在左侧选择一个基准 PSD</p>
            </div>
         )}
      </div>

      {/* Right: Progress & Actions */}
      <div className="col-span-3 bg-gray-800/50 border border-white/10 rounded-2xl p-5 flex flex-col shadow-lg min-h-0 overflow-hidden">
         <div className="mb-6">
            <h3 className="font-semibold text-gray-200 mb-2 flex items-center gap-2">
               <Play className="w-4 h-4 text-emerald-500" /> 批量生成
            </h3>
            <div className="p-3 bg-black/20 rounded-xl border border-white/5 space-y-2 text-xs text-gray-400">
               <div className="flex justify-between">
                 <span>PSD模版数量:</span>
                  <span className="text-white">{taskMode === 'template' ? taskTemplateItems.length : psdFiles.filter((p) => p.status === 'success').length}</span>
               </div>
               <div className="flex justify-between">
                  <span>产品图数量:</span>
                  <span className="text-white">{productImages.length}</span>
               </div>
               <div className="flex justify-between pt-2 border-t border-white/10">
                  <span>预计导出:</span>
                  <span className="text-emerald-400 font-bold">
                    {(() => {
                      const imgCount = Array.isArray(productImages) ? productImages.length : 0;
                      const pngPerImage = imgCount;
                      const jpgPerImage = imgCount;
                      const psdPerImage = imgCount;
                      const sum = { png: 0, jpg: 0, psd: 0 };

                      if (taskMode === 'template') {
                        const items = Array.isArray(taskTemplateItems) ? taskTemplateItems : [];
                        const seen = new Set();
                        for (let i = 0; i < items.length; i += 1) {
                          const it = items[i] || {};
                          const templateId = String(it?.templateId || '').trim();
                          if (!templateId || seen.has(templateId)) continue;
                          seen.add(templateId);
                          const fs = getTemplateExportFormats(templateId, it?.exportFormats);
                          const effectiveBundlePsd = bundlePsdEnabled && exportSummary.canBundlePsd;
                          if (fs.includes('png')) sum.png += pngPerImage;
                          if (fs.includes('jpeg')) sum.jpg += jpgPerImage;
                          if (fs.includes('psd')) sum.psd += effectiveBundlePsd ? 1 : psdPerImage;
                        }
                      } else {
                        const psds = psdFiles.filter((p) => p && p.status === 'success');
                        for (let i = 0; i < psds.length; i += 1) {
                          const p = psds[i];
                          const fs = getFreshExportFormats(p.id, p.name);
                          const effectiveBundlePsd = bundlePsdEnabled && exportSummary.canBundlePsd;
                          if (fs.includes('png')) sum.png += pngPerImage;
                          if (fs.includes('jpeg')) sum.jpg += jpgPerImage;
                          if (fs.includes('psd')) sum.psd += effectiveBundlePsd ? 1 : psdPerImage;
                        }
                      }

                      const total = sum.png + sum.jpg + sum.psd;
                      return `${total} 个（PNG ${sum.png} / JPG ${sum.jpg} / PSD ${sum.psd}）`;
                    })()}
                  </span>
               </div>
            </div>

            <div className="mt-3">
              <div className="text-xs text-gray-400 mb-1">导出格式</div>
              <div className="p-2 rounded-xl bg-black/20 border border-white/10 text-[11px] text-gray-500 leading-relaxed">
                <div>可在左侧为每个 PSD 勾选 PNG / JPG / PSD</div>
              </div>
              {exportSummary.hasJpeg ? (
                <div className="mt-2">
                  <div className="text-xs text-gray-400 mb-1">JPG 质量（1-100）</div>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={exportJpegQuality}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setExportJpegQuality(Math.max(1, Math.min(100, Math.floor(n))));
                    }}
                    disabled={isGenerating || isZipping}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-100 outline-none focus:border-emerald-500/40 disabled:opacity-60"
                  />
                </div>
              ) : null}
              {exportSummary.hasPsd ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-black/20 border border-white/10">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-200">合并为单个PSD</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isGenerating || isZipping) return;
                        if (!exportSummary.canBundlePsd) return;
                        setBundlePsdEnabled((v) => !v);
                        setBundleExportResults([]);
                      }}
                      disabled={isGenerating || isZipping || !exportSummary.canBundlePsd}
                      className={[
                        'shrink-0 w-12 h-7 rounded-full border transition-colors relative',
                        bundlePsdEnabled && exportSummary.canBundlePsd
                          ? 'bg-emerald-500/30 border-emerald-400/40'
                          : 'bg-white/5 border-white/10',
                        (isGenerating || isZipping || !exportSummary.canBundlePsd) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/10',
                      ].join(' ')}
                      title={exportSummary.canBundlePsd ? '合并为单个PSD' : (exportSummary.bundlePsdReason || '当前导出配置不支持合并PSD')}
                      aria-pressed={bundlePsdEnabled && exportSummary.canBundlePsd}
                    >
                      <span
                        className={[
                          'absolute top-0.5 w-6 h-6 rounded-full transition-all',
                          bundlePsdEnabled && exportSummary.canBundlePsd ? 'left-5 bg-emerald-300' : 'left-0.5 bg-gray-300',
                        ].join(' ')}
                      />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            
            <button
               onClick={handleBatchGenerate}
               disabled={(() => {
                 if (isGenerating) return true;
                 return taskMode === 'fresh' ? psdFiles.length === 0 : selectedTaskTemplateIds.length === 0;
               })()}
               className={`mt-4 w-full py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                  isGenerating 
                  ? 'bg-gray-700 text-gray-400 cursor-wait' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20'
               }`}
            >
               {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
               {isGenerating ? '正在生成...' : taskMode === 'template' ? '从任务模板生成' : '开始批量生成'}
            </button>
         </div>

         {/* Progress Dashboard */}
         <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">生成队列</h4>
            
            {(() => {
              const displayList = [
                ...(Array.isArray(bundleExportResults) ? bundleExportResults : []),
                ...(Array.isArray(generationResults) ? generationResults : []),
              ];
              return displayList.length > 0;
            })() ? (
               <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 space-y-2 pr-1">
                  {isGenerating && (
                     <div className="mb-2">
                        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                           <MotionDiv 
                              className="h-full bg-emerald-500"
                              initial={{ width: 0 }}
                              animate={{
                                width: `${(() => {
                                  const current = Math.max(0, Math.floor(Number(generationProgress?.current) || 0));
                                  const total = Math.max(0, Math.floor(Number(generationProgress?.total) || 0));
                                  if (!(total > 0)) return 0;
                                  return Math.min(100, Math.max(0, (current / total) * 100));
                                })()}%`,
                              }}
                           />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
                          <div className="truncate">阶段：{String(generationProgress?.phase || '处理中')}</div>
                          <div className="tabular-nums">
                            {Math.max(0, Math.floor(Number(generationProgress?.current) || 0))} / {Math.max(0, Math.floor(Number(generationProgress?.total) || 0))}
                          </div>
                        </div>
                     </div>
                  )}
                  
                  {(() => {
                    const displayList = [
                      ...(Array.isArray(bundleExportResults) ? bundleExportResults : []),
                      ...(Array.isArray(generationResults) ? generationResults : []),
                    ];
                    
                    return displayList.map((task, idx) => {
                      const rowKey = (() => {
                        const bundleKey = String(task?.bundleKey || '').trim();
                        if (bundleKey) return `bundle__${bundleKey}`;
                        const templateId = String(task?.templateId || task?.serverTemplateId || '').trim();
                        const psdId = String(task?.psdId || '').trim();
                        const imgId = String(task?.imgId || task?.imageId || '').trim();
                        const fmt = String(task?.resultFormat || '').trim().toLowerCase();
                        const base =
                          templateId && imgId
                            ? `${templateId}__${imgId}`
                            : psdId && imgId
                              ? `${psdId}__${imgId}`
                              : `${String(task?.psdName || '')}__${String(task?.imgName || '')}`;
                        return `task__${base}__${fmt || 'na'}__${idx}`;
                      })();
                      const formatResults = task.formatResults || {};
                      const formatKeys = Object.keys(formatResults);
                      const hasMultipleFormats = formatKeys.length > 1;
                      const singleFormatKeyRaw = formatKeys.length === 1 ? String(formatKeys[0] || '') : '';
                      const singleFormat = singleFormatKeyRaw ? singleFormatKeyRaw.toLowerCase() : null;
                      const singleFormatResult = singleFormat
                        ? (formatResults[singleFormatKeyRaw] || formatResults[singleFormat] || null)
                        : null;
                      const singleResultUrl =
                        task.resultUrl ||
                        (singleFormatResult && singleFormatResult.status === 'success' && singleFormatResult.url
                          ? singleFormatResult.url
                          : null);
                      const singleResultFormat = String(task.resultFormat || singleFormat || '').toLowerCase();
                      const firstFormatError = (() => {
                        const preferred = ['psd', 'png', 'jpeg'];
                        for (let i = 0; i < preferred.length; i += 1) {
                          const fr = formatResults[preferred[i]] || null;
                          if (fr && fr.status === 'error' && fr.error) return String(fr.error);
                        }
                        const keys = Object.keys(formatResults);
                        for (let i = 0; i < keys.length; i += 1) {
                          const fr = formatResults[keys[i]] || null;
                          if (fr && fr.status === 'error' && fr.error) return String(fr.error);
                        }
                        return null;
                      })();

                      const displayName = fixMojibakeUtf8(getQueueDisplayName(task));
                      const psdNameText = toFriendlyUploadedName(task?.psdName || '');
                      const fmtLabel = (() => {
                        const norm = (v) => String(v || '').toLowerCase();
                        const fmt = norm(singleResultFormat) || norm(extFromUrl(singleResultUrl));
                        if (fmt === 'psd' || fmt === 'psb') return 'PSD';
                        if (fmt === 'jpeg' || fmt === 'jpg') return 'JPG';
                        if (fmt === 'png') return 'PNG';
                        return fmt ? fmt.toUpperCase() : '文件';
                      })();
                      const fmtSummary = (() => {
                        if (!hasMultipleFormats) return { label: fmtLabel, suffix: '' };
                        const order = ['psd', 'png', 'jpeg'];
                        const uniq = Array.from(
                          new Set(Object.keys(formatResults).map((k) => String(k || '').toLowerCase()).filter(Boolean)),
                        );
                        uniq.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                        const primary = uniq.includes('psd') ? 'PSD' : uniq.includes('png') ? 'PNG' : uniq.includes('jpeg') ? 'JPG' : (uniq[0] || '文件').toUpperCase();
                        const suffix = uniq.length > 1 ? `+${uniq.length - 1}` : '';
                        return { label: primary, suffix };
                      })();
                      
                      return (
                        <div key={rowKey} className="p-2 bg-black/20 rounded-lg border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-gray-700 overflow-hidden shrink-0">
                              {task.status === 'success' ? (
                                <div className="w-full h-full bg-emerald-500/20 flex items-center justify-center">
                                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                                </div>
                              ) : task.status === 'error' ? (
                                <div className="w-full h-full bg-red-500/20 flex items-center justify-center">
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                </div>
                              ) : task.status === 'processing' ? (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                </div>
                              ) : (
                                <div className="w-full h-full bg-gray-800" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={[
                                    'shrink-0 text-[10px] leading-none px-1.5 py-1 rounded-md border',
                                    task.status === 'success'
                                      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25'
                                      : task.status === 'error'
                                        ? 'bg-rose-500/15 text-rose-200 border-rose-500/25'
                                        : task.status === 'processing'
                                          ? 'bg-blue-500/15 text-blue-200 border-blue-500/25'
                                          : 'bg-white/5 text-gray-300 border-white/10',
                                  ].join(' ')}
                                  title={hasMultipleFormats ? '多格式导出' : `格式：${fmtSummary.label}`}
                                >
                                  {fmtSummary.label}{fmtSummary.suffix}
                                </span>
                                <div className="text-xs text-gray-200 truncate" title={displayName}>{displayName}</div>
                              </div>
                              <div className="text-[10px] text-gray-500 truncate" title={psdNameText}>{psdNameText}</div>
                              {hasMultipleFormats && firstFormatError ? (
                                <div className="mt-0.5 text-[10px] text-rose-300 truncate">{firstFormatError}</div>
                              ) : task.status === 'error' && task.error && !hasMultipleFormats ? (
                                <div className="mt-0.5 text-[10px] text-rose-300 truncate">{task.error}</div>
                              ) : null}
                            </div>
                            {!hasMultipleFormats && singleResultUrl ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const key = `${rowKey}__single`;
                                  const urlExt = extFromUrl(singleResultUrl);
                                  const fileName = buildExportFileName({
                                    psdName: task?.psdName,
                                    imgName: task?.imgName,
                                    urlExt,
                                    fallbackFormat: singleResultFormat,
                                  });
                                  handleSingleDownload(key, singleResultUrl, fileName);
                                }}
                                disabled={downloadingItems.has(`${rowKey}__single`)}
                                className={[
                                  'shrink-0 p-2 rounded transition-colors',
                                  downloadingItems.has(`${rowKey}__single`)
                                    ? 'text-blue-300 bg-blue-500/20 cursor-not-allowed'
                                    : 'text-gray-400 hover:text-white hover:bg-white/10',
                                ].join(' ')}
                                title={(() => {
                                  const key = `${rowKey}__single`;
                                  const p = downloadProgressByKey.get(key);
                                  if (!downloadingItems.has(key)) return '下载';
                                  if (p && p.total > 0) {
                                    const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
                                    return `下载中 ${pct}%`;
                                  }
                                  return '下载中...';
                                })()}
                                aria-label="下载"
                              >
                                {(() => {
                                  const key = `${rowKey}__single`;
                                  const downloading = downloadingItems.has(key);
                                  if (downloading) {
                                    return <Loader2 className="w-4 h-4 animate-spin" />;
                                  }
                                  return <Download className="w-4 h-4" />;
                                })()}
                              </button>
                            ) : null}
                          </div>
                          
                          {hasMultipleFormats ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(() => {
                                const order = ['psd', 'png', 'jpeg'];
                                const keys = Object.keys(formatResults).map((k) => String(k || '').toLowerCase()).filter(Boolean);
                                const uniq = Array.from(new Set(keys));
                                uniq.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                                return uniq.map((fmt) => {
                                const fr = formatResults[fmt] || {};
                                const fmtLabel = fmt.toUpperCase();
                                const downloadKey = `${rowKey}__${fmt}`;
                                const isDownloading = downloadingItems.has(downloadKey);
                                const progress = downloadProgressByKey.get(downloadKey);
                                const urlExt = extFromUrl(fr?.url);
                                const fileName = buildExportFileName({
                                  psdName: task?.psdName,
                                  imgName: task?.imgName,
                                  urlExt,
                                  fallbackFormat: fmt,
                                });
                                const baseClasses = [
                                  'flex items-center gap-1.5 rounded text-[11px] px-3 py-1.5',
                                  fr.status === 'success' ? 'bg-emerald-500/20 text-emerald-200' :
                                  fr.status === 'error' ? 'bg-red-500/20 text-red-200' :
                                  fr.status === 'processing' ? 'bg-blue-500/20 text-blue-200' :
                                  'bg-gray-700 text-gray-300',
                                ].join(' ');
                                return (
                                  fr.status === 'success' && fr.url ? (
                                    <button
                                      key={fmt}
                                      type="button"
                                      onClick={() => handleSingleDownload(downloadKey, fr.url, fileName)}
                                      disabled={isDownloading}
                                      className={[
                                        baseClasses,
                                        'border border-white/10 transition-colors',
                                        isDownloading ? 'cursor-wait' : 'hover:bg-white/10 hover:text-white',
                                      ].join(' ')}
                                      title={(() => {
                                        if (!isDownloading) return `下载 ${fmtLabel}`;
                                        if (progress && progress.total > 0) {
                                          const pct = Math.min(100, Math.round((progress.loaded / progress.total) * 100));
                                          return `下载中 ${pct}%`;
                                        }
                                        return '下载中...';
                                      })()}
                                    >
                                      <span className="font-semibold">{fmtLabel}</span>
                                      {isDownloading ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Download className="w-3 h-3" />
                                      )}
                                    </button>
                                  ) : (
                                    <div key={fmt} className={[baseClasses, 'border border-white/10'].join(' ')}>
                                      <span className="font-semibold">{fmtLabel}</span>
                                      {fr.status === 'processing' ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : fr.status === 'error' ? (
                                        <AlertCircle className="w-3 h-3" />
                                      ) : null}
                                    </div>
                                  )
                                );
                                });
                              })()}
                            </div>
                          ) : null}
                        </div>
                      );
                    });
                  })()}
               </div>
            ) : (
               <div className="flex-1 flex items-center justify-center text-gray-600 text-xs italic">
                  等待开始...
               </div>
            )}
         </div>

         {/* Export All */}
         <div className="mt-4 pt-4 border-t border-white/10">
            {(() => {
              const seen = new Set();
              let successCount = 0;
              (Array.isArray(bundleExportResults) ? bundleExportResults : []).forEach((r) => {
                if (!r || r.status !== 'success' || !r.resultUrl) return;
                const fmt = String(r?.resultFormat || 'psd').toLowerCase();
                const key = `${String(r.resultUrl)}__${fmt}`;
                if (seen.has(key)) return;
                seen.add(key);
                successCount += 1;
              });
              (Array.isArray(generationResults) ? generationResults : []).forEach((r) => {
                if (!r) return;
                const formatResults = r.formatResults || {};
                Object.keys(formatResults).forEach((fmt) => {
                  const fr = formatResults[fmt] || null;
                  if (!fr || fr.status !== 'success' || !fr.url) return;
                  const f = String(fmt || '').toLowerCase();
                  const key = `${String(fr.url)}__${f}`;
                  if (seen.has(key)) return;
                  seen.add(key);
                  successCount += 1;
                });
              });

              const zipPolicyLabel = (() => {
                const mode = String(zipPolicy?.mode || 'auto').toLowerCase();
                if (mode === 'single') return '尽量单包';
                if (mode === 'custom') {
                  const files = Math.max(1, Math.min(5000, Math.floor(Number(zipPolicy?.maxFiles) || 0))) || 200;
                  const mb = Math.max(50, Math.min(50000, Math.floor(Number(zipPolicy?.maxSizeMB) || 0))) || 800;
                  return `自定义（${files}个 / ${mb}MB）`;
                }
                return '自动（推荐）';
              })();
              
              return (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setZipSettingsOpen((v) => !v)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-xs flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">打包设置</span>
                      <span className="text-[11px] text-gray-400">当前：{zipPolicyLabel}</span>
                    </span>
                    <ChevronDown className={["w-4 h-4 transition-transform", zipSettingsOpen ? "rotate-180" : ""].join(' ')} />
                  </button>

                  {zipSettingsOpen ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <div className="text-[11px] text-gray-400 mb-1">分卷策略</div>
                          <select
                            value={String(zipPolicy?.mode || 'auto')}
                            onChange={(e) => {
                              const v = String(e.target.value || 'auto').toLowerCase();
                              const nextMode = v === 'single' || v === 'custom' ? v : 'auto';
                              setZipPolicy((prev) => ({ ...(prev || {}), mode: nextMode }));
                            }}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500/40"
                          >
                            <option value="auto">自动（推荐）</option>
                            <option value="single">尽量单包</option>
                            <option value="custom">自定义阈值</option>
                          </select>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-400 mb-1">每卷最大文件数</div>
                          <input
                            type="number"
                            min={1}
                            max={5000}
                            disabled={String(zipPolicy?.mode || 'auto').toLowerCase() !== 'custom'}
                            value={Number(zipPolicy?.maxFiles) || 200}
                            onChange={(e) => {
                              const n = Math.floor(Number(e.target.value) || 0);
                              const v = Math.max(1, Math.min(5000, n)) || 200;
                              setZipPolicy((prev) => ({ ...(prev || {}), maxFiles: v, mode: 'custom' }));
                            }}
                            className={[
                              'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500/40',
                              String(zipPolicy?.mode || 'auto').toLowerCase() !== 'custom' ? 'opacity-50 cursor-not-allowed' : '',
                            ].join(' ')}
                          />
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-400 mb-1">每卷最大体积（MB）</div>
                          <input
                            type="number"
                            min={50}
                            max={50000}
                            disabled={String(zipPolicy?.mode || 'auto').toLowerCase() !== 'custom'}
                            value={Number(zipPolicy?.maxSizeMB) || 800}
                            onChange={(e) => {
                              const n = Math.floor(Number(e.target.value) || 0);
                              const v = Math.max(50, Math.min(50000, n)) || 800;
                              setZipPolicy((prev) => ({ ...(prev || {}), maxSizeMB: v, mode: 'custom' }));
                            }}
                            className={[
                              'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-100 outline-none focus:border-indigo-500/40',
                              String(zipPolicy?.mode || 'auto').toLowerCase() !== 'custom' ? 'opacity-50 cursor-not-allowed' : '',
                            ].join(' ')}
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                        提示：PSD/PSB 体积很大时，浏览器打包会更占内存。即使选择“尽量单包”，超过硬上限也会自动分卷以避免卡死。
                      </div>
                    </div>
                  ) : null}

                  <button
                    onClick={handleExportAll}
                    disabled={isGenerating || isZipping || successCount === 0}
                    className={`w-full py-2 rounded-xl font-medium text-xs transition-all flex items-center justify-center gap-2 border ${
                      !isGenerating && !isZipping && successCount > 0
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                        : 'bg-transparent text-gray-600 border-gray-700 cursor-not-allowed'
                    }`}
                  >
                    {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isZipping
                      ? (() => {
                          const cur = Number(zipProgress?.current) || 0;
                          const tot = Number(zipProgress?.total) || 0;
                          const part = Number(zipProgress?.part) || 1;
                          const parts = zipProgress?.parts == null ? null : Number(zipProgress.parts) || null;
                          const base = `正在打包（${cur}/${tot}`;
                          const tail = parts ? `，第${part}/${parts}卷）` : `，第${part}卷）`;
                          return `${base}${tail}`;
                        })()
                      : `一键打包下载（${successCount}）`}
                  </button>
                </div>
              );
            })()}
         </div>
      </div>
    </div>
      {saveDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSaveDialogOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-b from-gray-950/90 to-gray-900/80 shadow-2xl shadow-black/50">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-gray-100">保存为任务模板</div>
                  <div className="mt-1 text-xs text-gray-400">需要管理员登录，保存后所有用户可使用</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSaveDialogOpen(false)}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-1">模板名称</div>
                <input
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder="请输入任务模板名称"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-500/40"
                />
                <div className="mt-2 text-[11px] text-gray-500">
                  将保存：{psdFiles.filter((p) => p.status === 'success').length} 个 PSD、已选变量共 {totalSelectedVariableCount} 个
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSaveDialogOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveTaskTemplate}
                  disabled={isSavingTaskTemplate}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 border ${
                    isSavingTaskTemplate
                      ? 'bg-gray-700/40 text-gray-400 border-white/10 cursor-wait'
                      : 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-500/30 shadow-lg shadow-emerald-500/20'
                  }`}
                >
                  {isSavingTaskTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSavingTaskTemplate ? '正在保存...' : '确认保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </BatchTabErrorBoundary>
  );
}
