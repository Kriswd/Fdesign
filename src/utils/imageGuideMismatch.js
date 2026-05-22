export function findDuplicateImageGuideMismatches(items) {
  const list = Array.isArray(items) ? items : [];
  const byImageKey = new Map();

  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i];
    if (!raw || typeof raw !== 'object') continue;
    const imageKey = raw.imageKey != null ? String(raw.imageKey).trim() : '';
    if (!imageKey) continue;
    const guideKey = raw.guideKey != null ? String(raw.guideKey) : 'none';
    const entry = byImageKey.get(imageKey) || { imageKey, guideKeySet: new Set(), items: [] };
    entry.guideKeySet.add(guideKey);
    entry.items.push(raw);
    byImageKey.set(imageKey, entry);
  }

  const out = [];
  byImageKey.forEach((entry) => {
    if (entry.guideKeySet.size <= 1) return;
    out.push({ imageKey: entry.imageKey, items: entry.items });
  });
  return out;
}
