function uniqPreserveOrder(list) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const v = String(list[i] || '');
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pickImageIdsForTemplate({ taskTemplateUnionPsIds, taskTemplateImageGroups }) {
  const psIds = Array.isArray(taskTemplateUnionPsIds) ? taskTemplateUnionPsIds : [];
  const groups = Array.isArray(taskTemplateImageGroups) ? taskTemplateImageGroups : [];
  const ordered = [];
  for (let gi = 0; gi < groups.length; gi += 1) {
    const g = groups[gi] || {};
    const assignments = g.assignments && typeof g.assignments === 'object' ? g.assignments : {};
    for (let pi = 0; pi < psIds.length; pi += 1) {
      const psId = psIds[pi];
      const imgId = assignments[String(psId)];
      if (imgId) ordered.push(String(imgId));
    }
  }
  return uniqPreserveOrder(ordered);
}

export function buildCutoutNoPsdRequest({
  taskMode,
  productImages,
  channelMasks,
  taskTemplateUnionPsIds,
  taskTemplateImageGroups,
  resizeMode = 'exact',
} = {}) {
  const mode = String(taskMode || '').toLowerCase();
  const imgs = Array.isArray(productImages) ? productImages : [];
  const masks = Array.isArray(channelMasks) ? channelMasks : [];

  const channels = masks.map((m) => {
    const storedName = String(m?.storedName || '').trim();
    const sourceName = String(m?.name || m?.originalName || storedName).trim();
    if (!storedName) throw new Error('通道图未上传或缺少 storedName');
    return { storedName, sourceName };
  });
  if (channels.length === 0) throw new Error('缺少通道图');

  const byId = new Map();
  imgs.forEach((img) => {
    const id = String(img?.id || '').trim();
    if (!id) return;
    byId.set(id, img);
  });

  let pickedIds = [];
  if (mode === 'template') {
    const union = Array.isArray(taskTemplateUnionPsIds) ? taskTemplateUnionPsIds : [];
    if (union.length <= 1) {
      pickedIds = imgs.map((i) => String(i?.id || '')).filter(Boolean);
    } else {
      pickedIds = pickImageIdsForTemplate({ taskTemplateUnionPsIds: union, taskTemplateImageGroups });
    }
  } else {
    pickedIds = imgs.map((i) => String(i?.id || '')).filter(Boolean);
  }

  const images = pickedIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((img) => {
      const imagePath = String(img?.serverImagePath || img?.imagePath || '').trim();
      const sourceName = String(img?.name || img?.originalName || img?.storedName || id).trim();
      if (!imagePath) throw new Error('产品图未上传或缺少 serverImagePath');
      return { imagePath, sourceName };
    });

  if (images.length === 0) throw new Error('缺少产品图');

  return {
    images,
    channels,
    resizeMode: String(resizeMode || 'exact').toLowerCase() === 'exact' ? 'exact' : 'none',
  };
}

