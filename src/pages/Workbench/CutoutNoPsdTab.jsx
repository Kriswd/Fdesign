import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Play, Download, Loader2, CheckCircle, AlertCircle, FileImage } from 'lucide-react';
import { createApiClient } from '../../utils/apiClient';

export default function CutoutNoPsdTab({ renderServerBaseUrl }) {
  const apiClient = useMemo(() => createApiClient(renderServerBaseUrl), [renderServerBaseUrl]);
  const resolveDownloadUrl = apiClient.resolveDownloadUrl;
  const MotionDiv = motion.div;

  const [productImages, setProductImages] = useState([]);
  const [channelMasks, setChannelMasks] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [missingChannelHints, setMissingChannelHints] = useState([]);
  const [results, setResults] = useState([]);
  const [productDropActive, setProductDropActive] = useState(false);
  const [channelDropActive, setChannelDropActive] = useState(false);

  const [downloadingItems, setDownloadingItems] = useState(() => new Set());
  const [downloadProgressByKey, setDownloadProgressByKey] = useState(() => new Map());
  const latestBatchIdRef = useRef(`cutout_${Date.now().toString(36)}`);
  const productDragDepthRef = useRef(0);
  const channelDragDepthRef = useRef(0);

  const downloadBlob = (blob, fileName) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60 * 1000);
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
      const res = await fetch(resolveDownloadUrl(url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        downloadBlob(new Blob(chunks), fileName);
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
      console.warn('[cutout] 单张下载失败', { key, error: e });
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < 1200) {
        await new Promise((resolve) => setTimeout(resolve, 1200 - elapsed));
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

  const uploadProducts = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (list.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('batchId', latestBatchIdRef.current);
      for (const f of list) form.append('images', f, f.name);
      const { res } = await apiClient.fetchWithFallback('/api/assets/upload-images', { method: 'POST', body: form });
      const data = await apiClient.readJsonSafely(res);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      const nameByIndex = list.map((f) => String(f?.name || ''));
      setProductImages((prev) => {
        const next = [...prev];
        const imgs = Array.isArray(data.images) ? data.images : [];
        imgs.forEach((img, idx) => {
          const originalName = nameByIndex[idx] || img?.originalName || img?.storedName || '';
          next.push({ imagePath: img.imagePath, storedName: img.storedName, clientId: img.clientId, originalName });
        });
        return next;
      });
    } finally {
      setUploading(false);
    }
  };

  const uploadChannels = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (list.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      for (const f of list) form.append('channels', f, f.name);
      const { res } = await apiClient.fetchWithFallback('/api/assets/upload-channel-masks', { method: 'POST', body: form });
      const data = await apiClient.readJsonSafely(res);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      const nameByIndex = list.map((f) => String(f?.name || ''));
      setChannelMasks((prev) => {
        const next = [...prev];
        const channels = Array.isArray(data.channels) ? data.channels : [];
        channels.forEach((ch, idx) => {
          const originalName = nameByIndex[idx] || ch?.originalName || ch?.storedName || '';
          next.push({ storedName: ch.storedName, clientId: ch.clientId, originalName });
        });
        return next;
      });
    } finally {
      setUploading(false);
    }
  };

  const extractDroppedFiles = (e) => Array.from(e?.dataTransfer?.files || []).filter(Boolean);

  const onProductsDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    productDragDepthRef.current += 1;
    setProductDropActive(true);
  };
  const onProductsDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setProductDropActive(true);
  };
  const onProductsDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    productDragDepthRef.current = Math.max(0, productDragDepthRef.current - 1);
    if (productDragDepthRef.current === 0) setProductDropActive(false);
  };
  const onProductsDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    productDragDepthRef.current = 0;
    setProductDropActive(false);
    const files = extractDroppedFiles(e);
    const images = files.filter((f) => String(f?.type || '').toLowerCase().startsWith('image/'));
    if (files.length > 0 && images.length === 0) {
      setError('仅支持拖拽图片文件');
      return;
    }
    uploadProducts(images);
  };

  const onChannelsDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    channelDragDepthRef.current += 1;
    setChannelDropActive(true);
  };
  const onChannelsDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setChannelDropActive(true);
  };
  const onChannelsDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    channelDragDepthRef.current = Math.max(0, channelDragDepthRef.current - 1);
    if (channelDragDepthRef.current === 0) setChannelDropActive(false);
  };
  const onChannelsDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    channelDragDepthRef.current = 0;
    setChannelDropActive(false);
    const files = extractDroppedFiles(e);
    const tgAs = files.filter((f) => /\.tga$/i.test(String(f?.name || '')));
    if (files.length > 0 && tgAs.length === 0) {
      setError('仅支持拖拽 .tga 通道文件');
      return;
    }
    uploadChannels(tgAs);
  };

  const runCutout = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    setMissingChannelHints([]);
    setResults([]);
    try {
      const payload = {
        images: productImages.map((i) => ({ imagePath: i.imagePath, storedName: i.storedName, sourceName: i.originalName || i.storedName })),
        channels: channelMasks.map((c) => ({ storedName: c.storedName, sourceName: c.originalName || c.storedName })),
        resizeMode: 'exact',
      };
      const { res } = await apiClient.fetchWithFallback('/api/cutout/batch-no-psd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await apiClient.readJsonSafely(res);
      if (!res.ok) {
        if (res.status === 400 && data?.missingChannels) {
          setMissingChannelHints(Array.isArray(data.missingChannels) ? data.missingChannels : []);
        }
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch (e) {
      setError(e && e.message ? String(e.message) : String(e));
    } finally {
      setRunning(false);
    }
  };

  const clearAll = () => {
    setProductImages([]);
    setChannelMasks([]);
    setResults([]);
    setMissingChannelHints([]);
    setError('');
    latestBatchIdRef.current = `cutout_${Date.now().toString(36)}`;
  };

  return (
    <div className="space-y-6">
      <MotionDiv
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-gray-900/60 border border-white/10 rounded-2xl p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-100">批量抠图（无PSD）</div>
            <div className="mt-1 text-xs text-gray-400">
              仅上传产品图与通道 TGA，直接输出透明 PNG。用于绕开 PSD 槽位对齐带来的偏移问题。
            </div>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 text-xs border border-white/10"
          >
            清空
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            className={[
              'bg-black/20 border rounded-2xl p-4',
              productDropActive ? 'border-emerald-400/40 ring-2 ring-emerald-400/20 bg-emerald-500/5' : 'border-white/10',
            ].join(' ')}
            onDragEnter={onProductsDragEnter}
            onDragOver={onProductsDragOver}
            onDragLeave={onProductsDragLeave}
            onDrop={onProductsDrop}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-200 flex items-center gap-2">
                <FileImage className="w-4 h-4" />
                产品图
              </div>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 text-xs border border-emerald-500/30 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                选择上传
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadProducts(e.target.files)}
                />
              </label>
            </div>
            <div className="mt-3 text-[11px] text-gray-400">
              已上传 {productImages.length} 张
            </div>
            <div className="mt-3 max-h-40 overflow-auto space-y-2">
              {productImages.slice(0, 50).map((img, idx) => (
                <div key={`${img.imagePath}_${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-gray-200">{img.originalName || img.storedName}</div>
                    {img.originalName && img.storedName && img.originalName !== img.storedName ? (
                      <div className="truncate text-[10px] text-gray-500">{img.storedName}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setProductImages((prev) => prev.filter((_, i) => i !== idx))}
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
          </div>

          <div
            className={[
              'bg-black/20 border rounded-2xl p-4',
              channelDropActive ? 'border-blue-400/40 ring-2 ring-blue-400/20 bg-blue-500/5' : 'border-white/10',
            ].join(' ')}
            onDragEnter={onChannelsDragEnter}
            onDragOver={onChannelsDragOver}
            onDragLeave={onChannelsDragLeave}
            onDrop={onChannelsDrop}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-200 flex items-center gap-2">
                <FileImage className="w-4 h-4" />
                通道图（TGA）
              </div>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 text-xs border border-blue-500/30 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                选择上传
                <input
                  type="file"
                  multiple
                  accept=".tga"
                  className="hidden"
                  onChange={(e) => uploadChannels(e.target.files)}
                />
              </label>
            </div>
            <div className="mt-3 text-[11px] text-gray-400">
              已上传 {channelMasks.length} 个
            </div>
            <div className="mt-3 max-h-40 overflow-auto space-y-2">
              {channelMasks.slice(0, 50).map((ch, idx) => (
                <div key={`${ch.storedName}_${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-gray-200">{ch.originalName || ch.storedName}</div>
                    {ch.originalName && ch.storedName && ch.originalName !== ch.storedName ? (
                      <div className="truncate text-[10px] text-gray-500">{ch.storedName}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setChannelMasks((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-gray-400 hover:text-white"
                    title="移除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {channelMasks.length > 50 ? (
                <div className="text-[11px] text-gray-500">仅展示前 50 条</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runCutout}
            disabled={uploading || running || productImages.length === 0 || channelMasks.length === 0}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
              uploading || running || productImages.length === 0 || channelMasks.length === 0
                ? 'bg-white/5 text-gray-400 border-white/10 cursor-not-allowed'
                : 'bg-emerald-600 text-white border-emerald-500/40 hover:bg-emerald-500',
            ].join(' ')}
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            开始批量抠图
          </button>
          {uploading ? <div className="text-xs text-gray-400">上传中...</div> : null}
          {error ? (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              {error}
            </div>
          ) : null}
        </div>

        {missingChannelHints.length > 0 ? (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <div className="text-xs font-semibold text-amber-200">缺少通道图</div>
            <div className="mt-2 text-[11px] text-amber-100/80">
              {missingChannelHints.slice(0, 12).map((m, idx) => (
                <div key={idx} className="truncate">
                  {m.sourceName || m.label || 'unknown'}（{m.model || '未知型号'} / {m.angle || '未知角度'}）
                </div>
              ))}
              {missingChannelHints.length > 12 ? <div className="text-[11px] text-amber-100/60">…</div> : null}
            </div>
          </div>
        ) : null}
      </MotionDiv>

      <MotionDiv
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
        className="bg-gray-900/60 border border-white/10 rounded-2xl p-5"
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-100">导出结果</div>
          <div className="text-xs text-gray-500">共 {results.length} 项</div>
        </div>
        <div className="mt-4 space-y-2">
          {results.length === 0 ? (
            <div className="text-xs text-gray-500 bg-black/20 border border-white/10 rounded-2xl p-6">
              暂无结果
            </div>
          ) : (
            results.map((r, idx) => {
              const ok = r && r.ok === true;
              const url = r && r.url ? String(r.url) : '';
              const key = String(idx);
              const fileName = r && r.fileName ? String(r.fileName) : `cutout_${idx}.png`;
              const p = downloadProgressByKey.get(key);
              return (
                <div key={`${r?.label || 'item'}_${idx}`} className="flex items-center justify-between gap-3 bg-black/20 border border-white/10 rounded-2xl px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {ok ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <div className="truncate text-xs text-gray-200">{r?.label || fileName}</div>
                    </div>
                    {!ok && Array.isArray(r?.errors) && r.errors.length > 0 ? (
                      <div className="mt-1 text-[11px] text-rose-200/80 truncate">
                        {String(r.errors[0]?.message || '失败')}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {ok && url ? (
                      <button
                        type="button"
                        onClick={() => handleSingleDownload(key, url, fileName)}
                        disabled={downloadingItems.has(key)}
                        className={[
                          'flex items-center gap-1.5 px-2 py-1 rounded transition-colors text-[10px]',
                          downloadingItems.has(key)
                            ? 'text-blue-300 bg-blue-500/20 cursor-not-allowed'
                            : 'text-gray-400 hover:text-white hover:bg-white/10',
                        ].join(' ')}
                        title={(() => {
                          if (!downloadingItems.has(key)) return '下载单张';
                          if (p && p.total > 0) {
                            const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
                            return `下载中 ${pct}%`;
                          }
                          return '下载中...';
                        })()}
                      >
                        {downloadingItems.has(key) ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>
                              {p && p.total > 0 ? `下载中${Math.min(100, Math.round((p.loaded / p.total) * 100))}%` : '下载中...'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            <span>下载单张</span>
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </MotionDiv>
    </div>
  );
}
