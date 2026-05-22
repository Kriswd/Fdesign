import { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { computeInitialTransform } from '../utils/canvasViewport';
import { stableSortByZIndex } from '../utils/templateExtractor';
import { computePanToCenter } from '../utils/panTransform';

/**
 * “挖孔底图 + 覆盖层”预览画布：支持滚轮缩放 + 拖拽平移（无限画布体验）
 * @param {object} props - 组件参数
 * @returns {JSX.Element}
 */
const TemplateCanvas = forwardRef(({
  width = 790,
  height = 1200,
  backgroundImage = null,
  variables = [],
  guidePick = null,
  showGuides = false,
  guides = null,
  guideLayers = null,
  initialViewport = null,
  onViewportChange,
  enableImageUpload = true,
  sliceLines = [],
  showSliceLines = false,
  showVariableLabels = true,
  selectedVariableId = null,
  onSelectVariable,
  onVariableChange,
  onCanvasReady,
  onSelectVariableIds,
  selectedVariableIds = [],
  attentionVariableIds = [],
}, ref) => {
  const exportRootRef = useRef(null);
  const containerRef = useRef(null);
  const transformRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  const variablesRef = useRef([]);
  const autoFitAppliedRef = useRef(false);

  const getTransformApi = useCallback(() => {
    return transformRef.current || null;
  }, []);

  const setTransformSafe = useCallback((positionX, positionY, scale, duration = 260) => {
    const api = getTransformApi();
    if (!api) return false;
    const fn =
      (typeof api.setTransform === 'function' ? api.setTransform : null)
      ?? (typeof api?.instance?.setTransform === 'function' ? api.instance.setTransform : null);
    if (typeof fn !== 'function') return false;
    fn(Number(positionX) || 0, Number(positionY) || 0, Number(scale) || 1, duration, 'easeOut');
    return true;
  }, [getTransformApi]);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  useEffect(() => {
    variablesRef.current = Array.isArray(variables) ? variables : [];
  }, [variables]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    zoomToVariable: (variableId) => {
      if (!variableId || !transformRef.current) return;
      const el = exportRootRef.current?.querySelector(`[data-variable-id="${variableId}"]`);
      if (el) {
        transformRef.current.zoomToElement(el, undefined, 500, 'easeOut');
      }
    },
    getViewport: () => {
      const st =
        transformRef.current?.state
        ?? transformRef.current?.instance?.transformState
        ?? transformRef.current?.instance?.state
        ?? null;
      const scale = st && Number.isFinite(Number(st.scale)) ? Number(st.scale) : null;
      const positionX = st && Number.isFinite(Number(st.positionX)) ? Number(st.positionX) : null;
      const positionY = st && Number.isFinite(Number(st.positionY)) ? Number(st.positionY) : null;
      if (scale == null || positionX == null || positionY == null) return null;
      return { scale, positionX, positionY };
    },
    panToVariable: (variableId) => {
      const id = variableId != null ? String(variableId) : '';
      if (!id) return;
      const api = transformRef.current;
      if (!api) return;
      const st =
        api?.state
        ?? api?.instance?.transformState
        ?? api?.instance?.state
        ?? null;
      const scale = st && Number.isFinite(Number(st.scale)) ? Number(st.scale) : null;
      if (scale == null) return;

      const v = (variablesRef.current || []).find((x) => x && String(x.id) === id) || null;
      if (!v) return;
      const x = Number(v.x) || 0;
      const y = Number(v.y) || 0;
      const w = Number(v.width) || 0;
      const h = Number(v.height) || 0;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const vp = viewportSizeRef.current || { width: 0, height: 0 };
      const res = computePanToCenter({
        viewportWidth: vp.width,
        viewportHeight: vp.height,
        scale,
        targetCenterX: cx,
        targetCenterY: cy,
      });
      if (!res) return;
      const setTransform =
        (typeof api.setTransform === 'function' ? api.setTransform : null)
        ?? (typeof api?.instance?.setTransform === 'function' ? api.instance.setTransform : null);
      if (typeof setTransform !== 'function') return;
      setTransform(res.positionX, res.positionY, res.scale, 260, 'easeOut');
    },
  }));

  useEffect(() => {
    if (!exportRootRef.current) return;
    onCanvasReady?.({ exportNode: exportRootRef.current });
  }, [onCanvasReady]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const box = entries?.[0]?.contentRect;
      const nextW = Math.round(box?.width || 0);
      const nextH = Math.round(box?.height || 0);
      if (nextW > 0 && nextH > 0) {
        setViewportSize((prev) => {
          if (Math.abs(prev.width - nextW) <= 2 && Math.abs(prev.height - nextH) <= 2) return prev;
          return { width: nextW, height: nextH };
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
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
      maxInitialScale: 0.78,
    });
  }, [initialViewport, viewportSize.width, viewportSize.height, width, height]);

  const resetViewport = useCallback(() => {
    const vp = viewportSizeRef.current || { width: 0, height: 0 };
    const next = computeInitialTransform({
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      contentWidth: width,
      contentHeight: height,
      padding: 24,
      topOffset: 20,
      maxInitialScale: 0.78,
    });
    if (!next) return;
    setTransformSafe(next.positionX, next.positionY, next.scale, 260);
  }, [height, setTransformSafe, width]);

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

  const ensureVisible = useCallback(() => {
    const root = exportRootRef.current;
    const container = containerRef.current;
    if (!root || !container) return;
    const rr = root.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    if (!rr || !cr) return;
    const margin = 60;
    const fullyOutside =
      rr.right < cr.left + margin ||
      rr.left > cr.right - margin ||
      rr.bottom < cr.top + margin ||
      rr.top > cr.bottom - margin;
    if (fullyOutside) resetViewport();
  }, [resetViewport]);

  const selectedSet = useMemo(() => {
    const ids = new Set();
    if (selectedVariableId) ids.add(selectedVariableId);
    if (Array.isArray(selectedVariableIds)) {
      selectedVariableIds.forEach(id => ids.add(id));
    }
    return ids;
  }, [selectedVariableId, selectedVariableIds]);

  const attentionSet = useMemo(() => {
    const ids = new Set();
    if (Array.isArray(attentionVariableIds)) {
      attentionVariableIds.forEach((id) => {
        const s = id != null ? String(id) : '';
        if (s) ids.add(s);
      });
    }
    return ids;
  }, [attentionVariableIds]);

  const renderedVariables = useMemo(() => {
    const list = Array.isArray(variables) ? variables.filter((v) => v && !v.hidden) : [];
    return stableSortByZIndex(list, (v) => v?.zIndex);
  }, [variables]);

  const renderedVarById = useMemo(() => {
    const map = new Map();
    renderedVariables.forEach((v) => {
      if (!v || v.id == null) return;
      map.set(String(v.id), v);
    });
    return map;
  }, [renderedVariables]);

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

  const handleSelect = useCallback(
    (variableId, e) => {
      // 阻止事件冒泡，防止触发其他（如拖拽等）
      if (e) e.stopPropagation();

      // 支持 Ctrl (Windows) 和 Meta (Mac Command)
      const isMulti = e?.ctrlKey || e?.metaKey;
      let newIds = [];

      if (isMulti) {
        const currentIds = Array.from(selectedSet);
        if (selectedSet.has(variableId)) {
          newIds = currentIds.filter(id => id !== variableId);
        } else {
          newIds = [...currentIds, variableId];
        }
      } else {
        newIds = [variableId];
      }

      if (onSelectVariableIds) {
        onSelectVariableIds(newIds);
      }
      
      // 兼容单选逻辑：如果是单选模式或只剩一个，则调用单选回调
      // 或者总是调用单选回调为最后一个选中的？通常为了属性面板显示，取最后一个
      if (onSelectVariable) {
        onSelectVariable(newIds.length > 0 ? newIds[newIds.length - 1] : null);
      }
    },
    [onSelectVariable, onSelectVariableIds, selectedSet],
  );

  const handleTextBlur = useCallback(
    (variableId, e) => {
      const next = e.currentTarget?.innerText ?? '';
      onVariableChange?.(variableId, String(next));
    },
    [onVariableChange],
  );

  const fileInputRefs = useRef(new Map());
  const textNodeRefs = useRef(new Map());

  useEffect(() => {
    if (!showVariableLabels) return;
    if (!selectedSet || selectedSet.size === 0) return;
    selectedSet.forEach((rawId) => {
      const id = rawId != null ? String(rawId) : '';
      if (!id) return;
      const v = renderedVarById.get(id);
      if (!v || v.varType !== 'text') return;
      const el = textNodeRefs.current.get(id);
      if (!el) return;
      const expected = v.value == null ? '' : String(v.value);
      try {
        const current = el.innerText ?? '';
        if (current !== expected) el.innerText = expected;
      } catch (error) {
        try {
          console.error('[error] 同步变量文字编辑内容失败', { variableId: id, error });
        } catch (e) {
          void e;
        }
      }
    });
  }, [renderedVarById, selectedSet, showVariableLabels]);

  const ensureFileInput = useCallback((variableId) => {
    if (fileInputRefs.current.has(variableId)) return fileInputRefs.current.get(variableId);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (dataUrl) onVariableChange?.(variableId, dataUrl);
      input.value = '';
    });
    fileInputRefs.current.set(variableId, input);
    return input;
  }, [onVariableChange]);

  const handleImageDoubleClick = useCallback(
    (variableId) => {
      if (!enableImageUpload) return;
      const input = ensureFileInput(variableId);
      input.click();
    },
    [enableImageUpload, ensureFileInput],
  );

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
      }}
      className="canvas-container"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: 'grab',
        position: 'relative',
      }}
    >
      <div className="absolute top-4 right-4 z-10 pointer-events-none text-xs text-slate-400 bg-slate-900/50 px-2 py-1 rounded">
        按住 Ctrl 点击多个变量进行多选
      </div>
      <div className="absolute bottom-4 right-4 z-20">
        <button
          type="button"
          onClick={() => resetViewport()}
          className="px-2 py-1 rounded-lg text-[11px] bg-slate-950/70 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
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
        wheel={{ step: 0.08 }}
        doubleClick={{ disabled: true }}
        panning={{ 
          disabled: false,
          excluded: ['variable-item'] 
        }}
        limitToBounds={false}
        centerOnInit={false}
        centerZoomedOut={false}
        onTransformed={({ state }) => onViewportChange?.(state)}
        onPanning={({ state }) => onViewportChange?.(state)}
        onZooming={({ state }) => onViewportChange?.(state)}
        onPanningStop={ensureVisible}
        onZoomStop={ensureVisible}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }} contentStyle={{ width, height }}>
          <div
            className="canvas-content"
            style={{
              width,
              height,
              position: 'relative',
              backgroundColor: '#fff',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <div
              ref={exportRootRef}
              data-export-root
              style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}
            >
              {backgroundImage && (
                <img
                  src={backgroundImage}
                  alt="template-background"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}
              {!backgroundImage && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6B7280',
                    fontSize: 14,
                    background:
                      'repeating-linear-gradient(45deg, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.06) 10px, rgba(0,0,0,0.06) 20px)',
                    zIndex: 0,
                  }}
                >
                  未生成底图（请重新上传 PSD）
                </div>
              )}

              {showGuides ? (
                <>
                  {nativeGuideXs.map((x) => (
                    <div
                      key={`g_v_${x}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${x}px`,
                        width: 1,
                        backgroundColor: 'rgba(245, 158, 11, 0.7)',
                        pointerEvents: 'none',
                        zIndex: 40,
                      }}
                    />
                  ))}
                  {nativeGuideYs.map((y) => (
                    <div
                      key={`g_h_${y}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${y}px`,
                        height: 1,
                        backgroundColor: 'rgba(245, 158, 11, 0.6)',
                        pointerEvents: 'none',
                        zIndex: 40,
                      }}
                    />
                  ))}
                  {layerGuideXs.map((x, i) => (
                    <div
                      key={`gl_${x}_${i}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${x}px`,
                        width: 1,
                        backgroundColor: 'rgba(217, 70, 239, 0.5)',
                        pointerEvents: 'none',
                        zIndex: 40,
                      }}
                    />
                  ))}
                </>
              ) : null}

              {guidePick && typeof guidePick === 'object' && Number.isFinite(Number(guidePick.leftX)) && Number.isFinite(Number(guidePick.rightX)) ? (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.round(Number(guidePick.leftX))}px`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: 'rgba(16,185,129,0.95)',
                      boxShadow: '0 0 0 1px rgba(16,185,129,0.25)',
                      zIndex: 45,
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.round(Number(guidePick.rightX))}px`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: 'rgba(16,185,129,0.95)',
                      boxShadow: '0 0 0 1px rgba(16,185,129,0.25)',
                      zIndex: 45,
                      pointerEvents: 'none',
                    }}
                  />
                </>
              ) : null}

              {renderedVariables.map((v, idx) => {
                const isSelected = selectedSet.has(v.id);
                const isAttention = attentionSet.has(String(v.id));
                const zIndex = Number.isFinite(v.zIndex) ? v.zIndex : idx + 1;
                const showVariableContent = showVariableLabels || isSelected;
                const commonStyle = {
                  position: 'absolute',
                  left: v.x,
                  top: v.y,
                  width: v.width || 'auto',
                  height: v.height || 'auto',
                  zIndex,
                  outline: isAttention ? '2px solid rgb(239, 68, 68)' : isSelected ? '2px solid #007AFF' : '1px dashed rgba(0,0,0,0.12)',
                  backgroundColor: isAttention ? 'rgba(239, 68, 68, 0.08)' : isSelected ? 'rgba(0,122,255,0.06)' : 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                };

                if (v.varType === 'text') {
                  return (
                    <div
                      key={v.id}
                      className={['variable-item variable-text', isAttention ? 'animate-pulse' : null].filter(Boolean).join(' ')}
                      data-variable-id={v.id}
                      data-layer-id={v.id}
                      data-variable-key={v.key}
                      style={commonStyle}
                  >
                    <div
                      className="text-layer"
                        ref={(node) => {
                          const id = v && v.id != null ? String(v.id) : '';
                          if (!id) return;
                          if (node) textNodeRefs.current.set(id, node);
                          else textNodeRefs.current.delete(id);
                        }}
                        contentEditable={showVariableLabels && isSelected}
                        suppressContentEditableWarning
                        onDoubleClick={(e) => handleSelect(v.id, e)}
                        onBlur={(e) => handleTextBlur(v.id, e)}
                        style={{
                          width: '100%',
                          height: '100%',
                          outline: 'none',
                          whiteSpace: 'pre-wrap',
                          overflow: 'hidden',
                          cursor: showVariableLabels && isSelected ? 'text' : 'pointer',
                          fontFamily: v.fontFamily || 'PingFang SC',
                          fontSize: v.fontSize ? `${v.fontSize}px` : undefined,
                          color: v.color || '#111827',
                          // Ensure pointer events are captured
                          pointerEvents: 'auto',
                        }}
                        onClick={(e) => {
                          // 使用 onClick 而不是 onMouseDown，以确保兼容性
                          e.stopPropagation();
                          handleSelect(v.id, e);
                        }}
                      >
                        {showVariableLabels ? (isSelected ? null : (v.value ?? '')) : ''}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={v.id}
                    className={['variable-item variable-image', isAttention ? 'animate-pulse' : null].filter(Boolean).join(' ')}
                    data-variable-id={v.id}
                    data-layer-id={v.id}
                    data-variable-key={v.key}
                    style={commonStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(v.id, e);
                    }}
                    onDoubleClick={() => handleImageDoubleClick(v.id)}
                  >
                    {showVariableContent &&
                      (v.value ? (
                        <img
                          src={v.value}
                          alt={v.key}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'fill',
                            display: 'block',
                            pointerEvents: 'none',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: showVariableLabels ? 'rgba(255,255,255,0.65)' : 'transparent',
                            color: '#374151',
                            fontSize: 12,
                            pointerEvents: 'none',
                          }}
                        >
                          {showVariableLabels ? `{img:${v.key}}` : ''}
                        </div>
                      ))}
                  </div>
                );
              })}

              {showSliceLines &&
                (sliceLines || [])
                  .filter((n) => Number.isFinite(n))
                  .map((line, idx) => (
                    <div
                      key={`${line}-${idx}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: line,
                        height: 1,
                        backgroundColor: 'rgba(0,0,0,0.15)',
                        zIndex: 50,
                        pointerEvents: 'none',
                      }}
                    />
                  ))}
            </div>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
});

export default TemplateCanvas;
