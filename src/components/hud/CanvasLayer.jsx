import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { computeInitialTransform } from '../../utils/canvasViewport';
import { stableSortByZIndex } from '../../utils/templateExtractor';

const getMeasureContext = () => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  return canvas.getContext('2d') || null;
};

let sharedMeasureCtx = null;
const sharedFitCache = new Map();

const splitToGraphemes = (text) => Array.from(String(text || ''));

const wrapTextToLines = (ctx, text, maxWidth) => {
  const width = Number(maxWidth);
  const safeWidth = Number.isFinite(width) && width > 1 ? width : 1;
  const raw = String(text || '');
  const paragraphs = raw.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx += 1) {
    const paragraph = paragraphs[pIdx];
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    const chars = splitToGraphemes(paragraph);
    let line = '';
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i];
      const next = `${line}${ch}`;
      const w = ctx.measureText(next).width;
      if (w <= safeWidth || line === '') {
        line = next;
        continue;
      }
      lines.push(line);
      line = ch;
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : [''];
};

const computeFittedFontSize = ({
  ctx,
  text,
  boxWidth,
  boxHeight,
  fontFamily,
  fontWeight,
  lineHeight,
  minPx = 8,
}) => {
  const w = Number(boxWidth);
  const h = Number(boxHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 2 || h <= 2) return minPx;
  const lh = Number(lineHeight);
  const safeLineHeight = Number.isFinite(lh) && lh > 0 ? lh : 1.02;
  const maxPx = Math.max(minPx, Math.floor(h / safeLineHeight));
  const padX = Math.min(6, Math.max(0, Math.round(w * 0.04)));
  const padY = 0;
  const maxTextWidth = Math.max(1, Math.floor(w - padX * 2));
  const maxTextHeight = Math.max(1, Math.floor(h - padY * 2));

  const family = String(fontFamily || '').trim() || 'sans-serif';
  const weight = fontWeight != null ? String(fontWeight).trim() : '600';

  const fits = (px) => {
    ctx.font = `${weight} ${px}px ${family}`;
    const lines = wrapTextToLines(ctx, text, maxTextWidth);
    const totalH = lines.length * px * safeLineHeight;
    return totalH <= maxTextHeight + 0.1;
  };

  let lo = minPx;
  let hi = maxPx;
  let best = minPx;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
};

function CanvasLayer({
  width,
  height,
  referenceImage,
  showGuides,
  guides,
  guideLayers,
  guidePicker,
  initialViewport,
  maxInitialScale = 0.78,
  hotspots,
  selectedId,
  highlightedIds = [],
  attentionIds = [],
  onSelect,
  sliceLines,
  showSliceLines,
  onCanvasReady,
  onViewportChange,
  showActiveHotspotLabel = true,
}) {
  const exportRootRef = useRef(null);
  const containerRef = useRef(null);
  const transformRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [transformState, setTransformState] = useState({ scale: 1, positionX: 0, positionY: 0 });
  const [hoveredHotspotId, setHoveredHotspotId] = useState(null);
  const viewportChangeRef = useRef(onViewportChange);
  const autoFitAppliedRef = useRef(false);

  useEffect(() => {
    viewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    if (!exportRootRef.current) return;
    onCanvasReady?.({ exportNode: exportRootRef.current });
  }, [onCanvasReady]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const box = el.getBoundingClientRect?.();
      const nextW = Math.round(box?.width || 0);
      const nextH = Math.round(box?.height || 0);
      if (nextW > 0 && nextH > 0) {
        setViewportSize((prev) => {
          if (Math.abs(prev.width - nextW) <= 2 && Math.abs(prev.height - nextH) <= 2) return prev;
          return { width: nextW, height: nextH };
        });
        requestAnimationFrame(() => viewportChangeRef.current?.());
      }
    };

    update();

    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const initialTransform = useMemo(() => {
    const s = initialViewport && typeof initialViewport === 'object' ? initialViewport : null;
    const scale = s && Number.isFinite(Number(s.scale)) ? Number(s.scale) : null;
    const positionX = s && Number.isFinite(Number(s.positionX)) ? Number(s.positionX) : null;
    const positionY = s && Number.isFinite(Number(s.positionY)) ? Number(s.positionY) : null;
    if (scale != null && positionX != null && positionY != null) {
      return { scale, positionX, positionY };
    }
    return computeInitialTransform({
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      contentWidth: width,
      contentHeight: height,
      padding: 24,
      topOffset: 20,
      maxInitialScale,
    });
  }, [initialViewport, maxInitialScale, viewportSize.width, viewportSize.height, width, height]);

  const resetViewport = useCallback(() => {
    const api = transformRef.current;
    const setTransform =
      (api && typeof api.setTransform === 'function' ? api.setTransform : null)
      ?? (api && typeof api?.instance?.setTransform === 'function' ? api.instance.setTransform : null);
    if (typeof setTransform !== 'function') return;
    const next = computeInitialTransform({
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      contentWidth: width,
      contentHeight: height,
      padding: 24,
      topOffset: 20,
      maxInitialScale,
    });
    if (!next) return;
    setTransform(next.positionX, next.positionY, next.scale, 260, 'easeOut');
  }, [height, maxInitialScale, viewportSize.height, viewportSize.width, width]);

  useEffect(() => {
    if (autoFitAppliedRef.current) return;
    if (!viewportSize.width || !viewportSize.height) return;
    const s = initialViewport && typeof initialViewport === 'object' ? initialViewport : null;
    const hasInitial =
      s &&
      Number.isFinite(Number(s.scale)) &&
      Number.isFinite(Number(s.positionX)) &&
      Number.isFinite(Number(s.positionY));
    if (hasInitial) {
      autoFitAppliedRef.current = true;
      return;
    }
    resetViewport();
    autoFitAppliedRef.current = true;
  }, [initialViewport, resetViewport, viewportSize.height, viewportSize.width]);

  const activeHotspot = useMemo(
    () => (hotspots || []).find((h) => h.id === selectedId) || null,
    [hotspots, selectedId],
  );

  const renderedHotspots = useMemo(() => {
    const list = Array.isArray(hotspots) ? hotspots.filter((h) => h && !h.hidden) : [];
    return stableSortByZIndex(list, (h) => h?.zIndex);
  }, [hotspots]);

  const nativeGuideXs = useMemo(() => {
    const v = guides && typeof guides === 'object' ? guides.vertical : null;
    const list = Array.isArray(v) ? v : [];
    return list.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n));
  }, [guides]);

  const nativeGuideYs = useMemo(() => {
    const h = guides && typeof guides === 'object' ? guides.horizontal : null;
    const list = Array.isArray(h) ? h : [];
    return list.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n));
  }, [guides]);

  const layerGuideXs = useMemo(() => {
    if (!guideLayers || typeof guideLayers !== 'object') return [];
    const all = Array.isArray(guideLayers.all) ? guideLayers.all : [];
    return all
      .map((g) => Math.round(Number(g?.x)))
      .filter((n) => Number.isFinite(n));
  }, [guideLayers]);

  const pickerCandidates = useMemo(() => {
    if (!guidePicker || typeof guidePicker !== 'object') return [];
    const sources = Array.isArray(guidePicker.sources) ? guidePicker.sources : [];
    const src = sources.length > 0 ? sources.map((s) => String(s || '').toLowerCase()) : [];
    const wantsNative = src.length === 0 || src.includes('native');
    const wantsLayer = src.length === 0 || src.includes('layer');
    const xs = [];
    if (wantsNative) xs.push(...nativeGuideXs);
    if (wantsLayer) xs.push(...layerGuideXs);
    return Array.from(new Set(xs)).sort((a, b) => a - b);
  }, [guidePicker, layerGuideXs, nativeGuideXs]);

  const pickSelected = useMemo(() => {
    if (!guidePicker || typeof guidePicker !== 'object') return null;
    const s = guidePicker.selected && typeof guidePicker.selected === 'object' ? guidePicker.selected : null;
    const leftX = s && Number.isFinite(Number(s.leftX)) ? Math.round(Number(s.leftX)) : null;
    const rightX = s && Number.isFinite(Number(s.rightX)) ? Math.round(Number(s.rightX)) : null;
    if (leftX == null && rightX == null) return null;
    return { leftX, rightX };
  }, [guidePicker]);

  const handleTransform = ({ state }) => {
    viewportChangeRef.current?.(state);
    setTransformState((prev) => {
      const scale = Number(state?.scale);
      const positionX = Number(state?.positionX);
      const positionY = Number(state?.positionY);
      if (!Number.isFinite(scale) || !Number.isFinite(positionX) || !Number.isFinite(positionY)) return prev;
      if (prev.scale === scale && prev.positionX === positionX && prev.positionY === positionY) return prev;
      return { scale, positionX, positionY };
    });
  };

  const readableHotspot = useMemo(() => {
    const activeId = selectedId != null ? String(selectedId) : '';
    const hoverId = hoveredHotspotId != null ? String(hoveredHotspotId) : '';
    const pickId = activeId || hoverId;
    if (!pickId) return null;
    const h = (hotspots || []).find((x) => x && String(x.id) === pickId) || null;
    if (!h) return null;
    const isText = h.type === 'text' || h.varType === 'text';
    if (!isText) return null;
    const modified = h.value !== undefined && h.value !== h.defaultValue;
    const shouldPreview = h?.filledBySlotId != null || modified;
    if (!shouldPreview) return null;
    return h;
  }, [hotspots, hoveredHotspotId, selectedId]);

  const readableOverlay = useMemo(() => {
    const h = readableHotspot;
    if (!h) return null;
    const rect = h.rect || { x: h.x, y: h.y, w: h.width, h: h.height };
    const x = Number(rect?.x ?? 0);
    const y = Number(rect?.y ?? 0);
    const w = Number(rect?.w ?? rect?.width ?? 0);
    const s = Number(transformState.scale);
    const px = Number(transformState.positionX);
    const py = Number(transformState.positionY);
    if (!Number.isFinite(s) || !Number.isFinite(px) || !Number.isFinite(py)) return null;
    const left = px + x * s;
    const top = py + y * s;
    const widthPx = w * s;
    const anchorX = left + widthPx / 2;
    const anchorY = top;
    const placeBelow = anchorY < 120;
    return {
      id: String(h.id),
      name: String(h.name || h.key || h.id || ''),
      value: String(h.value ?? h.defaultValue ?? ''),
      anchorX,
      anchorY,
      placeBelow,
    };
  }, [readableHotspot, transformState.positionX, transformState.positionY, transformState.scale]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative bg-gray-50">
      <div className="absolute bottom-4 right-4 z-[90]">
        <button
          type="button"
          onClick={() => resetViewport()}
          className="px-2 py-1 rounded-lg text-[11px] bg-black/70 border border-black/20 text-white/90 hover:bg-black/80 transition-colors"
        >
          回到画布
        </button>
      </div>
      <TransformWrapper
        ref={transformRef}
        key={`${width}x${height}`}
        initialScale={initialTransform.scale}
        initialPositionX={initialTransform.positionX}
        initialPositionY={initialTransform.positionY}
        minScale={0.1}
        maxScale={4}
        centerOnInit={false}
        centerZoomedOut={false}
        onTransformed={handleTransform}
        onPanning={handleTransform}
        onZooming={handleTransform}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
          <div
            ref={exportRootRef}
            className="relative bg-white shadow-sm"
            style={{
              width,
              height,
              transformOrigin: 'top left',
              cursor: 'grab',
            }}
            onMouseDown={(e) => {
               if (e.target === e.currentTarget || e.target.tagName === 'IMG') {
                 onSelect?.(null, e);
               }
               // 拖动时改为 grabbing
               e.currentTarget.style.cursor = 'grabbing';
            }}
            onMouseUp={(e) => {
               e.currentTarget.style.cursor = 'grab';
            }}
            onMouseLeave={(e) => {
               e.currentTarget.style.cursor = 'grab';
            }}
          >
            {referenceImage ? (
              <img
                src={referenceImage}
                alt=""
                className="absolute inset-0 w-full h-full pointer-events-none select-none"
                draggable={false}
              />
            ) : null}

            {showGuides ? (
              <>
                {nativeGuideXs.map((x) => (
                  <div
                    key={`g_v_${x}`}
                    className="absolute top-0 bottom-0 w-px bg-amber-400/70 pointer-events-none"
                    style={{ left: `${x}px` }}
                  />
                ))}
                {nativeGuideYs.map((y) => (
                  <div
                    key={`g_h_${y}`}
                    className="absolute left-0 right-0 h-px bg-amber-400/60 pointer-events-none"
                    style={{ top: `${y}px` }}
                  />
                ))}
                {layerGuideXs.map((x, i) => (
                  <div
                    key={`gl_${x}_${i}`}
                    className="absolute top-0 bottom-0 w-px bg-fuchsia-400/50 pointer-events-none"
                    style={{ left: `${x}px` }}
                  />
                ))}
              </>
            ) : null}

            {showGuides && pickSelected ? (
              <>
                {pickSelected.leftX != null ? (
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-emerald-400 pointer-events-none"
                    style={{ left: `${pickSelected.leftX}px` }}
                  />
                ) : null}
                {pickSelected.rightX != null ? (
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-emerald-400 pointer-events-none"
                    style={{ left: `${pickSelected.rightX}px` }}
                  />
                ) : null}
              </>
            ) : null}

            {guidePicker && guidePicker.rect && Number.isFinite(Number(guidePicker.rect.left)) && Number.isFinite(Number(guidePicker.rect.right)) ? (
              <div
                className={[
                  'absolute top-0 bottom-0 border border-emerald-400/60 bg-emerald-500/5',
                  guidePicker.enabled ? 'cursor-crosshair' : 'pointer-events-none',
                ].join(' ')}
                style={{
                  left: `${Math.round(Number(guidePicker.rect.left))}px`,
                  width: `${Math.max(1, Math.round(Number(guidePicker.rect.right)) - Math.round(Number(guidePicker.rect.left)))}px`,
                }}
                onMouseDown={(e) => {
                  if (!guidePicker.enabled) return;
                  const root = exportRootRef.current;
                  if (!root) return;
                  const r = root.getBoundingClientRect();
                  const px = (e.clientX - r.left) * (Number(width) / Math.max(1, r.width));
                  const x = Math.max(0, Math.min(Number(width) || 0, Math.round(px)));
                  let picked = x;
                  if (pickerCandidates.length > 0) {
                    let best = pickerCandidates[0];
                    let bestD = Math.abs(best - x);
                    for (let i = 1; i < pickerCandidates.length; i += 1) {
                      const v = pickerCandidates[i];
                      const d = Math.abs(v - x);
                      if (d < bestD) {
                        best = v;
                        bestD = d;
                      }
                    }
                    if (bestD <= 16) picked = best;
                  }
                  guidePicker.onPick?.(picked);
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            ) : null}

            {renderedHotspots.map((h, idx) => {
              const isActive = h.id === selectedId;
              const isHighlighted = highlightedIds.includes(h.id);
              const isAttention = attentionIds.includes(h.id);
              const isText = h.type === 'text' || h.varType === 'text';
              const isImage = h.type === 'image' || h.varType === 'img';
              const rect = h.rect || { x: h.x, y: h.y, w: h.width, h: h.height };
              const x = Number(rect?.x ?? 0);
              const y = Number(rect?.y ?? 0);
              const w = Number(rect?.w ?? rect?.width ?? 0);
              const hh = Number(rect?.h ?? rect?.height ?? 0);
              const value = h.value ?? h.defaultValue ?? '';
              const modified = h.value !== undefined && h.value !== h.defaultValue;
              const shouldPreview = h?.filledBySlotId != null || modified;
              const zIndex = Number.isFinite(h?.zIndex) ? h.zIndex : idx + 1;
              const rawAlign = h.align != null ? String(h.align) : '';
              const align = rawAlign === 'center' || rawAlign === 'right' || rawAlign === 'left' ? rawAlign : 'left';
              const fittedText = (() => {
                if (!shouldPreview || !isText) return null;
                const ctx = sharedMeasureCtx || (sharedMeasureCtx = getMeasureContext());
                if (!ctx) return { fontSizePx: 14, lineHeight: 1.02, fontWeight: 600, fontFamily: undefined };
                const text = String(value || '');
                const fontFamily = h.fontFamily || undefined;
                const fontWeight = h.fontWeight ?? 600;
                const lineHeight = 1.02;
                const keyText = text.length > 200 ? `${text.slice(0, 200)}…${text.length}` : text;
                const key = `${Math.round(w)}x${Math.round(hh)}|${String(fontFamily || '')}|${String(fontWeight)}|${lineHeight}|${keyText}`;
                const cached = sharedFitCache.get(key);
                if (cached && Number.isFinite(cached)) {
                  return { fontSizePx: cached, lineHeight, fontWeight, fontFamily };
                }
                const px = computeFittedFontSize({
                  ctx,
                  text,
                  boxWidth: w,
                  boxHeight: hh,
                  fontFamily,
                  fontWeight,
                  lineHeight,
                  minPx: 8,
                });
                sharedFitCache.set(key, px);
                if (sharedFitCache.size > 800) {
                  const first = sharedFitCache.keys().next().value;
                  if (first) sharedFitCache.delete(first);
                }
                return { fontSizePx: px, lineHeight, fontWeight, fontFamily };
              })();

              return (
                <div
                  key={h.id}
                  id={`hotspot-${h.id}`}
                  className={[
                    'absolute variable-item',
                    isAttention ? 'ring-2 ring-red-500 ring-offset-0 shadow-[0_0_14px_rgba(239,68,68,0.45)] animate-pulse' :
                    isActive ? 'ring-2 ring-[#1890ff] ring-offset-0' :
                    isHighlighted ? 'ring-2 ring-green-500 ring-offset-1 shadow-[0_0_12px_rgba(34,197,94,0.4)]' :
                    'ring-1 ring-black/10',
                    'cursor-pointer transition-all duration-300',
                    isAttention ? 'bg-red-50/25' :
                    isActive ? 'bg-blue-50/10' :
                    isHighlighted ? 'bg-green-50/20' :
                    'hover:bg-blue-50/10',
                  ].join(' ')}
                  style={{ left: x, top: y, width: w, height: hh, zIndex }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelect?.(h.id, e);
                  }}
                  onMouseEnter={() => setHoveredHotspotId(h.id)}
                  onMouseLeave={() => setHoveredHotspotId((prev) => (String(prev || '') === String(h.id) ? null : prev))}
                >
                  <div
                    className={[
                      'absolute inset-0 border',
                      isAttention ? 'border-red-500' :
                      isActive ? 'border-[#1890ff]' :
                      isHighlighted ? 'border-green-500/50' :
                      'border-black/15 border-dashed',
                    ].join(' ')}
                  />

                  {shouldPreview && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white overflow-hidden">
                      {isText && (
                        <div 
                          className={[
                            'w-full h-full flex items-center',
                            align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left',
                          ].join(' ')}
                          style={{
                            paddingLeft: 2,
                            paddingRight: 2,
                            fontSize: fittedText ? `${fittedText.fontSizePx}px` : '14px',
                            textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                            fontFamily: fittedText ? fittedText.fontFamily : (h.fontFamily || undefined),
                            lineHeight: fittedText ? fittedText.lineHeight : 1.02,
                            fontWeight: fittedText ? fittedText.fontWeight : 600,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            overflow: 'hidden',
                          }}
                        >
                          {String(value || '')}
                        </div>
                      )}
                      {isImage && (
                        value ? (
                          <img src={value} alt="replaced" className="w-full h-full object-contain bg-black/20" />
                        ) : (
                          <div className="px-2 text-sm text-gray-400">图片为空</div>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {showSliceLines &&
              (sliceLines || []).map((line) => (
                <div
                  key={String(line)}
                  className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#1890ff] to-transparent pointer-events-none"
                  style={{ top: `${Number(line)}px` }}
                />
              ))}

            {activeHotspot && (
              showActiveHotspotLabel ? (
                <div className="absolute left-0 top-0 pointer-events-none">
                  <div
                    className="absolute -translate-y-6 px-2 py-1 text-[11px] rounded bg-black/75 text-white whitespace-nowrap z-10"
                    style={{
                      left: `${Number(activeHotspot?.rect?.x ?? activeHotspot?.x ?? 0)}px`,
                      top: `${Number(activeHotspot?.rect?.y ?? activeHotspot?.y ?? 0)}px`,
                    }}
                  >
                    {activeHotspot.name || activeHotspot.key || activeHotspot.id}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>

      {readableOverlay ? (
        <div
          className="absolute z-[80] pointer-events-none"
          style={{
            left: `${readableOverlay.anchorX}px`,
            top: `${readableOverlay.anchorY}px`,
            transform: readableOverlay.placeBelow ? 'translate(-50%, 10px)' : 'translate(-50%, calc(-100% - 10px))',
          }}
        >
          <div
            className="pointer-events-auto max-w-[320px] rounded-xl border border-white/15 bg-slate-950/90 text-slate-100 shadow-2xl backdrop-blur-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-white/10">
              <div className="text-[11px] text-slate-300 truncate" title={readableOverlay.name}>
                {readableOverlay.name || '回填预览'}
              </div>
            </div>
            <div className="px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap break-words select-text max-h-[180px] overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {readableOverlay.value || '（空）'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CanvasLayer;
