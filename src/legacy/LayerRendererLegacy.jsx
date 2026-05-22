import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import StyleMapper from '../utils/styleMapper';

const styleMapper = new StyleMapper();

function getTextData(layer) {
  if (layer?.textData) return layer.textData;

  const fallbackFontSize = typeof layer?.fontSize === 'number' ? layer.fontSize : 16;
  return {
    content: typeof layer?.content === 'string' ? layer.content : '',
    fontFamily: layer?.fontFamily || 'PingFang SC',
    fontSize: fallbackFontSize,
    fontWeight: layer?.fontWeight || 400,
    fontStyle: layer?.fontStyle || 'normal',
    color: layer?.color || 'rgba(0, 0, 0, 1)',
    textAlign: layer?.textAlign || 'left',
    letterSpacing: typeof layer?.letterSpacing === 'number' ? layer.letterSpacing : 0,
    lineHeight: typeof layer?.lineHeight === 'number' ? layer.lineHeight : fallbackFontSize * 1.2,
    textTransform: layer?.textTransform || 'none',
    baseline: layer?.baseline,
    engineData: layer?.engineData || null,
  };
}

function isLayerSelected(layerId, selectedLayerIds, selectedLayerId) {
  if (Array.isArray(selectedLayerIds)) return selectedLayerIds.includes(layerId);
  return selectedLayerId === layerId;
}

const LayerRendererLegacy = memo(function LayerRendererLegacy({
  layer,
  selectedLayerId,
  selectedLayerIds,
  editingLayerId,
  onBeginEdit,
  onEndEdit,
  onTextChange,
  onImageReplace,
  onAddImages,
  readOnly = false,
  showBoundingBox = false,
  bindField: incomingBindField = null,
  boundFields = {},
}) {
  const isSelected = isLayerSelected(layer.id, selectedLayerIds, selectedLayerId);
  const bindField = incomingBindField || (boundFields && boundFields[layer.id]);
  const isEditing = editingLayerId === layer.id;

  const fileInputRef = useRef(null);
  const textRef = useRef(null);

  const rotation = typeof layer.rotation === 'number' ? layer.rotation : 0;

  const wrapperStyle = useMemo(() => {
    const effectsStyle = layer.effects ? styleMapper.mapLayerEffectsToCSS(layer.effects) : {};
    const outline = showBoundingBox && isSelected ? '2px solid #007AFF' : 'none';

    const widthCss = Number.isFinite(layer.width) && layer.width > 0 ? `${layer.width}px` : 'auto';
    const heightCss = Number.isFinite(layer.height) && layer.height > 0 ? `${layer.height}px` : 'auto';

    return {
      position: 'absolute',
      left: `${layer.x || 0}px`,
      top: `${layer.y || 0}px`,
      width: widthCss,
      height: heightCss,
      zIndex: Number.isFinite(layer.zIndex) ? layer.zIndex : undefined,
      opacity: layer.opacity ?? 1,
      mixBlendMode: layer.blendMode || 'normal',
      display: layer.visible !== false ? 'block' : 'none',
      transform: rotation ? `rotate(${rotation}deg)` : undefined,
      transformOrigin: 'center center',
      outline,
      ...effectsStyle,
    };
  }, [layer, rotation, isSelected, showBoundingBox]);

  const handleTextDoubleClick = useCallback(
    (e) => {
      if (readOnly) return;
      e.stopPropagation();
      onBeginEdit?.(layer.id);
      queueMicrotask(() => textRef.current?.focus());
    },
    [layer.id, onBeginEdit, readOnly],
  );

  const handleTextBlur = useCallback(() => {
    if (readOnly) return;
    if (!isEditing) return;

    const nextText = textRef.current?.innerText ?? '';
    onTextChange?.(layer.id, nextText);
    onEndEdit?.();
  }, [isEditing, layer.id, onEndEdit, onTextChange, readOnly]);

  const handleTextKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      textRef.current?.blur();
    }
  }, []);

  const handleImageDoubleClick = useCallback(
    (e) => {
      if (readOnly) return;
      e.stopPropagation();
      fileInputRef.current?.click();
    },
    [readOnly],
  );

  const handleReplaceImage = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const nextUrl = URL.createObjectURL(file);
      onImageReplace?.(layer.id, nextUrl);
      e.target.value = '';
    },
    [layer.id, onImageReplace],
  );

  const handleDrop = useCallback(
    (e) => {
      if (readOnly || layer.type !== 'image') return;
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      const urls = imageFiles.map((f) => URL.createObjectURL(f));
      if (imageFiles.length === 1) onImageReplace?.(layer.id, urls[0]);
      else onAddImages?.(layer.id, urls);
    },
    [layer.id, layer.type, onAddImages, onImageReplace, readOnly],
  );

  const handleDragOver = useCallback(
    (e) => {
      if (readOnly || layer.type !== 'image') return;
      e.preventDefault();
      e.stopPropagation();
    },
    [layer.type, readOnly],
  );

  useEffect(() => {
    window.debugLayerRenderer = { getTextData };
  }, []);

  if (layer.type === 'group') {
    return (
      <div
        className="group-layer"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          opacity: layer.opacity ?? 1,
          mixBlendMode: layer.blendMode || 'normal',
          display: layer.visible !== false ? 'block' : 'none',
          pointerEvents: 'none',
        }}
      >
        {layer.children?.map((child) => (
          <LayerRendererLegacy
            key={child.id}
            layer={child}
            selectedLayerId={selectedLayerId}
            selectedLayerIds={selectedLayerIds}
            editingLayerId={editingLayerId}
            onBeginEdit={onBeginEdit}
            onEndEdit={onEndEdit}
            onTextChange={onTextChange}
            onImageReplace={onImageReplace}
            onAddImages={onAddImages}
            readOnly={readOnly}
            showBoundingBox={showBoundingBox}
            boundFields={boundFields}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`layer-item layer-${layer.type || 'unknown'} ${isSelected ? 'is-selected' : ''} ${bindField ? 'is-bound' : ''}`}
      data-layer-id={layer.id}
      style={wrapperStyle}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {layer.type === 'text' && (
        <div
          ref={textRef}
          className="text-layer"
          contentEditable={isEditing && !readOnly}
          suppressContentEditableWarning
          onDoubleClick={handleTextDoubleClick}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            outline: 'none',
            cursor: readOnly ? 'default' : 'text',
            overflow: 'visible',
            pointerEvents: 'auto',
            ...styleMapper.mapTextStyle(getTextData(layer), {
              containerWidth: Number.isFinite(layer.width) && layer.width > 0 ? layer.width : undefined,
              isPointText: getTextData(layer).isPointText === true,
              isParagraph: getTextData(layer).isParagraph === true,
            }),
          }}
        >
          {getTextData(layer).content}
        </div>
      )}

      {layer.type === 'image' && (
        <>
          {layer.imageData || layer.src ? (
            <img
              src={layer.imageData || layer.src}
              alt={layer.name || ''}
              className="image-layer"
              onDoubleClick={handleImageDoubleClick}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                display: 'block',
                pointerEvents: 'auto',
                cursor: readOnly ? 'default' : 'move',
              }}
            />
          ) : (
            <div
              className="image-layer placeholder"
              onDoubleClick={handleImageDoubleClick}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                backgroundColor: '#F5F5F7',
                border: '1px dashed #D1D1D6',
                color: '#6B7280',
                fontSize: 12,
                pointerEvents: 'auto',
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{layer.name || '图片图层'}</div>
              <div style={{ marginTop: 6 }}>{layer.missingLink ? '链接文件丢失' : '无图片数据'}</div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.9 }}>(双击替换)</div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleReplaceImage}
          />
        </>
      )}

      {layer.type === 'shape' && (
        <div
          className="shape-layer"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: layer.fillColor ? layer.fillColor : 'transparent',
            border:
              layer.strokeColor && layer.strokeWidth
                ? `${layer.strokeWidth}px solid ${layer.strokeColor}`
                : 'none',
            pointerEvents: 'auto',
            cursor: readOnly ? 'default' : 'move',
          }}
        />
      )}
    </div>
  );
});

export default LayerRendererLegacy;

