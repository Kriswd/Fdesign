import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { isSafeTemplateId } from '../services/slotConfigService.js';

const TEMPLATE_THUMBNAIL_NAME = 'preview-card.webp';

function ensureDir(p) {
  if (!p) return;
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJson(fp) {
  const raw = fs.readFileSync(fp, 'utf8');
  return JSON.parse(raw);
}

function writeJson(fp, data) {
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

function copyFileIfExists(src, dst) {
  if (!fs.existsSync(src)) return false;
  const st = fs.statSync(src);
  if (!st.isFile()) return false;
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return true;
}

function copyDirIfExists(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return false;
  const st = fs.statSync(srcDir);
  if (!st.isDirectory()) return false;
  ensureDir(dstDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent) continue;
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) copyDirIfExists(src, dst);
    else if (ent.isFile()) copyFileIfExists(src, dst);
  }
  return true;
}

function buildPreviewUrl(templateId, templateDir) {
  const refPath = path.join(templateDir, 'reference.png');
  const bgPath = path.join(templateDir, 'backdrop.png');
  if (fs.existsSync(refPath)) return `/templates/${templateId}/reference.png`;
  if (fs.existsSync(bgPath)) return `/templates/${templateId}/backdrop.png`;
  const imagesDir = path.join(templateDir, 'images');
  if (!fs.existsSync(imagesDir)) return null;
  const files = fs.readdirSync(imagesDir).filter((name) => {
    const lower = String(name || '').toLowerCase();
    return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp');
  });
  if (files.length === 0) return null;
  const preferred = files.find((name) => /^reference(\.|_)/i.test(name));
  const chosen = preferred || files.sort()[0];
  return `/templates/${templateId}/images/${chosen}`;
}

function pickNewTemplateId(templatesDir) {
  for (let i = 0; i < 50; i += 1) {
    const id = crypto.randomBytes(8).toString('hex');
    const dir = path.join(templatesDir, id);
    if (!fs.existsSync(dir)) return id;
  }
  throw new Error('生成 templateId 失败，请稍后重试');
}

export async function duplicateTemplateOnDisk({ outputRoot, templateId, name, nowIso } = {}) {
  const root = String(outputRoot || '').trim();
  if (!root) throw new Error('缺少 outputRoot');
  const srcId = String(templateId || '').trim();
  if (!isSafeTemplateId(srcId)) throw new Error('无效的 templateId');
  const nextName = String(name || '').trim();
  if (!nextName) throw new Error('新模版名称不能为空');

  const templatesDir = path.join(root, 'templates');
  const srcDir = path.join(templatesDir, srcId);
  const srcManifestPath = path.join(srcDir, 'manifest.json');
  const srcPsdPath = path.join(srcDir, 'source.psd');
  if (!fs.existsSync(srcManifestPath) || !fs.existsSync(srcPsdPath)) {
    const e = new Error('模版不存在');
    e.code = 'TEMPLATE_NOT_FOUND';
    throw e;
  }

  const newId = pickNewTemplateId(templatesDir);
  const dstDir = path.join(templatesDir, newId);
  ensureDir(dstDir);

  copyFileIfExists(srcPsdPath, path.join(dstDir, 'source.psd'));
  copyFileIfExists(srcManifestPath, path.join(dstDir, 'manifest.json'));
  copyFileIfExists(path.join(srcDir, 'slot-config.json'), path.join(dstDir, 'slot-config.json'));
  copyFileIfExists(path.join(srcDir, 'reference.png'), path.join(dstDir, 'reference.png'));
  copyFileIfExists(path.join(srcDir, 'backdrop.png'), path.join(dstDir, 'backdrop.png'));
  copyFileIfExists(path.join(srcDir, TEMPLATE_THUMBNAIL_NAME), path.join(dstDir, TEMPLATE_THUMBNAIL_NAME));
  copyDirIfExists(path.join(srcDir, 'images'), path.join(dstDir, 'images'));

  const savedAt = String(nowIso || new Date().toISOString());
  const manifest = readJson(path.join(dstDir, 'manifest.json'));
  writeJson(path.join(dstDir, 'manifest.json'), { ...(manifest || {}), name: nextName, isUserSaved: true, savedAt });

  const slotPath = path.join(dstDir, 'slot-config.json');
  if (fs.existsSync(slotPath)) {
    const slot = readJson(slotPath);
    const slotsBefore = Array.isArray(slot.slots) ? slot.slots : [];
    console.info('[debug][duplicate] src slot-config summary', {
      srcId,
      newId,
      slotCount: slotsBefore.length,
      slots: slotsBefore.map((s) => ({ psId: s.psId, fieldKey: s.fieldKey, variableCount: Array.isArray(s.variables) ? s.variables.length : 0 })),
    });
    writeJson(slotPath, { ...(slot || {}), templateId: newId });
    console.info('[debug][duplicate] dst slot-config written', { newId, templateIdField: newId });
  } else {
    console.info('[debug][duplicate] no slot-config.json in src, skipping', { srcId, newId });
  }

  const previewUrl = buildPreviewUrl(newId, dstDir);
  const thumbnailUrl = fs.existsSync(path.join(dstDir, TEMPLATE_THUMBNAIL_NAME))
    ? `/templates/${newId}/${TEMPLATE_THUMBNAIL_NAME}`
    : null;

  return { success: true, templateId: newId, name: nextName, savedAt, previewUrl, thumbnailUrl };
}

