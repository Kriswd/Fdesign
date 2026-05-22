export const CHANNEL_MATCH_BUILD = 'channelMatch_20260310_4';

function normalizeName(raw) {
  const s0 = String(raw || '');
  if (!s0) return '';
  return s0
    .replace(/\.[^/.]+$/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/[\uFF3F]+/g, '_')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

function stripAngleTokens(raw) {
  return String(raw || '')
    .replace(/90(?:度|°)?(?=[^0-9a-zA-Z]|$)/gi, ' ')
    .replace(/45(?:度|°)?(?=[^0-9a-zA-Z]|$)/gi, ' ')
    .replace(/(?:正|侧)(?=[^0-9a-zA-Z]|$)/g, ' ')
    .replace(/\b(?:front|side)\b/gi, ' ');
}

function parseStyleColor(raw) {
  const norm = normalizeName(raw).toUpperCase();
  if (!norm) return { style: null, color: null };
  const base = stripAngleTokens(norm);
  const styleMatch = /([A-Z]{1,4}\d{3,7})/.exec(base);
  const style = styleMatch ? String(styleMatch[1]) : null;
  let color = null;
  if (style) {
    const tail = base.slice(base.indexOf(style) + style.length);
    const colorMatch = /(?:^|[_\s])([A-Z]{1,2}\d{1,3})(?:$|[_\s])/.exec(` ${tail} `);
    if (colorMatch) color = String(colorMatch[1]);
  }
  if (!color) {
    const colorOnly = /(?:^|[_\s])([A-Z]{1,2}\d{1,3})(?:$|[_\s])/.exec(` ${base} `);
    if (colorOnly) color = String(colorOnly[1]);
  }
  if (color && (color === '45' || color === '90')) color = null;
  return { style, color };
}

function identityKey({ style, color, model }) {
  const s = style ? String(style).toUpperCase() : '';
  const c = color ? String(color).toUpperCase() : '';
  if (s && c) return `${s}_${c}`;
  if (s) return s;
  const m = model ? String(model).toUpperCase() : '';
  return m || null;
}

export function pickAngle(name) {
  const s = String(name || '').toLowerCase();
  if (!s) return null;
  if (s.includes('侧') || /\bside\b/.test(s)) return '侧';
  if (s.includes('正') || /\bfront\b/.test(s)) return '正';

  if (s.includes('45度') || s.includes('45°') || /(?:^|[^0-9a-z])45(?:$|[^0-9a-z])/.test(s)) return '45';
  if (s.includes('90度') || s.includes('90°') || /(?:^|[^0-9a-z])90(?:$|[^0-9a-z])/.test(s)) return '侧';
  return null;
}

export function pickModel(name) {
  const norm = normalizeName(name).toUpperCase();
  if (!norm) return null;
  const base = stripAngleTokens(norm);
  const m = /([A-Z]{1,4}\d{3,7}(?:[A-Z]{1,2}\d{1,3})?)/.exec(base);
  return m ? String(m[1]) : null;
}

export function matchChannel(sourceName, channels, hints) {
  const hintObj = hints && typeof hints === 'object' ? hints : null;
  const hintAngle = hintObj?.angleHint != null ? pickAngle(hintObj.angleHint) : null;
  const hintModel = hintObj?.modelHint != null ? pickModel(hintObj.modelHint) : null;
  const angle = hintAngle || pickAngle(sourceName);
  const model = hintModel || pickModel(sourceName);
  const candidates = Array.isArray(channels) ? channels : [];
  if (!angle) return null;

  const srcSc = parseStyleColor(sourceName);
  const srcKey = identityKey({ ...srcSc, model });
  const srcStyle = srcSc.style ? String(srcSc.style).toUpperCase() : null;

  const parsedCandidates = candidates
    .map((c) => {
      if (!c) return null;
      const sc = parseStyleColor(c.sourceName || c.storedName || '');
      const key = identityKey({ ...sc, model: c.model || c.baseModel || null });
      return { c, angle: c.angle, isGeneric: c.isGeneric === true, key, style: sc.style ? String(sc.style).toUpperCase() : null };
    })
    .filter(Boolean);

  if (srcKey) {
    const exact = parsedCandidates.find((x) => x.angle === angle && x.key === srcKey);
    if (exact) return exact.c;
  }
  if (srcStyle) {
    const byStyle = parsedCandidates.find((x) => x.angle === angle && x.style === srcStyle);
    if (byStyle) return byStyle.c;
  }
  const generic = candidates.find((c) => c && c.angle === angle && c.isGeneric);
  if (generic) return generic;
  return candidates.find((c) => c && c.angle === angle) || null;
}

export function explainChannelMatch(sourceName, channels, hints) {
  const hintObj = hints && typeof hints === 'object' ? hints : null;
  const hintAngle = hintObj?.angleHint != null ? pickAngle(hintObj.angleHint) : null;
  const hintModel = hintObj?.modelHint != null ? pickModel(hintObj.modelHint) : null;
  const angle = hintAngle || pickAngle(sourceName);
  const model = hintModel || pickModel(sourceName);
  const sc = parseStyleColor(sourceName);
  const key = identityKey({ ...sc, model });
  const candidates = Array.isArray(channels) ? channels : [];
  const preview = candidates
    .map((c) => {
      if (!c) return null;
      const csc = parseStyleColor(c.sourceName || c.storedName || '');
      return {
        sourceName: c.sourceName || null,
        storedName: c.storedName || null,
        angle: c.angle || null,
        style: csc.style || null,
        color: csc.color || null,
        key: identityKey({ ...csc, model: c.model || c.baseModel || null }),
      };
    })
    .filter(Boolean)
    .slice(0, 30);
  const match = matchChannel(sourceName, channels, hints);
  return { match, extracted: { angle, model, style: sc.style, color: sc.color, key }, candidates: preview, build: CHANNEL_MATCH_BUILD };
}
