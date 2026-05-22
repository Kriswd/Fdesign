export function computeFitScale(viewportWidth, viewportHeight, contentWidth, contentHeight, padding) {
  var safeViewportWidth = Math.max(1, Number(viewportWidth) || 0);
  var safeViewportHeight = Math.max(1, Number(viewportHeight) || 0);
  var safeContentWidth = Math.max(1, Number(contentWidth) || 0);
  var safeContentHeight = Math.max(1, Number(contentHeight) || 0);
  var safePadding = Math.max(0, Number(padding) || 0);

  var viewW = Math.max(1, safeViewportWidth - safePadding);
  var viewH = Math.max(1, safeViewportHeight - safePadding);

  var scaleX = viewW / safeContentWidth;
  var scaleY = viewH / safeContentHeight;
  return Math.min(scaleX, scaleY, 1);
}

export function computeInitialTransform(options) {
  var viewportWidth = options && options.viewportWidth;
  var viewportHeight = options && options.viewportHeight;
  var contentWidth = options && options.contentWidth;
  var contentHeight = options && options.contentHeight;
  var padding = options && options.padding !== undefined ? options.padding : 24;
  var topOffset = options && options.topOffset !== undefined ? options.topOffset : 20;
  var maxInitialScale = options && options.maxInitialScale !== undefined ? options.maxInitialScale : 0.78;

  var cap = Number(maxInitialScale);
  var capScale = Number.isFinite(cap) && cap > 0 ? Math.min(1, cap) : 1;

  if (!viewportWidth || !viewportHeight) {
    return { scale: capScale, positionX: 0, positionY: Number(topOffset) || 0 };
  }

  var scale = computeFitScale(viewportWidth, viewportHeight, contentWidth, contentHeight, padding);
  if (Number.isFinite(cap) && cap > 0) {
    scale = Math.min(scale, cap);
  }
  var scaledContentWidth = (Number(contentWidth) || 0) * scale;
  var positionX = (Number(viewportWidth) - scaledContentWidth) / 2;
  var positionY = Number(topOffset) || 0;

  return { scale: scale, positionX: positionX, positionY: positionY };
}
