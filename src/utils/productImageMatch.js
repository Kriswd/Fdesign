const normalizeBaseName = (raw) => {
  const s = raw == null ? '' : String(raw);
  const noExt = s.replace(/\.[^/.]+$/g, '');
  const unified = noExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return unified;
};

export const pickAngle = (name) => {
  const s = normalizeBaseName(name).toLowerCase();
  if (!s) return null;
  if (s.includes('45度') || s.includes('45°') || s.includes('斜45') || /(?:^|[^0-9a-z])45(?:$|[^0-9a-z])/.test(s)) return '45';
  if (s.includes('侧') || s.includes('侧面') || s.includes('侧视') || /\bside\b/.test(s)) return '侧';
  if (s.includes('正') || s.includes('正面') || s.includes('正视') || s.includes('主图') || s.includes('主视') || /\bfront\b/.test(s)) return '正';
  if (s.includes('90度') || s.includes('90°') || /(?:^|[^0-9a-z])90(?:$|[^0-9a-z])/.test(s)) return '侧';
  return null;
};

const stripAngleTokens = (raw) => {
  return String(raw || '')
    .replace(/(^|[^0-9a-zA-Z])90(?:度|°)?(?=[^0-9a-zA-Z]|$)/gi, '$1 ')
    .replace(/(^|[^0-9a-zA-Z])45(?:度|°)?(?=[^0-9a-zA-Z]|$)/gi, '$1 ')
    .replace(/(^|[^0-9a-zA-Z])(?:正|侧)(?=[^0-9a-zA-Z]|$)/g, '$1 ')
    .replace(/\b(?:front|side)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const parseModel = (raw) => {
  const norm = stripAngleTokens(normalizeBaseName(raw)).toUpperCase();
  if (!norm) return null;
  const m = /([A-Z]{1,4}\d{3,7})/.exec(norm);
  return m ? String(m[1]) : null;
};

export const parseColor = (raw, modelHint) => {
  const norm = stripAngleTokens(normalizeBaseName(raw)).toUpperCase();
  if (!norm) return null;
  const model = modelHint ? String(modelHint).toUpperCase() : null;
  if (model && norm.includes(model)) {
    const tail = norm.slice(norm.indexOf(model) + model.length);
    const m1 = /(?:^|[_\s])([A-Z]{1,2}\d{1,3})(?:$|[_\s])/.exec(` ${tail} `);
    if (m1 && m1[1] !== '45' && m1[1] !== '90') return String(m1[1]);
  }
  const m2 = /(?:^|[_\s])([A-Z]{1,2}\d{1,3})(?:$|[_\s])/.exec(` ${norm} `);
  if (m2 && m2[1] !== '45' && m2[1] !== '90') return String(m2[1]);
  return null;
};

export const parseProductImageName = (originalName) => {
  const base = normalizeBaseName(originalName);
  const angle = pickAngle(base);
  const stripped = stripAngleTokens(base).toUpperCase();
  const model = parseModel(stripped);
  const color = parseColor(stripped, model);
  const key = model && color ? `${model}_${color}` : model ? model : null;
  return {
    originalName: originalName == null ? '' : String(originalName),
    baseName: base,
    model,
    color,
    angle,
    key,
  };
};

export const buildProductImageCatalog = (images) => {
  const list = Array.isArray(images) ? images : [];
  const parsed = list
    .map((img, index) => {
      const originalName = img?.originalName || img?.storedName || img?.name || `image_${index + 1}`;
      const meta = parseProductImageName(originalName);
      return {
        ...meta,
        publicUrl: typeof img?.publicUrl === 'string' ? img.publicUrl : null,
        imagePath: typeof img?.imagePath === 'string' ? img.imagePath : null,
        storedName: typeof img?.storedName === 'string' ? img.storedName : null,
      };
    })
    .filter((it) => it && it.model && it.color);
  const byKey = new Map();
  for (const it of parsed) {
    if (!it?.key) continue;
    const list0 = byKey.get(it.key) || [];
    list0.push(it);
    byKey.set(it.key, list0);
  }
  return { list: parsed, byKey };
};

export const matchCatalogImage = ({ model, color, angle }, catalog) => {
  const safeModel = model ? String(model).toUpperCase() : null;
  const safeColor = color ? String(color).toUpperCase() : null;
  const safeAngle = angle ? String(angle) : null;
  if (!safeModel || !safeColor) return { ok: false, reason: 'missing_model_or_color', match: null, conflicts: [] };
  const key = `${safeModel}_${safeColor}`;
  const candidates = (catalog?.byKey instanceof Map ? catalog.byKey.get(key) : null) || [];
  if (candidates.length === 0) return { ok: false, reason: 'no_candidates', match: null, conflicts: [] };

  if (safeAngle) {
    const angled = candidates.filter((c) => c && String(c.angle || '') === safeAngle);
    if (angled.length === 0) return { ok: false, reason: 'no_angle_match', match: null, conflicts: [] };
    if (angled.length === 1) return { ok: true, reason: null, match: angled[0], conflicts: [] };
    return { ok: false, reason: 'conflict', match: null, conflicts: angled };
  }

  if (candidates.length === 1) return { ok: true, reason: null, match: candidates[0], conflicts: [] };
  const uniqAngles = Array.from(new Set(candidates.map((c) => String(c?.angle || '')).filter(Boolean)));
  if (uniqAngles.length === 1) return { ok: true, reason: null, match: candidates[0], conflicts: [] };
  return { ok: false, reason: 'conflict', match: null, conflicts: candidates };
};

export const matchCatalogImageByAngleSource = ({ model, color, angleSource, catalog }) => {
  const angle = pickAngle(angleSource);
  const result = matchCatalogImage({ model, color, angle }, catalog);
  return { ...result, angle };
};
