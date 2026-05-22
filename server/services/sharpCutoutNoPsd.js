import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

function ensureDir(dirPath) {
  if (!dirPath) return;
  if (fs.existsSync(dirPath)) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeResizeMode(raw) {
  return String(raw || 'exact').toLowerCase() === 'exact' ? 'exact' : 'none';
}

async function buildAlphaMaskBuffer({ channelPath, width, height, resizeMode }) {
  const mode = normalizeResizeMode(resizeMode);
  const base = sharp(channelPath, { failOnError: false });
  const meta = await base.metadata();
  const hasAlpha = meta?.hasAlpha === true;
  let pipeline = sharp(channelPath, { failOnError: false });
  if (hasAlpha) {
    pipeline = pipeline.ensureAlpha().extractAlpha();
  } else {
    pipeline = pipeline.greyscale();
  }
  const needsResize = Number(meta?.width) !== Number(width) || Number(meta?.height) !== Number(height);
  if (needsResize) {
    pipeline = pipeline.resize(width, height, { fit: 'fill' });
  } else if (mode === 'exact') {
    pipeline = pipeline.resize(width, height, { fit: 'fill' });
  }
  const raw = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const ch = Number(raw?.info?.channels) || 1;
  if (ch === 1) return raw.data;
  const w = Number(raw?.info?.width) || width;
  const h = Number(raw?.info?.height) || height;
  const pixels = w * h;
  const out = Buffer.allocUnsafe(pixels);
  for (let i = 0; i < pixels; i += 1) {
    out[i] = raw.data[i * ch];
  }
  return out;
}

export async function cutoutNoPsdOneWithSharp(task) {
  const productPath = String(task?.productPath || '').trim();
  const channelPath = String(task?.channelPath || '').trim();
  const outputPath = String(task?.outputPath || '').trim();
  const resizeMode = normalizeResizeMode(task?.resizeMode);
  if (!productPath || !channelPath || !outputPath) {
    return { ok: false, errors: [{ message: '缺少 productPath/channelPath/outputPath' }] };
  }
  if (!fs.existsSync(productPath)) {
    return { ok: false, errors: [{ message: `product_not_found:${productPath}` }] };
  }
  if (!fs.existsSync(channelPath)) {
    return { ok: false, errors: [{ message: `channel_not_found:${channelPath}` }] };
  }

  let meta = null;
  try {
    meta = await sharp(productPath, { failOnError: false }).metadata();
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return { ok: false, errors: [{ message: `产品图无法解析：${msg}` }] };
  }

  const width = Math.max(1, Math.round(Number(meta?.width) || 0));
  const height = Math.max(1, Math.round(Number(meta?.height) || 0));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, errors: [{ message: '产品图尺寸读取失败' }] };
  }

  let alpha = null;
  try {
    alpha = await buildAlphaMaskBuffer({ channelPath, width, height, resizeMode });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    const lowered = msg.toLowerCase();
    if (lowered.includes('unsupported image format')) {
      return { ok: false, errors: [{ message: `通道图无法解析：图片格式无法解析（Sharp 不支持读取 TGA）` }] };
    }
    return { ok: false, errors: [{ message: `通道图无法解析：${msg}` }] };
  }

  try {
    ensureDir(path.dirname(outputPath));
    await sharp(productPath, { failOnError: false })
      .removeAlpha()
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .png()
      .toFile(outputPath);
    return { ok: true, errors: [] };
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return { ok: false, errors: [{ message: `抠图合成失败：${msg}` }] };
  }
}

export async function cutoutNoPsdBatchWithSharp(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const results = [];
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i] || {};
    const label = t?.label != null ? String(t.label) : String(i);
    const r = await cutoutNoPsdOneWithSharp(t);
    results.push({ label, ok: r.ok === true, outputPath: t?.outputPath || null, errors: Array.isArray(r.errors) ? r.errors : [] });
  }
  return results;
}
