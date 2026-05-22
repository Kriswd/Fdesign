export function flattenLayers(layers) {
  const flat = [];
  const walk = (list, path) => {
    for (const l of list || []) {
      const nextPath = path ? `${path}/${l.name || l.id}` : (l.name || l.id);
      if (l?.type === 'group' && Array.isArray(l.children)) {
        walk(l.children, nextPath);
      } else {
        flat.push({ layer: l, path: nextPath });
      }
    }
  };
  walk(layers, '');
  return flat;
}

export function filterVariablesByLayerRules(variables) {
  const list = Array.isArray(variables) ? variables : [];
  return list.filter((v) => {
    if (!v) return false;
    if (v.isGhost) return false;
    if (v.isWhiteOrTransparent) return false;
    if (v.isSynthetic) return false;
    return true;
  });
}

export function stableSortByZIndex(list, getZIndex) {
  const items = Array.isArray(list) ? list.filter((x) => !!x) : [];
  const pick = typeof getZIndex === 'function' ? getZIndex : (x) => x?.zIndex;

  const withOrder = items.map((item, idx) => ({ item, __order: idx }));
  withOrder.sort((a, b) => {
    const azRaw = pick(a.item);
    const bzRaw = pick(b.item);
    const az = Number.isFinite(azRaw) ? azRaw : null;
    const bz = Number.isFinite(bzRaw) ? bzRaw : null;
    if (az != null && bz != null && az !== bz) return az - bz;
    if (az == null && bz != null) return 1;
    if (az != null && bz == null) return -1;
    return a.__order - b.__order;
  });

  return withOrder.map((x) => x.item);
}

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

function guessIsBackground(layer, canvasWidth, canvasHeight) {
  const w = Number(layer?.width) || 0;
  const h = Number(layer?.height) || 0;
  const area = w * h;
  const full = (Number(canvasWidth) || 0) * (Number(canvasHeight) || 0);
  if (full <= 0) return false;
  if (area / full >= 0.5) return true;
  const n = String(layer?.name || '');
  if (/(背景|bg|background)/i.test(n)) return true;
  return false;
}

export function extractTemplateFromPsd({ layers, canvasWidth, canvasHeight }) {
  const flat = flattenLayers(layers);
  const tagRe = /\{(text|img):\s*([^}]+?)\s*\}/i;

  const usedKeys = new Set();
  const variables = [];
  const warnings = [];

  for (const { layer, path } of flat) {
    // 1. 过滤隐藏图层
    if (layer.visible === false) continue;

    // 3. 过滤纯白或透明图层 (由 psdParser 标记)
    if (layer.isWhiteOrTransparent) continue;

    // 4. 过滤合成图层（纯色块、描边框等），用户通常不希望这些作为图片变量
    if (layer.isSynthetic) continue;

    if (layer.isGhost) {
      continue;
    }

    const name = String(layer?.name || '');
    const match = tagRe.exec(name);
    if (!match) continue;

    const tagType = match[1].toLowerCase();
    const rawKey = match[2];
    const key = ensureUniqueKey(usedKeys, sanitizeKey(rawKey));

    const isText = tagType === 'text';
    const isImg = tagType === 'img';

    // 3. 过滤空白文本
    if (isText) {
       const textContent = layer.text?.text || '';
       if (!textContent.trim()) continue;
    }

    if (isText && layer?.type !== 'text') {
      warnings.push(`变量 {text:${key}} 不是文字图层：${path}`);
    }
    if (isImg && layer?.type !== 'image') {
      warnings.push(`变量 {img:${key}} 不是图片图层：${path}`);
    }

    const base = {
      id: layer.id,
      psId: layer.psId,
      zIndex: layer.zIndex,
      key,
      varType: isText ? 'text' : 'img',
      name: layer?.name || key,
      path,
      x: Number(layer?.x) || 0,
      y: Number(layer?.y) || 0,
      width: Number(layer?.width) || 0,
      height: Number(layer?.height) || 0,
      visible: layer?.visible !== false,
      hidden: false,
    };

    if (isText) {
      const content = layer?.textData?.content ?? layer?.content ?? '';
      variables.push({ 
        ...base, 
        defaultValue: String(content), 
        value: String(content),
        // 传递文字样式
        fontSize: layer?.textData?.fontSize,
        color: layer?.textData?.color,
        textAlign: layer?.textData?.textAlign,
        fontFamily: layer?.textData?.fontFamily,
      });
    } else {
      const src = layer?.imageData || layer?.src || '';
      variables.push({ ...base, defaultValue: String(src || ''), value: String(src || '') });
    }
  }

  for (const v of variables) {
    if (v.visible) {
      warnings.push(`建议将变量图层隐藏（否则背景会出现重影）：${v.path}`);
    }
  }

  const candidates = {
    text: [],
    img: [],
  };

  if (variables.length === 0) {
    const candidateKeys = new Set();
    for (const { layer, path } of flat) {
      if (layer?.type === 'text') {
        // 1. 过滤隐藏图层
        if (layer.visible === false) continue;

        const content = layer?.textData?.content ?? layer?.content ?? '';
        // 2. 过滤掉没有内容或只有空白字符的文本图层
        if (!content || !String(content).trim()) {
          continue;
        }

        const key = ensureUniqueKey(candidateKeys, sanitizeKey(layer.name || path));
        candidates.text.push({
          id: layer.id,
          psId: layer.psId,
          zIndex: layer.zIndex,
          key,
          name: layer?.name || key,
          path,
          x: Number(layer?.x) || 0,
          y: Number(layer?.y) || 0,
          width: Number(layer?.width) || 0,
          height: Number(layer?.height) || 0,
          defaultValue: String(content),
          layerType: 'text',
        });
      } else if (layer?.type === 'image' && !guessIsBackground(layer, canvasWidth, canvasHeight)) {
        // 3. 过滤纯白/空白图片
        if (layer?.isWhiteOrTransparent) {
          continue;
        }
        if (layer?.isSynthetic) {
          continue;
        }
        if (layer?.isGhost) {
          continue;
        }

        const key = ensureUniqueKey(candidateKeys, sanitizeKey(layer.name || path));
        const src = layer?.imageData || layer?.src || '';
        candidates.img.push({
          id: layer.id,
          psId: layer.psId,
          zIndex: layer.zIndex,
          key,
          name: layer?.name || key,
          path,
          x: Number(layer?.x) || 0,
          y: Number(layer?.y) || 0,
          width: Number(layer?.width) || 0,
          height: Number(layer?.height) || 0,
          defaultValue: String(src || ''),
          layerType: 'image',
          hidden: false,
        });
      }
    }
  }

  return { variables, candidates, warnings };
}

export function buildVariablesFromCandidates(candidates) {
  const combined = [];

  (candidates?.text || []).forEach((c) => {
    combined.push({
      ...c,
      varType: 'text',
      defaultValue: c?.defaultValue ?? '',
      value: c?.defaultValue ?? '',
      hidden: !!c?.hidden,
    });
  });

  (candidates?.img || []).forEach((c) => {
    combined.push({
      ...c,
      varType: 'img',
      defaultValue: c?.defaultValue ?? '',
      value: c?.defaultValue ?? '',
      hidden: !!c?.hidden,
    });
  });

  return stableSortByZIndex(combined, (v) => v?.zIndex);
}
