const sanitizeZipPathSegment = (input) => {
  const s = typeof input === 'string' ? input : input == null ? '' : String(input);
  return s
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '');
};

export const detectPlatform = (psdName) => {
  const raw = typeof psdName === 'string' ? psdName : psdName == null ? '' : String(psdName);
  const name = raw.trim();
  const rules = [
    { key: 'vipshop', label: '唯品会', hit: (s) => s.includes('唯品会') },
    { key: 'jd', label: '京东', hit: (s) => s.includes('京东') },
    { key: 'tmall', label: '天猫', hit: (s) => s.includes('天猫') },
    { key: 'koala_xhs', label: '考拉+小红书', hit: (s) => s.includes('考拉') || s.includes('小红书') },
    { key: 'dewu', label: '得物', hit: (s) => s.includes('得物') },
  ];
  for (let i = 0; i < rules.length; i += 1) {
    const r = rules[i];
    if (r.hit(name)) return { platformKey: r.key, platformLabel: r.label };
  }
  return { platformKey: 'unknown', platformLabel: '未识别平台' };
};

export const parseModelColorKey = (imgName) => {
  const raw = typeof imgName === 'string' ? imgName : imgName == null ? '' : String(imgName);
  const base = raw.replace(/\.[^/.]+$/g, '');
  const modelMatch = /([A-Za-z]{1,6}\d{3,14})/.exec(base);
  const model = modelMatch ? String(modelMatch[1] || '').trim() : '';
  if (!model) return '未识别型号';

  const tail = base.slice((modelMatch.index || 0) + model.length);
  const colorMatch = /([A-Za-z]\d{1,4})/.exec(tail);
  const color = colorMatch ? String(colorMatch[1] || '').trim() : '';
  return color ? `${model} ${color}` : model;
};

export const parseAngle = (imgName) => {
  const raw = typeof imgName === 'string' ? imgName : imgName == null ? '' : String(imgName);
  const str = raw.toLowerCase();
  if (!str) return '';
  if (str.includes('45') || str.includes('45度') || str.includes('45°')) return '45';
  if (str.includes('90') || str.includes('90度') || str.includes('90°')) return '侧';
  if (str.includes('侧') || str.includes('side')) return '侧';
  if (str.includes('正') || str.includes('front')) return '正';
  return '';
};

const normalizeFormat = (fmt) => {
  const f = typeof fmt === 'string' ? fmt : fmt == null ? '' : String(fmt);
  const lower = f.trim().toLowerCase();
  if (!lower) return '';
  if (lower === 'jpg') return 'jpeg';
  return lower;
};

const detectVipshopTemplateKind = (psdName) => {
  const raw = typeof psdName === 'string' ? psdName : psdName == null ? '' : String(psdName);
  const s = raw.replace(/\.psd$/i, '');
  if (/唯品会\s*1\s*[-_ ]?\s*3/.test(s)) return '1-3';
  if (/唯品会\s*30/.test(s)) return '30';
  if (/唯品会\s*50/.test(s)) return '50';
  return '';
};

export const buildZipEntry = ({ psdName, imgName, resultFormat, defaultFileName }) => {
  const { platformKey, platformLabel } = detectPlatform(psdName);
  const fmt = normalizeFormat(resultFormat);
  const fileName = sanitizeZipPathSegment(defaultFileName || '导出文件');
  const safePlatform = sanitizeZipPathSegment(platformLabel || '未识别平台');

  if (fmt === 'psd' || fmt === 'psb') {
    return { relativePath: `${fileName}`, skip: false };
  }

  if (platformKey === 'jd' || platformKey === 'tmall') {
    if (fmt === 'png') {
      if (platformKey === 'tmall') {
        const angle = parseAngle(imgName);
        if (angle !== '45') return { relativePath: '', skip: true };
      }
      return { relativePath: `${safePlatform}/PNG产品图/${fileName}`, skip: false };
    }
    if (platformKey === 'tmall') {
      const psdRaw = typeof psdName === 'string' ? psdName : psdName == null ? '' : String(psdName);
      if (psdRaw.includes('白底800')) {
        const angle = parseAngle(imgName);
        if (angle !== '45') return { relativePath: '', skip: true };
        return { relativePath: `${safePlatform}/白底800/${fileName}`, skip: false };
      }
    }
    const psdRaw = typeof psdName === 'string' ? psdName : psdName == null ? '' : String(psdName);
    const sub = /pc/i.test(psdRaw) ? 'PC' : /app/i.test(psdRaw) ? 'App' : '其他';
    if (sub === '其他') return { relativePath: '', skip: true };
    return { relativePath: `${safePlatform}/${sub}/${fileName}`, skip: false };
  }

  if (platformKey === 'koala_xhs') {
    const key = sanitizeZipPathSegment(parseModelColorKey(imgName));
    if (fmt === 'png') return { relativePath: `${safePlatform}/PNG/${key}/${fileName}`, skip: false };
    if (fmt === 'jpeg') return { relativePath: `${safePlatform}/JPG/${key}/${fileName}`, skip: false };
    return { relativePath: `${safePlatform}/其他/${fileName}`, skip: false };
  }

  if (platformKey === 'vipshop') {
    const key = sanitizeZipPathSegment(parseModelColorKey(imgName));
    const byModelFolder = `${safePlatform}/${key}/${fileName}`;
    const kind = detectVipshopTemplateKind(psdName);
    const angle = parseAngle(imgName);
    if (fmt === 'png') {
      if (kind === '30') {
        if (angle !== '45') return { relativePath: '', skip: true };
        return { relativePath: `${safePlatform}/${key}/30.PNG`, skip: false };
      }
      return { relativePath: byModelFolder, skip: false };
    }
    if (fmt === 'jpeg') {
      if (kind === '1-3') {
        const mapped = angle === '45' ? '1.jpg' : angle === '正' ? '2.jpg' : angle === '侧' ? '3.jpg' : '';
        if (!mapped) return { relativePath: '', skip: true };
        return { relativePath: `${safePlatform}/${key}/${mapped}`, skip: false };
      }
      if (kind === '30') {
        if (angle !== '45') return { relativePath: '', skip: true };
        return { relativePath: `${safePlatform}/${key}/30.jpg`, skip: false };
      }
      if (kind === '50') {
        if (angle !== '45') return { relativePath: '', skip: true };
        return { relativePath: `${safePlatform}/${key}/50.jpg`, skip: false };
      }
      return { relativePath: byModelFolder, skip: false };
    }
    return { relativePath: byModelFolder, skip: false };
  }

  if (platformKey === 'dewu') {
    if (fmt === 'png') return { relativePath: `${safePlatform}/${fileName}`, skip: false };
    if (fmt === 'jpeg') return { relativePath: `${safePlatform}/${fileName}`, skip: false };
    return { relativePath: `${safePlatform}/${fileName}`, skip: false };
  }

  return { relativePath: `${safePlatform}/${fileName}`, skip: false };
};
