import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Moveable from 'react-moveable';
import Selecto from 'react-selecto';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import LayerRenderer from './LayerRendererLegacy';
import { useDataStore } from '../store/dataStore';

function patchLayerById(layerList, layerId, patch) {
  return layerList.map((layer) => {
    if (layer.id === layerId) {
      return { ...layer, ...patch };
    }
    if (layer.children) {
      return { ...layer, children: patchLayerById(layer.children, layerId, patch) };
    }
    return layer;
  });
}

function findLayerById(layerList, layerId) {
  for (const layer of layerList) {
    if (layer.id === layerId) return layer;
    if (layer.children) {
      const found = findLayerById(layer.children, layerId);
      if (found) return found;
    }
  }
  return null;
}

function CanvasLegacy({
  initialCanvasWidth = 790,
  initialCanvasHeight = 1200,
  scale = 1,
  renderMode = 'edit',
  compositeImage = null,
  boundFields = {},
  showGrid = false,
  showSliceLines = false,
  showBoundingBox = false,
  readOnly = false,
  onCanvasReady,
  onLayerSelect,
  onContentChange,
  initialLayers = [],
  sliceLines = [],
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const moveableContainerRef = useRef(null);
  const exportRootRef = useRef(null);

  const [layers, setLayers] = useState(initialLayers);
  const [canvasWidth, setCanvasWidth] = useState(initialCanvasWidth);
  const [canvasHeight, setCanvasHeight] = useState(initialCanvasHeight);
  const [zoom, setZoom] = useState(1);
  const layersRef = useRef(layers);
  const [containerEl, setContainerEl] = useState(null);
  const [canvasEl, setCanvasEl] = useState(null);
  const [exportEl, setExportEl] = useState(null);
  const [elementGuidelines, setElementGuidelines] = useState([]);

  const { selectedLayerIds, setSelectedLayerIds, editingLayerId, setEditingLayerId } = useDataStore();
  const [moveableTargets, setMoveableTargets] = useState([]);
  const startSnapshotRef = useRef(new Map());

  const handleContainerRef = useCallback((node) => {
    containerRef.current = node;
    setContainerEl(node);
  }, []);

  const handleCanvasRef = useCallback((node) => {
    canvasRef.current = node;
    setCanvasEl(node);
  }, []);

  const handleExportRootRef = useCallback((node) => {
    exportRootRef.current = node;
    setExportEl(node);
  }, []);

  useEffect(() => {
    if (initialLayers && initialLayers.length > 0) {
      setLayers(initialLayers);
      window.debugLayers = initialLayers;
    }
  }, [initialLayers]);

  useEffect(() => {
    window.debugLayers = layers;
  }, [layers]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    setCanvasHeight(initialCanvasHeight);
  }, [initialCanvasHeight]);

  useEffect(() => {
    const calculateBounds = (layerList) => {
      let maxX = 0;
      let maxY = 0;
      for (const layer of layerList) {
        if (layer.x > -10000 && layer.y > -10000) {
          const right = layer.x + layer.width;
          const bottom = layer.y + layer.height;
          if (right > maxX) maxX = right;
          if (bottom > maxY) maxY = bottom;
        }
        if (layer.children) {
          const { maxX: childMaxX, maxY: childMaxY } = calculateBounds(layer.children);
          if (childMaxX > maxX) maxX = childMaxX;
          if (childMaxY > maxY) maxY = childMaxY;
        }
      }
      return { maxX, maxY };
    };

    if (layers && layers.length > 0) {
      const { maxX, maxY } = calculateBounds(layers);
      const padding = 100;
      if (maxX + padding > initialCanvasWidth) {
        setCanvasWidth(maxX + padding);
      }
      if (maxY + padding > initialCanvasHeight) {
        setCanvasHeight(maxY + padding);
      }
    }
  }, [layers, initialCanvasWidth, initialCanvasHeight]);

  const handleTextChange = useCallback((layerId, newContent) => {
    setLayers((prevLayers) => {
      const current = findLayerById(prevLayers, layerId);
      const fallbackFontSize = typeof current?.fontSize === 'number' ? current.fontSize : 16;
      const baseTextData = current?.textData || {
        content: typeof current?.content === 'string' ? current.content : '',
        fontFamily: current?.fontFamily || 'PingFang SC',
        fontSize: fallbackFontSize,
        fontWeight: current?.fontWeight || 400,
        fontStyle: current?.fontStyle || 'normal',
        color: current?.color || 'rgba(0, 0, 0, 1)',
        textAlign: current?.textAlign || 'left',
        letterSpacing: typeof current?.letterSpacing === 'number' ? current.letterSpacing : 0,
        lineHeight: typeof current?.lineHeight === 'number' ? current.lineHeight : fallbackFontSize * 1.2,
        textTransform: current?.textTransform || 'none',
      };

      const newLayers = patchLayerById(prevLayers, layerId, {
        content: newContent,
        textData: { ...baseTextData, content: newContent },
      });
      if (onContentChange) {
        onContentChange({ type: 'text', layerId, content: newContent, newLayers });
      }
      return newLayers;
    });
  }, [onContentChange]);

  const handleImageReplace = useCallback((layerId, newImage) => {
    setLayers((prevLayers) => {
      const newLayers = patchLayerById(prevLayers, layerId, { imageData: newImage, src: newImage });
      if (onContentChange) {
        onContentChange({ type: 'image', layerId, image: newImage, newLayers });
      }
      return newLayers;
    });
  }, [onContentChange]);

  const handleAddImages = useCallback((anchorLayerId, imageUrls) => {
    setLayers((prevLayers) => {
      let anchorLayer = null;
      const findLayer = (list) => {
        for (const l of list) {
          if (l.id === anchorLayerId) {
            anchorLayer = l;
            return;
          }
          if (l.children) findLayer(l.children);
        }
      };
      findLayer(prevLayers);

      if (!anchorLayer) return prevLayers;

      const newImageHeight = anchorLayer.height;
      const spacing = 10;
      const totalExtraHeight = imageUrls.length * (newImageHeight + spacing);

      const newImageLayers = imageUrls.map((url, index) => ({
        id: `new_img_${Date.now()}_${index}`,
        type: 'image',
        name: `追加图片 ${index + 1}`,
        x: anchorLayer.x,
        y: anchorLayer.y + anchorLayer.height + spacing + index * (newImageHeight + spacing),
        width: anchorLayer.width,
        height: newImageHeight,
        imageData: url,
        opacity: 1,
        blendMode: 'normal',
        depth: anchorLayer.depth,
      }));

      const updatePositions = (list) => {
        const updated = list.map((l) => {
          if (l.y > anchorLayer.y + anchorLayer.height - 5) {
            return { ...l, y: l.y + totalExtraHeight };
          }
          if (l.children) {
            return { ...l, children: updatePositions(l.children) };
          }
          return l;
        });
        return updated;
      };

      const pushedLayers = updatePositions(prevLayers);
      setCanvasHeight((h) => h + totalExtraHeight);

      return [...pushedLayers, ...newImageLayers];
    });
  }, []);

  useEffect(() => {
    if (!exportEl) return;
    onCanvasReady?.({ exportNode: exportEl });
  }, [exportEl, onCanvasReady]);

  useEffect(() => {
    if (!exportEl) return;
    const nextTargets = selectedLayerIds
      .map((id) => exportEl.querySelector(`[data-layer-id="${id}"]`))
      .filter(Boolean);
    setMoveableTargets(nextTargets);
  }, [exportEl, selectedLayerIds, layers]);

  const commitLayersToParent = useCallback(
    (newLayers, change) => {
      onContentChange?.({ ...change, newLayers });
    },
    [onContentChange],
  );

  const handleBeginEdit = useCallback(
    (layerId) => {
      setEditingLayerId(layerId);
    },
    [setEditingLayerId],
  );

  const handleEndEdit = useCallback(() => {
    setEditingLayerId(null);
  }, [setEditingLayerId]);

  const proxyLayers = useMemo(() => {
    const isEditableLeaf = (l) => l?.editable === true || !!boundFields?.[l.id];
    const filterTree = (list) => {
      const out = [];
      for (const l of list || []) {
        if (l.type === 'group' && Array.isArray(l.children)) {
          const nextChildren = filterTree(l.children);
          if (nextChildren.length > 0) out.push({ ...l, children: nextChildren });
          continue;
        }
        if (isEditableLeaf(l)) out.push(l);
      }
      return out;
    };
    return filterTree(layers);
  }, [boundFields, layers]);

  const renderLayer = useCallback((layer) => {
    return (
      <LayerRenderer
        key={layer.id}
        layer={layer}
        selectedLayerIds={selectedLayerIds}
        editingLayerId={editingLayerId}
        onBeginEdit={handleBeginEdit}
        onEndEdit={handleEndEdit}
        onTextChange={handleTextChange}
        onImageReplace={handleImageReplace}
        onAddImages={handleAddImages}
        readOnly={readOnly}
        showBoundingBox={showBoundingBox}
        boundFields={boundFields}
      />
    );
  }, [boundFields, editingLayerId, handleAddImages, handleBeginEdit, handleEndEdit, handleImageReplace, handleTextChange, readOnly, selectedLayerIds, showBoundingBox]);

  const renderSliceLines = useCallback(() => {
    if (!showSliceLines || !sliceLines || sliceLines.length === 0) return null;

    return (
      <div className="slice-lines">
        {sliceLines.map((line, index) => (
          <div
            key={`${line}-${index}`}
            className="slice-line"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: line,
              pointerEvents: 'none',
              zIndex: 999,
            }}
          />
        ))}
      </div>
    );
  }, [showSliceLines, sliceLines]);

  const renderGrid = useCallback(() => {
    if (!showGrid) return null;

    const gridSize = 50;
    const gridLines = [];

    for (let x = 0; x <= canvasWidth; x += gridSize) {
      gridLines.push(
        <div
          key={`v-${x}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: 'rgba(0,0,0,0.05)',
          }}
        />,
      );
    }

    for (let y = 0; y <= canvasHeight; y += gridSize) {
      gridLines.push(
        <div
          key={`h-${y}`}
          style={{
            position: 'absolute',
            left: 0,
            top: y,
            right: 0,
            height: 1,
            backgroundColor: 'rgba(0,0,0,0.05)',
          }}
        />,
      );
    }

    return <>{gridLines}</>;
  }, [canvasHeight, canvasWidth, showGrid]);

  useEffect(() => {
    if (!exportEl) {
      setElementGuidelines([]);
      return;
    }
    const all = Array.from(exportEl.querySelectorAll('.layer-item'));
    const selectedSet = new Set(moveableTargets);
    setElementGuidelines(all.filter((el) => !selectedSet.has(el)));
  }, [exportEl, layers, moveableTargets]);

  return (
    <div
      ref={handleContainerRef}
      className="canvas-container"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
      }}
    >
      <TransformWrapper
        initialScale={scale}
        minScale={0.1}
        maxScale={4}
        wheel={{ step: 0.08 }}
        doubleClick={{ disabled: true }}
        panning={{ excluded: ['layer-item'] }}
        onTransformed={({ state }) => setZoom(state.scale)}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 16 }}
          contentStyle={{ width: canvasWidth, height: canvasHeight }}
        >
          <div
            ref={handleCanvasRef}
            className="canvas-content"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              position: 'relative',
              backgroundColor: '#fff',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}
            onMouseDown={(e) => {
              if (e.target.closest('.layer-item')) return;
              setSelectedLayerIds([]);
              setEditingLayerId(null);
              onLayerSelect?.(null);
            }}
          >
            <div
              ref={handleExportRootRef}
              data-export-root
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                backgroundColor: '#fff',
                overflow: 'hidden',
              }}
            >
              {compositeImage && (
                <img
                  src={compositeImage}
                  alt="PSD Composite"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    pointerEvents: 'none',
                    zIndex: -1,
                  }}
                />
              )}
              {renderGrid()}
              {(renderMode === 'edit' ? layers : renderMode === 'proxy' ? proxyLayers : []).map((layer) => {
                if (layer.x < -10000 || layer.y < -10000) return null;
                return renderLayer(layer);
              })}
            </div>

            {renderSliceLines()}

            {!readOnly && (
              <>
                <Selecto
                  container={containerEl}
                  dragContainer={canvasEl}
                  selectableTargets={['.layer-item']}
                  selectByClick
                  selectFromInside={false}
                  continueSelect
                  toggleContinueSelect={['shift']}
                  hitRate={0}
                  onDragStart={(e) => {
                    const inputTarget = e.inputEvent?.target?.closest?.('[contenteditable="true"]');
                    if (inputTarget) e.stop();
                  }}
                  onSelectEnd={(e) => {
                    const nextIds = e.selected
                      .map((el) => el.getAttribute('data-layer-id'))
                      .filter(Boolean);
                    setSelectedLayerIds(nextIds);
                    if (nextIds.length === 0) {
                      setEditingLayerId(null);
                      onLayerSelect?.(null);
                      return;
                    }
                    const first = findLayerById(layers, nextIds[0]);
                    onLayerSelect?.(first || null);
                    if (editingLayerId && !nextIds.includes(editingLayerId)) {
                      setEditingLayerId(null);
                    }
                  }}
                />

                <Moveable
                  ref={moveableContainerRef}
                  target={moveableTargets}
                  container={canvasEl}
                  zoom={zoom}
                  draggable={!editingLayerId}
                  resizable={!editingLayerId}
                  rotatable={!editingLayerId}
                  snappable
                  elementGuidelines={elementGuidelines}
                  bounds={{ left: 0, top: 0, right: canvasWidth, bottom: canvasHeight }}
                  onDragStart={({ target }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const l = findLayerById(layers, layerId);
                    if (!l) return;
                    startSnapshotRef.current.set(layerId, {
                      x: l.x || 0,
                      y: l.y || 0,
                      width: l.width || 0,
                      height: l.height || 0,
                      rotation: typeof l.rotation === 'number' ? l.rotation : 0,
                    });
                  }}
                  onDrag={({ target, beforeTranslate }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const snapshot = startSnapshotRef.current.get(layerId);
                    if (!snapshot) return;

                    const nextX = snapshot.x + beforeTranslate[0];
                    const nextY = snapshot.y + beforeTranslate[1];

                    target.style.left = `${nextX}px`;
                    target.style.top = `${nextY}px`;

                    setLayers((prev) => patchLayerById(prev, layerId, { x: nextX, y: nextY }));
                  }}
                  onDragEnd={({ target }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const l = findLayerById(layersRef.current, layerId);
                    if (l) commitLayersToParent(layersRef.current, { type: 'move', layerId, x: l.x, y: l.y });
                    startSnapshotRef.current.delete(layerId);
                  }}
                  onResizeStart={({ target }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const l = findLayerById(layers, layerId);
                    if (!l) return;
                    startSnapshotRef.current.set(layerId, {
                      x: l.x || 0,
                      y: l.y || 0,
                      width: l.width || 0,
                      height: l.height || 0,
                      rotation: typeof l.rotation === 'number' ? l.rotation : 0,
                    });
                  }}
                  onResize={({ target, width, height, drag }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const snapshot = startSnapshotRef.current.get(layerId);
                    if (!snapshot) return;

                    const nextX = snapshot.x + (drag?.beforeTranslate?.[0] || 0);
                    const nextY = snapshot.y + (drag?.beforeTranslate?.[1] || 0);

                    target.style.width = `${width}px`;
                    target.style.height = `${height}px`;
                    target.style.left = `${nextX}px`;
                    target.style.top = `${nextY}px`;

                    setLayers((prev) => patchLayerById(prev, layerId, { x: nextX, y: nextY, width, height }));
                  }}
                  onResizeEnd={({ target }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const l = findLayerById(layersRef.current, layerId);
                    if (l) {
                      commitLayersToParent(layersRef.current, {
                        type: 'resize',
                        layerId,
                        x: l.x,
                        y: l.y,
                        width: l.width,
                        height: l.height,
                      });
                    }
                    startSnapshotRef.current.delete(layerId);
                  }}
                  onRotateStart={({ target }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const l = findLayerById(layers, layerId);
                    if (!l) return;
                    startSnapshotRef.current.set(layerId, {
                      x: l.x || 0,
                      y: l.y || 0,
                      width: l.width || 0,
                      height: l.height || 0,
                      rotation: typeof l.rotation === 'number' ? l.rotation : 0,
                    });
                  }}
                  onRotate={({ target, beforeRotate }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const snapshot = startSnapshotRef.current.get(layerId);
                    if (!snapshot) return;
                    const nextRotation = snapshot.rotation + beforeRotate;
                    target.style.transform = nextRotation ? `rotate(${nextRotation}deg)` : '';
                    setLayers((prev) => patchLayerById(prev, layerId, { rotation: nextRotation }));
                  }}
                  onRotateEnd={({ target }) => {
                    const layerId = target?.getAttribute?.('data-layer-id');
                    if (!layerId) return;
                    const l = findLayerById(layersRef.current, layerId);
                    if (l) commitLayersToParent(layersRef.current, { type: 'rotate', layerId, rotation: l.rotation || 0 });
                    startSnapshotRef.current.delete(layerId);
                  }}
                />
              </>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

export default CanvasLegacy;

