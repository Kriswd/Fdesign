export function computePanToCenter({ viewportWidth, viewportHeight, scale, targetCenterX, targetCenterY }) {
  const vw = Number(viewportWidth) || 0;
  const vh = Number(viewportHeight) || 0;
  const s = Number(scale);
  const cx = Number(targetCenterX);
  const cy = Number(targetCenterY);
  if (!Number.isFinite(s) || s <= 0) return null;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  if (!Number.isFinite(vw) || vw <= 0 || !Number.isFinite(vh) || vh <= 0) return null;
  const positionX = vw / 2 - cx * s;
  const positionY = vh / 2 - cy * s;
  return { positionX, positionY, scale: s };
}

