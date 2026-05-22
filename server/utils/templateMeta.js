import crypto from 'crypto';
import { LAYER_FILTER_RULES } from '../config/layerRules.js';

function sanitizeKey(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'var';
  const ascii = raw
    .replace(/\{[^}]*\}/g, '')
    .replace(/[^\w\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return ascii || 'var';
}

function ensureUniqueKey(keys, base) {
  if (!keys.has(base)) {
    keys.add(base);
    return base;
  }
  for (let i = 2; i < 10000; i += 1) {
    const next = `${base}_${i}`;
    if (!keys.has(next)) {
      keys.add(next);
      return next;
    }
  }
  const fallback = `${base}_${Date.now()}`;
  keys.add(fallback);
  return fallback;
}

/**
 * 将 ag-psd 的颜色结构转换为 CSS rgba 字符串
 * @param {any} c - ag-psd 颜色对象
 * @returns {string|null} rgba(...) 或 null
 */
function toRgba(c) {
  if (!c || typeof c !== 'object') return null;
  const rawR = c.r ?? c.red;
  const rawG = c.g ?? c.green;
  const rawB = c.b ?? c.blue;
  const rawA = c.a ?? c.alpha;

  if (rawR === undefined || rawG === undefined || rawB === undefined) return null;

  const maxRgb = Math.max(Number(rawR), Number(rawG), Number(rawB));
  const scale = maxRgb <= 1 ? 255 : 1;
  const r = Math.round(Math.max(0, Math.min(255, Number(rawR) * scale)));
  const g = Math.round(Math.max(0, Math.min(255, Number(rawG) * scale)));
  const b = Math.round(Math.max(0, Math.min(255, Number(rawB) * scale)));

  let a = 1;
  if (rawA !== undefined) {
    const na = Number(rawA);
    a = na <= 1 ? na : na / 255;
  }
  a = Math.max(0, Math.min(1, a));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * 提取文字层的可用于预览的基础样式与默认文案
 * @param {any} layer - ag-psd 图层
 * @returns {{defaultValue: string, fontFamily?: string, fontSize?: number, color?: string}|null}
 */
function getTextPreviewMeta(layer) {
  const t = layer?.text;
  if (!t) return null;
  const defaultValue = String(t.textKey ?? t.text ?? t.value ?? '');
  const style = t.style || {};
  const fontFamily =
    style?.font?.name ||
    style?.font?.postScriptName ||
    style?.fontName ||
    style?.font ||
    undefined;
  const fontSize = typeof style?.fontSize === 'number' ? style.fontSize : undefined;
  const color = toRgba(style?.fillColor) || toRgba(style?.color) || undefined;
  return { defaultValue, fontFamily, fontSize, color };
}

function normalizeArtboardRect(artboardRect) {
  if (!artboardRect) return null;
  let left = Number(artboardRect?.left);
  let top = Number(artboardRect?.top);
  let right = Number(artboardRect?.right);
  let bottom = Number(artboardRect?.bottom);
  if (!Number.isFinite(left) && Array.isArray(artboardRect) && artboardRect.length >= 4) {
    left = Number(artboardRect[0]);
    top = Number(artboardRect[1]);
    right = Number(artboardRect[2]);
    bottom = Number(artboardRect[3]);
  }
  if (![left, top, right, bottom].every((n) => Number.isFinite(n))) return null;
  if (right < left || bottom < top) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function getRawLayerRect(layer) {
  const left = Number(layer?.left);
  const top = Number(layer?.top);
  const right = Number(layer?.right);
  const bottom = Number(layer?.bottom);
  if (![left, top, right, bottom].every((n) => Number.isFinite(n))) return null;
  return { left, top, right, bottom };
}

function pickArtboardContextForChildren(layer, parentContext, children) {
  const parent = parentContext && typeof parentContext === 'object' ? parentContext : null;
  const rect = normalizeArtboardRect(layer?.artboard?.artboardRect);
  if (!rect) return parent;
  const list = Array.isArray(children) ? children : [];
  let localHits = 0;
  let absoluteHits = 0;
  const eps = 2;
  const sampleCount = Math.min(24, list.length);
  for (let i = 0; i < sampleCount; i += 1) {
    const item = list[i];
    const r = getRawLayerRect(item);
    if (!r) continue;
    const localLike =
      r.left >= -eps &&
      r.top >= -eps &&
      r.right <= rect.width + eps &&
      r.bottom <= rect.height + eps;
    const absoluteLike =
      r.left >= rect.left - eps &&
      r.top >= rect.top - eps &&
      r.right <= rect.right + eps &&
      r.bottom <= rect.bottom + eps;
    if (localLike) localHits += 1;
    if (absoluteLike) absoluteHits += 1;
  }
  const shouldOffset = localHits > 0 && localHits >= absoluteHits;
  const parentOffsetX = Number(parent?.offsetX) || 0;
  const parentOffsetY = Number(parent?.offsetY) || 0;
  return {
    offsetX: parentOffsetX + (shouldOffset ? rect.left : 0),
    offsetY: parentOffsetY + (shouldOffset ? rect.top : 0),
    artboardRect: rect,
  };
}

function boundsFromLayer(layer, context) {
  const rect = getRawLayerRect(layer);
  const offsetX = Number(context?.offsetX) || 0;
  const offsetY = Number(context?.offsetY) || 0;
  const left = rect ? rect.left + offsetX : offsetX;
  const top = rect ? rect.top + offsetY : offsetY;
  const right = rect ? rect.right + offsetX : left;
  const bottom = rect ? rect.bottom + offsetY : top;
  if (![left, top, right, bottom].every((n) => Number.isFinite(n))) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * 粗略判断图片层是否更像“背景”（避免把整张背景也变成可编辑图片）
 * @param {any} layer - ag-psd 图层
 * @param {number} canvasWidth - 画布宽
 * @param {number} canvasHeight - 画布高
 * @returns {boolean}
 */
function guessIsBackground(layer, canvasWidth, canvasHeight, context) {
  const b = boundsFromLayer(layer, context);
  const area = (Number(b.width) || 0) * (Number(b.height) || 0);
  const full = (Number(canvasWidth) || 0) * (Number(canvasHeight) || 0);
  const n = String(layer?.name || '');
  if (isWhitelistedName(n)) return false;
  if (/(背景|bg|background)/i.test(n)) return true;
  if (full > 0 && area / full >= 0.95) return true;
  return false;
}

function walk(children, path, out, context) {
  for (const layer of children || []) {
    const nextPath = path ? `${path}/${layer.name || 'Layer'}` : (layer.name || 'Layer');
    if (layer?.artboard && Array.isArray(layer.children) && layer.children.length > 0) {
      const childContext = pickArtboardContextForChildren(layer, context, layer.children);
      walk(layer.children, nextPath, out, childContext);
      continue;
    }
    if (Array.isArray(layer.children) && layer.children.length > 0) {
      walk(layer.children, nextPath, out, context);
    } else {
      out.push({ layer, path: nextPath, context });
    }
  }
}

function isSuspectName(name) {
  const nameLower = String(name || '').toLowerCase();
  if (!nameLower) return false;
  const banned = Array.isArray(LAYER_FILTER_RULES?.BANNED_KEYWORDS) ? LAYER_FILTER_RULES.BANNED_KEYWORDS : [];
  for (const k of banned) {
    const kk = String(k || '').toLowerCase();
    if (kk && nameLower.includes(kk)) return true;
  }
  return false;
}

function isWhitelistedName(name) {
  const nameLower = String(name || '').toLowerCase();
  if (!nameLower) return false;
  const white = Array.isArray(LAYER_FILTER_RULES?.WHITELIST_KEYWORDS) ? LAYER_FILTER_RULES.WHITELIST_KEYWORDS : [];
  for (const k of white) {
    const kk = String(k || '').toLowerCase();
    if (kk && nameLower.includes(kk)) return true;
  }
  return false;
}

function extractGuideLayers(flat, canvasWidth, canvasHeight) {
  const guides = [];
  const guideNameRe = /(guide|guideline|参考线|辅助线|对齐线|边距)/i;
  const guideGroupRe = /(^|\/)(__guides__|guides|参考线|辅助线|规范需隐藏)(\/|$)/i;
  const cw = Number(canvasWidth) || 0;
  const ch = Number(canvasHeight) || 0;
  const maxWidth = Math.max(2, Math.round(cw * 0.05));
  const minHeight = Math.max(20, Math.round(ch * 0.3));
  for (const item of flat) {
    const layer = item?.layer;
    if (!layer) continue;
    const name = String(layer?.name || '').trim();
    const layerPath = String(item?.path || '');
    if (!name && !layerPath) continue;
    const inGuideGroup = guideGroupRe.test(layerPath);
    const byName = guideNameRe.test(name);
    if (!inGuideGroup && !byName) continue;
    const b = boundsFromLayer(layer, item?.context);
    if (!Number.isFinite(b.x) || !Number.isFinite(b.width) || !Number.isFinite(b.height) || b.width <= 0 || b.height <= 0) continue;
    if (b.width > maxWidth || b.height < minHeight) continue;
    const x = Math.round(b.x + b.width / 2);
    guides.push({ name, path: layerPath, x });
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

function extractPsdGuides(psd, canvasWidth, canvasHeight) {
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
      if (Number.isInteger(n) && n % 32 === 0) {
        const candidate = n / 32;
        if (Math.abs(candidate) <= maxDim + 1) return candidate;
      }
      if (Math.abs(n) > maxDim + 1) {
        const candidate = n / 32;
        if (Math.abs(candidate) <= maxDim + 1) return candidate;
      }
    }
    return n;
  };

  const vertical = [];
  const horizontal = [];
  for (const g of list) {
    const axis = normalizeAxis(g?.direction);
    if (!axis) continue;
    const px = normalizeLocationPx(g?.location);
    if (px == null) continue;
    const rounded = Math.round(Number(px));
    if (!Number.isFinite(rounded)) continue;
    if (axis === 'vertical') vertical.push(rounded);
    if (axis === 'horizontal') horizontal.push(rounded);
  }
  const uniq = (arr) => Array.from(new Set(arr)).sort((a, b) => a - b);
  return {
    vertical: uniq(vertical),
    horizontal: uniq(horizontal),
  };
}

function pickBackgroundRect(flat, canvasWidth, canvasHeight) {
  const cw = Number(canvasWidth) || 0;
  const ch = Number(canvasHeight) || 0;
  const full = cw > 0 && ch > 0 ? cw * ch : 0;
  for (let i = flat.length - 1; i >= 0; i -= 1) {
    const item = flat[i];
    const layer = item?.layer;
    if (!layer || layer.hidden) continue;
    if (layer.text) continue;
    const b = boundsFromLayer(layer, item?.context);
    const w = Number(b.width) || 0;
    const h = Number(b.height) || 0;
    if (w <= 0 || h <= 0) continue;
    const area = w * h;
    const name = String(layer?.name || '');
    const isNameBg = /(背景|底图|bg|background)/i.test(name);
    const isLarge = full > 0 ? area / full >= 0.5 : false;
    if (!isNameBg && !isLarge) continue;
    return {
      ...b,
      psId: layer.id,
      name,
      path: item?.path || '',
    };
  }

  for (let i = flat.length - 1; i >= 0; i -= 1) {
    const item = flat[i];
    const layer = item?.layer;
    if (!layer || layer.hidden) continue;
    if (layer.text) continue;
    if (!(layer.placedLayer || layer.canvas || layer.imageData)) continue;
    const b = boundsFromLayer(layer, item?.context);
    const w = Number(b.width) || 0;
    const h = Number(b.height) || 0;
    if (w <= 0 || h <= 0) continue;
    return {
      ...b,
      psId: layer.id,
      name: layer?.name || '',
      path: item?.path || '',
    };
  }

  return null;
}

function normalizePsId(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function extractArtboardName(pathValue, fallbackName) {
  const raw = String(pathValue || '').trim();
  if (raw) {
    const first = raw.split('/')[0];
    const normalized = String(first || '').trim();
    if (normalized) return normalized;
  }
  return String(fallbackName || '').trim();
}

function pickUploadBaseName(update) {
  const raw = String(update?.sourceName || update?.imagePath || update?.imageAbsPath || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const withoutQuery = normalized.split('?')[0].split('#')[0];
  const base = withoutQuery.split('/').pop() || '';
  if (!base) return '';
  const name = base.replace(/\.[^.]+$/, '').trim();
  return name || base;
}

const STYLE_RE = /([A-Za-z]{2}\d{4})/;
const STYLE_COLOR_RE = /([A-Za-z]{2}\d{4})(?:[\s_-]*([A-Za-z]\d{2}|[A-Za-z]{2}))?/;
const PURE_STYLE_COLOR_ARTBOARD_RE = /^([A-Za-z]{2}\d{4})(?:[\s_-]*([A-Za-z]\d{2}|[A-Za-z]{2}))$/i;

function parseStyleInfoFromName(name) {
  const raw = String(name || '').trim();
  if (!raw) return { styleNo: '', styleColor: '' };
  const m = STYLE_COLOR_RE.exec(raw);
  if (!m) return { styleNo: '', styleColor: '' };
  const styleNo = String(m[1] || '').toUpperCase();
  const colorNo = String(m[2] || '').toUpperCase();
  return {
    styleNo,
    styleColor: styleNo && colorNo ? `${styleNo} ${colorNo}` : '',
  };
}

function isTmallMainArtboardName(name) {
  return /天猫主图/i.test(String(name || ''));
}

function normalizeInlineSpaces(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([/_-])/g, '$1')
    .replace(/([/_-])\s+/g, '$1')
    .trim();
}

function rewriteTmallMainArtboardName(artboardName, styleNo, styleColor) {
  const raw = String(artboardName || '').trim();
  const nextStyle = String(styleNo || '').trim().toUpperCase();
  const nextStyleColor = String(styleColor || '').trim().toUpperCase();
  if (!raw || !nextStyle) return raw;
  const current = parseStyleInfoFromName(raw);
  if (current.styleNo) {
    const replacement = current.styleColor ? (nextStyleColor || nextStyle) : nextStyle;
    return normalizeInlineSpaces(raw.replace(STYLE_COLOR_RE, replacement));
  }
  if (isTmallMainArtboardName(raw)) {
    return normalizeInlineSpaces(raw.replace(/(\u5929\u732b\u4e3b\u56fe)/i, '$1 ' + nextStyle));
  }
  return raw;
}

function isPureStyleColorArtboardName(name) {
  const raw = String(name || '').trim();
  if (!raw) return false;
  return PURE_STYLE_COLOR_ARTBOARD_RE.test(raw);
}

function buildArtboardNextName(artboard, baseName) {
  const artboardName = String(artboard || '').trim();
  const parsed = parseStyleInfoFromName(baseName);
  if (!parsed.styleNo) return String(baseName || '').trim();
  if (isTmallMainArtboardName(artboardName)) {
    return rewriteTmallMainArtboardName(artboardName, parsed.styleNo, parsed.styleColor);
  }
  if (isPureStyleColorArtboardName(artboardName)) {
    return parsed.styleColor || parsed.styleNo;
  }
  return parsed.styleColor || parsed.styleNo;
}

export function buildArtboardRenameMap({ variables, updates } = {}) {
  const psIdToArtboard = new Map();
  const varList = Array.isArray(variables) ? variables : [];
  const debugLog = [];
  
  debugLog.push(`[artboard_rename_debug] variables count: ${varList.length}`);
  
  for (let i = 0; i < varList.length; i += 1) {
    const item = varList[i];
    const psId = normalizePsId(item?.psId);
    if (psId == null) continue;
    const artboard = extractArtboardName(item?.path, item?.name);
    if (!artboard) continue;
    if (!psIdToArtboard.has(psId)) psIdToArtboard.set(psId, artboard);
    debugLog.push(`[artboard_rename_debug] var[${i}] psId=${psId}, artboard="${artboard}", path="${item?.path}", name="${item?.name}"`);
  }

  const out = {};
  const updateList = Array.isArray(updates) ? updates : [];
  debugLog.push(`[artboard_rename_debug] updates count: ${updateList.length}`);
  debugLog.push(`[artboard_rename_debug] psIdToArtboard size: ${psIdToArtboard.size}`);
  
  for (let i = 0; i < updateList.length; i += 1) {
    const item = updateList[i];
    const type = String(item?.varType || '').toLowerCase();
    if (type !== 'img') continue;
    const psId = normalizePsId(item?.psId);
    if (psId == null) {
      debugLog.push(`[artboard_rename_debug] update[${i}] SKIP: psId invalid, raw=${item?.psId}`);
      continue;
    }
    const artboard = psIdToArtboard.get(psId);
    if (!artboard) {
      debugLog.push(`[artboard_rename_debug] update[${i}] SKIP: psId=${psId} not found in psIdToArtboard`);
      continue;
    }
    const baseName = pickUploadBaseName(item);
    if (!baseName) {
      debugLog.push(`[artboard_rename_debug] update[${i}] SKIP: baseName empty, sourceName="${item?.sourceName}", imagePath="${item?.imagePath}"`);
      continue;
    }
    const key = String(psId);
    if (Object.prototype.hasOwnProperty.call(out, key)) continue;
    out[key] = buildArtboardNextName(artboard, baseName);
    debugLog.push(`[artboard_rename_debug] update[${i}] MAPPED: psId=${psId}, artboard="${artboard}", baseName="${baseName}", newName="${out[key]}"`);
  }
  
  debugLog.push(`[artboard_rename_debug] FINAL renameMap: ${JSON.stringify(out)}`);
  console.info(debugLog.join('\n'));
  
  // 用 psId 字符串为 key，而非画板名。同名画板（如多个"BL3208 C50"）各有独立 psId，
  // 不会相互覆盖，每个画板都能被正确重命名为对应产品图名称。
  return out;
}

export function extractTemplateMeta(psd) {
  const flat = [];
  walk(psd?.children || [], '', flat, null);
  const guideLayers = extractGuideLayers(flat, psd?.width, psd?.height);
  const psdGuides = extractPsdGuides(psd, psd?.width, psd?.height);

  const tagRe = /\{(text|img):\s*([^}]+?)\s*\}/i;
  const usedKeys = new Set();
  const variables = [];
  const warnings = [];

  for (const { layer, path, context } of flat) {
    const name = String(layer?.name || '');
    const match = tagRe.exec(name);
    if (!match) continue;
    const tagType = match[1].toLowerCase();
    const rawKey = match[2];
    const key = ensureUniqueKey(usedKeys, sanitizeKey(rawKey));
    const b = boundsFromLayer(layer, context);

    const varType = tagType === 'text' ? 'text' : 'img';
    const textMeta = varType === 'text' ? getTextPreviewMeta(layer) : null;
    variables.push({
      id: crypto.createHash('sha1').update(`${path}:${varType}:${key}`).digest('hex').slice(0, 16),
      psId: layer.id,
      key,
      varType,
      name: layer?.name || key,
      path,
      ...b,
      visible: layer?.hidden ? false : true,
      ...(textMeta || {}),
    });
  }

  for (const v of variables) {
    if (v.visible) warnings.push(`建议将变量图层隐藏（否则挖孔前预览可能重影）：${v.path}`);
  }

  const candidates = { text: [], img: [] };
  if (variables.length === 0) {
    const candidateKeys = new Set();
    for (const { layer, path, context } of flat) {
      const b = boundsFromLayer(layer, context);
      if (layer?.hidden) continue;
      if (layer?.text) {
        const key = ensureUniqueKey(candidateKeys, sanitizeKey(layer.name || path));
        const textMeta = getTextPreviewMeta(layer);
        candidates.text.push({
          id: crypto.createHash('sha1').update(`${path}:text:${key}`).digest('hex').slice(0, 16),
          psId: layer.id,
          key,
          name: layer?.name || key,
          path,
          ...b,
          layerType: 'text',
          ...(textMeta || { defaultValue: '' }),
        });
      } else if ((layer?.placedLayer || layer?.canvas || layer?.imageData) && !guessIsBackground(layer, psd?.width, psd?.height, context)) {
        const name = layer?.name || '';
        if (isSuspectName(name) && !isWhitelistedName(name)) {
          continue;
        }
        const key = ensureUniqueKey(candidateKeys, sanitizeKey(layer.name || path));
        candidates.img.push({
          id: crypto.createHash('sha1').update(`${path}:img:${key}`).digest('hex').slice(0, 16),
          psId: layer.id,
          key,
          name: layer?.name || key,
          path,
          ...b,
          layerType: 'image',
          defaultValue: '',
        });
      }
    }
  }

  const backgroundRect = pickBackgroundRect(flat, psd?.width, psd?.height);

  return {
    width: psd?.width || 0,
    height: psd?.height || 0,
    variables,
    candidates,
    warnings,
    backgroundRect,
    guides: psdGuides,
    guideLayers,
  };
}
