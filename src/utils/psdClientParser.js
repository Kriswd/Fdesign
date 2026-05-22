
import * as agPsd from 'ag-psd';
import { flattenLayers, stableSortByZIndex, filterVariablesByLayerRules } from './templateExtractor.js';

const { readPsd, initializeCanvas } = agPsd;

if (typeof document !== 'undefined') {
  initializeCanvas((width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
}

const isGuideDebugEnabled = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const flag = String(window.localStorage?.getItem('debug_guides') || '').trim();
    if (flag === '1' || flag.toLowerCase() === 'true') return true;
    const qs = String(window.location?.search || '');
    return /(^|[?&])debugGuides=1(&|$)/.test(qs);
  } catch {
    return false;
  }
})();

function extractPsdGuides(psd, canvasWidth, canvasHeight) {
  const imageResources = psd?.imageResources;
  const rawCandidate =
    psd?.gridAndGuidesInformation?.guides
    ?? psd?.gridAndGuidesInformation?.guidesList
    ?? imageResources?.gridAndGuidesInformation?.guides
    ?? imageResources?.gridAndGuidesInformation?.guidesList
    ?? imageResources?.[1032]?.guides
    ?? imageResources?.['1032']?.guides
    ?? imageResources?.[1032]?.gridAndGuidesInformation?.guides
    ?? imageResources?.['1032']?.gridAndGuidesInformation?.guides;

  const list = Array.isArray(rawCandidate)
    ? rawCandidate
    : Array.isArray(rawCandidate?.guides)
      ? rawCandidate.guides
      : Array.isArray(rawCandidate?.guidesList)
        ? rawCandidate.guidesList
        : [];

  const cw = Number(canvasWidth) || 0;
  const ch = Number(canvasHeight) || 0;
  const maxDim = Math.max(cw, ch);

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

  const normalizeLocationPx = (location, axis) => {
    const n = Number(location);
    if (!Number.isFinite(n)) return null;
    const axisMax = axis === 'vertical' ? cw : axis === 'horizontal' ? ch : maxDim;
    if (axisMax > 0 && n > 0 && n < 1) return n * axisMax;
    if (axisMax > 0 && Math.abs(n) > axisMax + 1) {
      const denoms = [32, 65536, 256, 16, 8, 1000];
      for (let i = 0; i < denoms.length; i += 1) {
        const d = denoms[i];
        const candidate = n / d;
        if (Math.abs(candidate) <= axisMax + 1) return candidate;
      }
    }
    return n;
  };

  const vertical = [];
  const horizontal = [];
  const rawSamples = [];
  for (let i = 0; i < list.length; i += 1) {
    const g = list[i];
    const axis = normalizeAxis(g?.direction ?? g?.orientation ?? g?.axis ?? g?.dir ?? g?.type ?? g?.kind);
    const px = normalizeLocationPx(g?.location ?? g?.position ?? g?.pos ?? g?.coordinate ?? g?.coord ?? g?.value, axis);
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
}

function extractGuideLayers(psd, canvasWidth, canvasHeight) {
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
}

function extractLooseImageLayers({ psd, canvasWidth, canvasHeight }) {
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
        imageData: child.imageData,
        src: child.src
      });
    }
  };

  walk(psd?.children, '');

  return stableSortByZIndex(layers, (l) => l?.zIndex);
}

function buildBatchImageVariablesFromLayers({ layers, canvasWidth, canvasHeight }) {
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
}

export async function parsePsdClientSide(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
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
      stableSortByZIndex((baseVariables || []).map((v) => ({
        ...v,
        id: v?.id != null ? String(v.id) : v?.id,
        hidden: v && v.hidden !== undefined ? v.hidden : false,
        value: undefined,
        psId: v?.psId,
      })), (v) => v?.zIndex),
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
      rawVariables: variables
    };
  } catch (e) {
    console.error("Parse failed", e);
    throw e;
  }
}

export { extractPsdGuides };
