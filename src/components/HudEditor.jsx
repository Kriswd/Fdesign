import { useMemo } from 'react';
import Xarrow, { Xwrapper, useXarrow } from 'react-xarrows';
import CanvasLayer from './hud/CanvasLayer';
import SidePanel from './hud/SidePanel';

function HudEditor({
  width,
  height,
  referenceImage,
  showGuides,
  guides,
  guideLayers,
  guidePicker,
  initialViewport,
  maxInitialScale,
  hotspots,
  selectedId,
  highlightedIds,
  attentionIds,
  onSelect,
  readOnly: _readOnly,
  onHotspotValueChange,
  sliceLines,
  showSliceLines,
  onCanvasReady,
  onViewportChange,
  showSidePanel = true,
  showActiveHotspotLabel = true,
}) {
  const updateXarrow = useXarrow();

  const activeHotspot = useMemo(
    () => (hotspots || []).find((h) => h.id === selectedId) || null,
    [hotspots, selectedId],
  );

  const startId = selectedId ? `hotspot-${selectedId}` : null;
  const endId = 'hud-panel-anchor';

  return (
    <Xwrapper>
      <div className="w-full h-full flex gap-4">
        <div className="flex-1 min-w-0 relative bg-white rounded-xl overflow-hidden border border-gray-200">
          <CanvasLayer
            width={width}
            height={height}
            referenceImage={referenceImage}
            showGuides={showGuides}
            guides={guides}
            guideLayers={guideLayers}
            guidePicker={guidePicker}
            initialViewport={initialViewport}
            maxInitialScale={maxInitialScale}
            hotspots={hotspots}
            selectedId={selectedId}
            highlightedIds={highlightedIds}
            attentionIds={attentionIds}
            onSelect={(id, e) => {
              onSelect?.(id, e);
              updateXarrow();
            }}
            sliceLines={sliceLines}
            showSliceLines={showSliceLines}
            onCanvasReady={onCanvasReady}
            showActiveHotspotLabel={showActiveHotspotLabel}
            onViewportChange={(state) => {
              onViewportChange?.(state);
              updateXarrow();
            }}
          />
          {showSidePanel !== false && startId && (
            <Xarrow
              start={startId}
              end={endId}
              color="#1890ff"
              strokeWidth={2}
              showHead
              curveness={0.6}
              path="smooth"
              headSize={5}
              zIndex={50}
            />
          )}
        </div>

        {showSidePanel !== false ? (
          <div className="w-[240px] shrink-0">
            <SidePanel activeHotspot={activeHotspot} onHotspotValueChange={onHotspotValueChange} onEdited={updateXarrow} />
          </div>
        ) : null}
      </div>
    </Xwrapper>
  );
}

export default HudEditor;
