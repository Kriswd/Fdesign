import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as agPsd from 'ag-psd';
import sharp from 'sharp';
import { buildArtboardRenameMap, extractTemplateMeta } from '../utils/templateMeta.js';
import SharpImageProcessor from './sharpProcessor.js';
import { composeCutoutToCanvasPng } from './composeCutout.js';
import { CHANNEL_MATCH_BUILD, matchChannel, pickAngle, pickModel } from '../utils/channelMatch.js';
import {
  buildOutputLookupCandidates,
  buildTemplateFileUrl,
  isPathInsideDir,
  pickFirstExistingPath,
  waitForFirstExistingPath,
} from './exportResultResolver.js';

const execFileAsync = promisify(execFile);
const { readPsd, initializeCanvas } = agPsd;
const imageProcessor = new SharpImageProcessor();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (typeof document === 'undefined') {
  initializeCanvas((width, height) => ({
    width,
    height,
    getContext: () => ({
      fillRect: () => {},
      drawImage: () => {},
      getImageData: (_sx, _sy, w, h) => ({
        width: Number(w) || 0,
        height: Number(h) || 0,
        data: new Uint8ClampedArray((Number(w) || 0) * (Number(h) || 0) * 4),
      }),
      putImageData: () => {},
      createImageData: (w, h) => ({
        width: Number(w) || 0,
        height: Number(h) || 0,
        data: new Uint8ClampedArray((Number(w) || 0) * (Number(h) || 0) * 4),
      }),
    }),
  }));
}

function safeMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pushTempFile(list, fp) {
  if (!Array.isArray(list)) return;
  if (!fp) return;
  const s = String(fp);
  if (!s) return;
  list.push(s);
}

function cleanupTempFilesInDir({ templateId, dir, files, keepTempFiles }) {
  if (keepTempFiles) return { skipped: true, deleted: 0, failed: 0, total: 0 };
  const base = String(dir || '').trim();
  const list = Array.isArray(files) ? files : [];
  if (!base || list.length === 0) return { skipped: false, deleted: 0, failed: 0, total: 0 };

  const uniq = Array.from(new Set(list.map((p) => (p == null ? '' : String(p))).filter(Boolean)));
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < uniq.length; i += 1) {
    const fp = uniq[i];
    try {
      if (!isPathInsideDir(base, fp)) continue;
      if (!fs.existsSync(fp)) continue;
      const st = fs.statSync(fp);
      if (st.isFile()) {
        fs.unlinkSync(fp);
        deleted += 1;
      } else if (st.isDirectory()) {
        fs.rmSync(fp, { recursive: true, force: true });
        deleted += 1;
      }
    } catch {
      failed += 1;
    }
  }
  if (deleted > 0 || failed > 0) {
    console.info('[清理] 导出临时文件清理结果', { templateId: templateId || null, dir: base, total: uniq.length, deleted, failed });
  }
  return { skipped: false, deleted, failed, total: uniq.length };
}

function fileExistsNonEmpty(fp, minBytes = 1024) {
  try {
    if (!fp) return false;
    if (!fs.existsSync(fp)) return false;
    const stat = fs.statSync(fp);
    return stat.isFile() && Number(stat.size) >= Number(minBytes);
  } catch {
    return false;
  }
}

function toBufferView(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

async function renderReferencePngFromSharp({ buffer, outputPngPath }) {
  const input = Buffer.from(buffer);
  const meta = await sharp(input, { failOnError: false }).metadata();
  const w = Number(meta?.width);
  const h = Number(meta?.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error('sharp 未返回有效的预览图尺寸');
  }
  const expected = w * h * 4;
  if (!Number.isFinite(expected) || expected <= 0) {
    throw new Error('sharp 预览图像素数据长度异常');
  }
  if (expected > 260 * 1024 * 1024) {
    throw new Error('合成预览过大，已拒绝生成');
  }
  await sharp(input, { failOnError: false })
    .png({ compressionLevel: 9 })
    .toFile(outputPngPath);
}

async function renderReferencePngFromAgPsd({ buffer, outputPngPath }) {
  const psd = readPsd(Buffer.from(buffer), {
    skipThumbnail: true,
    skipCompositeImageData: false,
    skipLayerImageData: true,
    useImageData: true,
    useCanvas: false,
    logMissingFeatures: false,
  });
  const img = psd && psd.imageData ? psd.imageData : null;
  const w = img ? Number(img.width) : NaN;
  const h = img ? Number(img.height) : NaN;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error('ag-psd 未返回有效的合成图尺寸');
  }
  const expected = w * h * 4;
  if (!Number.isFinite(expected) || expected <= 0) {
    throw new Error('ag-psd 合成图像素数据长度异常');
  }
  if (expected > 260 * 1024 * 1024) {
    throw new Error('合成预览过大，已拒绝生成');
  }
  const buf = toBufferView(img.data);
  if (!buf || buf.length < expected) {
    throw new Error('ag-psd 合成图像素数据缺失');
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outputPngPath);
}

async function renderReferencePngFallback({ buffer, outputPngPath }) {
  try {
    await renderReferencePngFromSharp({ buffer, outputPngPath });
    return { ok: true, source: 'sharp' };
  } catch {
    await renderReferencePngFromAgPsd({ buffer, outputPngPath });
    return { ok: true, source: 'agpsd' };
  }
}

/**
 * 校验模板ID（防止路径穿越）
 * @param {string} templateId - 模板ID
 * @returns {boolean}
 */
function isSafeTemplateId(templateId) {
  return typeof templateId === 'string' && /^[0-9a-f]{16}$/i.test(templateId);
}

/**
 * 解析 data: URL 为 Buffer
 * @param {string} dataUrl - data URL
 * @returns {{mime: string, buffer: Buffer}|null}
 */
function parseDataUrl(dataUrl) {
  const s = String(dataUrl || '');
  const m = /^data:([^;]+);base64,(.*)$/i.exec(s);
  if (!m) return null;
  try {
    const mime = m[1] || 'application/octet-stream';
    const buffer = Buffer.from(m[2], 'base64');
    return { mime, buffer };
  } catch {
    return null;
  }
}

function isRemoteHttpUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateIpAddress(ip) {
  const addr = String(ip || '').trim();
  if (!addr) return true;
  const family = net.isIP(addr);
  if (!family) return true;
  if (family === 4) {
    const parts = addr.split('.').map((n) => Number(n));
    if (parts.length !== 4) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a >= 224) return true;
    return false;
  }
  const v = addr.toLowerCase();
  if (v === '::1') return true;
  if (v.startsWith('fe80:')) return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  return false;
}

async function assertPublicUrlHost(urlObj) {
  const host = String(urlObj?.hostname || '').trim();
  if (!host) throw new Error('图片地址缺少 hostname');
  const lowered = host.toLowerCase();
  if (lowered === 'localhost') throw new Error('不允许使用 localhost 图片地址');
  if (isPrivateIpAddress(host)) throw new Error('不允许使用内网 IP 图片地址');
  const list = await dns.promises.lookup(host, { all: true, verbatim: true });
  if (!Array.isArray(list) || list.length === 0) throw new Error('图片地址解析失败');
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const addr = item && item.address ? String(item.address) : '';
    if (isPrivateIpAddress(addr)) {
      throw new Error('不允许使用内网地址图片');
    }
  }
}

async function readResponseBodyWithLimit(body, maxBytes) {
  const limit = Number(maxBytes);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('maxBytes 无效');
  if (!body) throw new Error('图片响应体为空');

  const reader = typeof body.getReader === 'function' ? body.getReader() : null;
  if (reader) {
    const chunks = [];
    let total = 0;
    while (true) {
      const res = await reader.read();
      if (!res || res.done) break;
      const chunk = res.value;
      if (!chunk) continue;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > limit) throw new Error('远程图片过大，已拒绝下载');
      chunks.push(buf);
    }
    return Buffer.concat(chunks, total);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) throw new Error('远程图片过大，已拒绝下载');
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total);
}

function extHintFromUrlOrMime({ urlObj, contentType }) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('image/jpeg')) return 'jpg';
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/webp')) return 'webp';
  const p = urlObj && urlObj.pathname ? String(urlObj.pathname) : '';
  const ext = p ? path.extname(p).replace('.', '').toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'png';
}

async function fetchRemoteImageBuffer(urlStr, { maxBytes, timeoutMs, maxRedirects }, cache) {
  if (typeof fetch !== 'function') throw new Error('当前运行环境不支持下载远程图片');
  const limit = Number.isFinite(Number(maxBytes)) ? Math.trunc(Number(maxBytes)) : 30 * 1024 * 1024;
  const timeout = Number.isFinite(Number(timeoutMs)) ? Math.trunc(Number(timeoutMs)) : 10 * 1000;
  const redirects = Number.isFinite(Number(maxRedirects)) ? Math.trunc(Number(maxRedirects)) : 3;

  let current = String(urlStr || '').trim();
  if (!current) throw new Error('图片地址为空');

  for (let i = 0; i <= redirects; i += 1) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('图片地址协议不支持');
    await assertPublicUrlHost(u);

    const cacheKey = `url:${u.toString()}`;
    if (cache instanceof Map && cache.has(cacheKey)) {
      return { buffer: cache.get(cacheKey), urlObj: u, contentType: null };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let resp;
    try {
      resp = await fetch(u.toString(), { method: 'GET', redirect: 'manual', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }

    const location = resp && (resp.status === 301 || resp.status === 302 || resp.status === 303 || resp.status === 307 || resp.status === 308)
      ? resp.headers.get('location')
      : null;
    if (location) {
      current = new URL(location, u).toString();
      continue;
    }

    if (!resp || !resp.ok) {
      const status = resp ? resp.status : 0;
      throw new Error(`远程图片下载失败（HTTP ${status}）`);
    }

    const lenHeader = resp.headers.get('content-length');
    const contentLength = lenHeader ? Number(lenHeader) : NaN;
    if (Number.isFinite(contentLength) && contentLength > limit) {
      throw new Error('远程图片过大，已拒绝下载');
    }

    const contentType = resp.headers.get('content-type');
    const buffer = await readResponseBodyWithLimit(resp.body, limit);
    if (cache instanceof Map) cache.set(cacheKey, buffer);
    return { buffer, urlObj: u, contentType };
  }

  throw new Error('远程图片重定向次数过多');
}

function parseJsonSafely(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    let sanitized = '';
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code >= 32 && code !== 127) {
        sanitized += text[i];
      }
    }
    if (sanitized !== text) {
      try {
        return JSON.parse(sanitized);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return Math.max(min, Math.min(max, v));
}

const residentRuntime = {
  enabled: !['0', 'false', 'off'].includes(String(process.env.PS_RESIDENT_MODE || '1').toLowerCase()),
  idleExitMs: clampInt(process.env.PS_RESIDENT_IDLE_EXIT_MS, 5 * 60 * 1000, 30 * 1000, 60 * 60 * 1000),
  outputRoot: null,
  dir: null,
  vbsPath: null,
  quitJsxPath: null,
  idleTimer: null,
  idleQuitRunning: false,
};

const queueConfig = {
  concurrency: residentRuntime.enabled ? 1 : clampInt(process.env.PS_EXPORT_CONCURRENCY, 1, 1, 3),
  maxRetries: clampInt(process.env.PS_EXPORT_MAX_RETRIES, 0, 0, 5),
  baseDelayMs: clampInt(process.env.PS_EXPORT_RETRY_BASE_MS, 1200, 200, 10000),
  maxDelayMs: clampInt(process.env.PS_EXPORT_RETRY_MAX_MS, 12000, 1000, 30000),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createQueue(concurrency) {
  const pending = [];
  let active = 0;
  const runNext = () => {
    if (active >= concurrency) return;
    const item = pending.shift();
    if (!item) return;
    active += 1;
    Promise.resolve()
      .then(item.fn)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  };
  return {
    enqueue(fn) {
      return new Promise((resolve, reject) => {
        pending.push({ fn, resolve, reject });
        runNext();
      });
    },
    getStatus() {
      return { active, pending: pending.length, concurrency };
    },
  };
}

const photoshopQueue = createQueue(queueConfig.concurrency);

function tryGetFileFingerprint(filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) return { exists: false, filePath };
    const stat = fs.statSync(filePath);
    const buf = fs.readFileSync(filePath);
    const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
    return {
      exists: true,
      filePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha1,
      sha1Short: sha1.slice(0, 12),
    };
  } catch (e) {
    return { exists: null, filePath, error: e?.message ? String(e.message) : String(e) };
  }
}

function tryDecodeTextBuffer(buf) {
  if (!buf || !buf.length) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  try {
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le');
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
      const swapped = Buffer.allocUnsafe(b.length - 2);
      for (let i = 2; i + 1 < b.length; i += 2) {
        swapped[i - 2] = b[i + 1];
        swapped[i - 1] = b[i];
      }
      return swapped.toString('utf16le');
    }
  } catch (eDecodeBom) {
    void eDecodeBom;
  }

  try {
    const utf16leText = b.toString('utf16le');
    const nulCount = utf16leText.length > 0 ? utf16leText.split('\u0000').length - 1 : 0;
    const nulRatio = utf16leText.length > 0 ? nulCount / utf16leText.length : 1;
    if (nulRatio < 0.15) return utf16leText;
  } catch (eDecodeHeuristic) {
    void eDecodeHeuristic;
  }

  try {
    return b.toString('utf8');
  } catch {
    return null;
  }
}

function readTextFileSafe(filePath, maxBytes) {
  const fp = filePath ? String(filePath) : '';
  const limit = Number.isFinite(Number(maxBytes)) ? Math.max(0, Math.floor(Number(maxBytes))) : 0;
  if (!fp || limit <= 0) return null;
  try {
    if (!fs.existsSync(fp)) return null;
    const buf = fs.readFileSync(fp);
    const sliced = buf.length > limit ? buf.subarray(0, limit) : buf;
    return tryDecodeTextBuffer(sliced);
  } catch {
    return null;
  }
}

function parseSimpleKeyValueLog(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s) return null;
  const lines = s.split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '');
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function pickFirstLineValue(text, prefix) {
  const s = typeof text === 'string' ? text : '';
  const p = String(prefix || '');
  if (!s || !p) return null;
  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '');
    if (!line) continue;
    if (line.startsWith(p)) return line.slice(p.length).trim();
  }
  return null;
}

function readJsxScriptBuild(jsxPath) {
  const fp = jsxPath ? String(jsxPath) : '';
  if (!fp) return null;
  try {
    if (!fs.existsSync(fp)) return null;
    const text = fs.readFileSync(fp, 'utf8');
    if (!text) return null;
    const m = text.match(/var\s+SCRIPT_BUILD\s*=\s*"([^"]+)"/);
    if (!m || !m[1]) return null;
    return String(m[1]).trim() || null;
  } catch {
    return null;
  }
}

function assertScriptBuildMatch({ phase, templateId, jsxPath, expectedScriptBuild, actualScriptBuild, jobPath, resultPath }) {
  const expected = expectedScriptBuild != null ? String(expectedScriptBuild).trim() : '';
  const actual = actualScriptBuild != null ? String(actualScriptBuild).trim() : '';
  if (!expected || !actual || expected === actual) return;
  const mismatch = {
    phase: phase || 'export',
    templateId: templateId || null,
    jsxPath: jsxPath || null,
    expectedScriptBuild: expected,
    actualScriptBuild: actual,
    jobPath: jobPath || null,
    resultPath: resultPath || null,
  };
  console.error('[导出调试] JSX 脚本版本不一致', mismatch);
  const err = new Error(
    `Photoshop JSX 版本不一致：期望=${expected}，实际=${actual}。请确认当前服务使用的 render_export.jsx 与部署包一致后重试。`,
  );
  err.code = 'SCRIPT_BUILD_MISMATCH';
  err.phase = phase || 'export';
  err.templateId = templateId || null;
  err.jsxPath = jsxPath || null;
  err.expectedScriptBuild = expected;
  err.actualScriptBuild = actual;
  err.jobPath = jobPath || null;
  err.resultPath = resultPath || null;
  throw err;
}

function pickFirstExistingFile(paths) {
  const list = Array.isArray(paths) ? paths : [];
  for (let i = 0; i < list.length; i += 1) {
    const fp = list[i] ? String(list[i]) : '';
    if (!fp) continue;
    try {
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return fp;
    } catch {
      continue;
    }
  }
  return null;
}

function readJobResultPath(jobPath) {
  const fp = jobPath ? String(jobPath) : '';
  if (!fp) return null;
  try {
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed?.resultPath != null ? String(parsed.resultPath) : null;
  } catch {
    return null;
  }
}

function detectSilentNoopAfterPhotoshopRun({
  fs: fsLike = fs,
  resultPath,
  jsxLogPath,
  jsxBatchLogPath,
  fatalLogPath,
}) {
  return !pickFirstExistingPath({
    fs: fsLike,
    candidates: [resultPath, jsxLogPath, jsxBatchLogPath, fatalLogPath],
  });
}

function buildPreparedRunJsxSource({ sourceText, jobPath }) {
  const src = sourceText != null ? String(sourceText) : '';
  const jp = jobPath != null ? String(jobPath) : '';
  if (!src || !jp) return src;
  const injectedLine = `var __FDESIGN_JOB_PATH = ${JSON.stringify(jp)};`;
  const hasBom = src.charCodeAt(0) === 0xfeff;
  const body = hasBom ? src.slice(1) : src;
  const targetMatch = body.match(/^(#target\s+[^\r\n]+)(\r?\n)?/i);
  if (targetMatch) {
    const prefix = hasBom ? '\uFEFF' : '';
    const rest = body.slice(targetMatch[0].length);
    return `${prefix}${targetMatch[1]}\n${injectedLine}\n${rest}`;
  }
  return `${injectedLine}\n${src}`;
}

function tryPrepareRunJsx({ jsxPath, jobPath, label }) {
  const src = jsxPath ? String(jsxPath) : '';
  const jp = jobPath ? String(jobPath) : '';
  if (!src || !jp) return { runJsxPath: src, cleanup: null };
  try {
    if (!fs.existsSync(src)) return { runJsxPath: src, cleanup: null };
    const dir = path.dirname(jp);
    safeMkdir(dir);
    const suffix = crypto.randomBytes(6).toString('hex');
    const base = `run_${sanitizeFileNameSegment(label || 'ps')}_${Date.now()}_${suffix}.jsx`;
    const dst = path.join(dir, base);
    const sourceText = fs.readFileSync(src, 'utf8');
    const preparedSource = buildPreparedRunJsxSource({ sourceText, jobPath: jp });
    fs.writeFileSync(dst, preparedSource, 'utf8');
    return {
      runJsxPath: dst,
      cleanup: () => {
        try {
          if (fs.existsSync(dst)) fs.unlinkSync(dst);
        } catch (e) {
          void e;
        }
      },
    };
  } catch (e) {
    return { runJsxPath: src, cleanup: null, error: e?.message ? String(e.message) : String(e) };
  }
}

function configureResidentRuntime({ outputRoot, vbsPath, quitJsxPath }) {
  if (!residentRuntime.enabled) return;
  if (outputRoot) residentRuntime.outputRoot = outputRoot;
  if (vbsPath) residentRuntime.vbsPath = vbsPath;
  if (quitJsxPath) residentRuntime.quitJsxPath = quitJsxPath;
  if (residentRuntime.outputRoot && !residentRuntime.dir) {
    residentRuntime.dir = path.join(residentRuntime.outputRoot, '_photoshop_resident');
    safeMkdir(residentRuntime.dir);
  }
}

function cancelResidentIdleQuit() {
  if (!residentRuntime.idleTimer) return;
  clearTimeout(residentRuntime.idleTimer);
  residentRuntime.idleTimer = null;
}

function scheduleResidentIdleQuit() {
  if (!residentRuntime.enabled) return;
  cancelResidentIdleQuit();
  const status = photoshopQueue.getStatus();
  if (status.active !== 0 || status.pending !== 0) return;
  residentRuntime.idleTimer = setTimeout(() => {
    triggerResidentQuit().catch((err) => {
      console.warn('[Photoshop 常驻] 空闲退出失败:', errorToText(err) || String(err));
    });
  }, residentRuntime.idleExitMs);
}

function errorToText(err) {
  const msg = err?.message ? String(err.message) : '';
  const raw = err?.raw;
  const stdout = raw?.stdout ? String(raw.stdout) : err?.stdout ? String(err.stdout) : '';
  const stderr = raw?.stderr ? String(raw.stderr) : err?.stderr ? String(err.stderr) : '';
  return [msg, stdout, stderr].filter(Boolean).join(' | ');
}

function shouldRetryError(err) {
  const text = errorToText(err).toLowerCase();
  if (!text) return false;
  const hints = [
    'failed_to_run_script',
    'failed_to_create_photoshop_application',
    'photoshop 脚本执行失败',
    'photoshop export failed',
    'not responding',
    'busy',
    'silent_noop_after_vbs_success',
  ];
  return hints.some((h) => text.includes(h));
}

function shouldHardResetPhotoshopProcess(err) {
  const text = errorToText(err).toLowerCase();
  if (!text) return false;
  return text.includes('silent_noop_after_vbs_success');
}

function getRetryBudgetForPhotoshopError(err, defaultMaxRetries = queueConfig.maxRetries) {
  const baseRetries = Math.max(0, Number(defaultMaxRetries) || 0);
  if (shouldHardResetPhotoshopProcess(err)) return Math.max(baseRetries, 1);
  return baseRetries;
}

async function hardResetPhotoshopProcess({ label, reason }) {
  if (process.platform !== 'win32') return false;
  try {
    await execFileAsync('taskkill.exe', ['/IM', 'Photoshop.exe', '/T', '/F'], {
      windowsHide: true,
      timeout: 15 * 1000,
    });
    console.warn('[Photoshop 调度] 已强制重启 Photoshop 进程', {
      label,
      reason: reason || null,
    });
    await sleep(1500);
    return true;
  } catch (err) {
    const text = errorToText(err).toLowerCase();
    if (text.includes('not found') || text.includes('没有运行的实例') || text.includes('没有找到')) {
      return false;
    }
    console.warn('[Photoshop 调度] 强制重启 Photoshop 失败', {
      label,
      reason: reason || null,
      message: errorToText(err) || String(err),
    });
    return false;
  }
}

function getRetryDelayMs(attempt) {
  const base = queueConfig.baseDelayMs;
  const max = queueConfig.maxDelayMs;
  const exp = Math.min(max, base * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 200);
  return exp + jitter;
}

async function runWithRetry({ label, run }) {
  let attempt = 0;
  for (;;) {
    try {
      if (attempt > 0) {
        console.warn(`[Photoshop 队列] 重试 ${label} 第 ${attempt}/${queueConfig.maxRetries} 次`);
      }
      return await run();
    } catch (err) {
      const retryBudget = getRetryBudgetForPhotoshopError(err, queueConfig.maxRetries);
      const canRetry = shouldRetryError(err) && attempt < retryBudget;
      if (!canRetry) throw err;
      if (shouldHardResetPhotoshopProcess(err)) {
        await hardResetPhotoshopProcess({ label, reason: errorToText(err) || String(err) });
      }
      const delay = getRetryDelayMs(attempt);
      await sleep(delay);
      attempt += 1;
    }
  }
}

async function runPhotoshopCommand({
  vbsPath,
  jsxPath,
  jobPath,
  timeoutMs,
  label,
  attachOnly = false,
  skipIdleSchedule = false,
}) {
  if (residentRuntime.enabled && !skipIdleSchedule) cancelResidentIdleQuit();

  const bringToFront =
    !['0', 'false', 'off'].includes(String(process.env.PS_BRING_TO_FRONT || '0').toLowerCase());

  const prepared = tryPrepareRunJsx({ jsxPath, jobPath, label });
  const runJsxPath = prepared?.runJsxPath || jsxPath;
  const vbsFp = tryGetFileFingerprint(vbsPath);
  const jsxFp = tryGetFileFingerprint(jsxPath);
  const runJsxFp = tryGetFileFingerprint(runJsxPath);
  console.info('[Photoshop 调度] 执行脚本摘要', {
    label,
    attachOnly: Boolean(attachOnly),
    bringToFront,
    vbs: vbsFp ? { exists: vbsFp.exists, size: vbsFp.size, sha1Short: vbsFp.sha1Short, filePath: vbsFp.filePath } : null,
    jsx: jsxFp ? { exists: jsxFp.exists, size: jsxFp.size, sha1Short: jsxFp.sha1Short, filePath: jsxFp.filePath } : null,
    runJsx: runJsxFp ? { exists: runJsxFp.exists, size: runJsxFp.size, sha1Short: runJsxFp.sha1Short, filePath: runJsxFp.filePath } : null,
    prepareError: prepared?.error || null,
    retainedRunJsxPath: prepared?.cleanup ? runJsxPath : null,
    jobPath: jobPath || null,
  });

  const vbsLogPath = jobPath ? `${jobPath}.vbs.log` : null;
  const jsxLogPath = jobPath ? `${jobPath}.log` : null;
  const jsxBatchLog0Path = jobPath ? `${jobPath}.task_0.log` : null;
  const jsxFatalLogPath = jobPath ? `${jobPath}.fatal.log` : null;
  const resultPath = readJobResultPath(jobPath);

  const args = ['//Nologo', vbsPath, runJsxPath, jobPath];
  if (attachOnly) args.push('1');
  if (bringToFront) args.push('bringToFront');

  const p = photoshopQueue.enqueue(() =>
    runWithRetry({
      label,
      run: async () => {
        try {
          await execFileAsync('cscript.exe', args, {
            windowsHide: true,
            timeout: timeoutMs,
          });
          const vbsLogText = readTextFileSafe(vbsLogPath, 64 * 1024);
          const vbsSummary = parseSimpleKeyValueLog(vbsLogText);
          if (vbsSummary) {
            console.info('[Photoshop 调度] VBS 版本摘要', {
              label,
              tmpJsxPath: vbsSummary.tmpJsxPath || null,
              jsxSize: vbsSummary.jsxSize || null,
              scriptBuildLine: vbsSummary.scriptBuildLine || null,
              logPath: vbsLogPath,
            });
          }
          const jsxLogPick = pickFirstExistingFile([jsxLogPath, jsxBatchLog0Path]);
          const jsxLogText = readTextFileSafe(jsxLogPick, 64 * 1024);
          const jsxBuild = pickFirstLineValue(jsxLogText, 'SCRIPT_BUILD:');
          if (jsxLogPick && (jsxBuild || jsxLogText)) {
            console.info('[Photoshop 调度] JSX 版本摘要', {
              label,
              scriptBuild: jsxBuild || null,
              logPath: jsxLogPick,
            });
          }
          if (!attachOnly) {
            await waitForFirstExistingPath({
              fs,
              candidates: [resultPath, jsxLogPath, jsxBatchLog0Path, jsxFatalLogPath].filter(Boolean),
              maxWaitMs: residentRuntime.enabled ? 3500 : 1500,
              pollIntervalMs: 120,
              minBytes: 1,
            });
            if (
              detectSilentNoopAfterPhotoshopRun({
                fs,
                resultPath,
                jsxLogPath,
                jsxBatchLogPath: jsxBatchLog0Path,
                fatalLogPath: jsxFatalLogPath,
              })
            ) {
              console.error('[error][photoshop] VBS 返回成功但未生成 JSX 结果或日志', {
                label,
                jobPath: jobPath || null,
                resultPath: resultPath || null,
                jsxLogPath,
                jsxBatchLogPath: jsxBatchLog0Path,
                jsxFatalLogPath,
                vbsLogPath,
              });
              const next = new Error('silent_noop_after_vbs_success');
              next.code = 'PHOTOSHOP_SILENT_NOOP';
              next.jobPath = jobPath || null;
              next.resultPath = resultPath || null;
              next.vbsLogPath = vbsLogPath || null;
              next.jsxLogPath = jsxLogPath || null;
              next.jsxBatchLogPath = jsxBatchLog0Path || null;
              next.jsxFatalLogPath = jsxFatalLogPath || null;
              throw next;
            }
          }
        } catch (err) {
          const output = err?.stdout ? err.stdout.toString() : '';
          const baseMsg = output.trim() || err.message || '未知错误';
          const vbsLogText = readTextFileSafe(vbsLogPath, 64 * 1024);
          const vbsSummary = parseSimpleKeyValueLog(vbsLogText);
          const jsxLogPick = pickFirstExistingFile([jsxLogPath, jsxBatchLog0Path]);
          const jsxLogText = readTextFileSafe(jsxLogPick, 64 * 1024);
          const jsxBuild = pickFirstLineValue(jsxLogText, 'SCRIPT_BUILD:');
          const extra = [
            vbsSummary?.scriptBuildLine ? `vbsScriptBuildLine=${vbsSummary.scriptBuildLine}` : null,
            jsxBuild ? `jsxScriptBuild=${jsxBuild}` : null,
            vbsSummary?.tmpJsxPath ? `tmpJsxPath=${vbsSummary.tmpJsxPath}` : null,
          ]
            .filter(Boolean)
            .join(' | ');
          const next = new Error(extra ? `${baseMsg} | ${extra}` : baseMsg);
          next.raw = err;
          throw next;
        }
      },
    }),
  );

  if (residentRuntime.enabled && !skipIdleSchedule) {
    return p.finally(() => {
      scheduleResidentIdleQuit();
    });
  }
  return p;
}

async function triggerResidentQuit() {
  if (!residentRuntime.enabled) return;
  if (residentRuntime.idleQuitRunning) return;
  const status = photoshopQueue.getStatus();
  if (status.active !== 0 || status.pending !== 0) return;
  if (!residentRuntime.vbsPath || !residentRuntime.quitJsxPath || !residentRuntime.dir) return;

  residentRuntime.idleQuitRunning = true;
  try {
    const jobPath = path.join(residentRuntime.dir, `job_quit_${Date.now()}.json`);
    const resultPath = path.join(residentRuntime.dir, `result_quit_${Date.now()}.json`);
    const job = { command: 'quit', quitAfter: true, resultPath };
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');
    await runPhotoshopCommand({
      vbsPath: residentRuntime.vbsPath,
      jsxPath: residentRuntime.quitJsxPath,
      jobPath,
      timeoutMs: 60 * 1000,
      label: 'resident-quit',
      attachOnly: true,
      skipIdleSchedule: true,
    });
  } finally {
    residentRuntime.idleQuitRunning = false;
  }
}

/**
 * 根据 MIME 推断文件扩展名
 * @param {string} mime - MIME
 * @returns {string}
 */
function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  return 'bin';
}

function sanitizeFileNameSegment(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'img';
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^_+|_+$/g, '');
  const safe = cleaned || 'img';
  return safe.length > 80 ? safe.slice(0, 80) : safe;
}

function normalizeExportFormat(format) {
  const normalizedFormat = String(format || 'png').toLowerCase();
  if (normalizedFormat === 'psd') return 'psd';
  if (normalizedFormat === 'psb') return 'psb';
  if (normalizedFormat === 'jpeg' || normalizedFormat === 'jpg') return 'jpeg';
  return 'png';
}

function normalizeExportQuality(quality) {
  const n = Number(quality);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function exportExtFromFormat(format) {
  const f = String(format || '').toLowerCase();
  if (f === 'psd') return 'psd';
  if (f === 'psb') return 'psb';
  if (f === 'jpeg') return 'jpg';
  return 'png';
}

function buildBatchOutputName(index, label, ext) {
  const safeLabel = sanitizeFileNameSegment(label);
  const prefix = String(index + 1).padStart(4, '0');
  return `${prefix}_${safeLabel}.${ext}`;
}

function buildBundleOutputName(label, ext) {
  const safeLabel = sanitizeFileNameSegment(label);
  return `bundle_${safeLabel}_${Date.now()}.${ext}`;
}

function isImgVariable(v) {
  if (!v || typeof v !== 'object') return false;
  const type = String(v.varType || v.type || v.layerType || '').toLowerCase();
  if (type === 'img' || type === 'image') return true;
  return false;
}

function pickExportableImgVariables(variables) {
  const vars = Array.isArray(variables) ? variables : [];
  return vars
    .filter((v) => isImgVariable(v))
    .filter((v) => v.psId !== null && v.psId !== undefined)
    .filter((v) => Number.isFinite(Number(v.psId)));
}

function getLayerRect(x, y, width, height) {
  const left = Number(x);
  const top = Number(y);
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null;
  }
  if (w <= 0 || h <= 0) return null;
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
  };
}

function pickImageFromDir(dirPath, preferRegex) {
  if (!dirPath || !fs.existsSync(dirPath)) return null;
  const files = fs.readdirSync(dirPath).filter((name) => {
    const lower = String(name || '').toLowerCase();
    if (!lower) return false;
    const extOk = lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp');
    if (!extOk) return false;
    const full = path.join(dirPath, name);
    return fs.existsSync(full) && fs.statSync(full).isFile();
  });
  if (files.length === 0) return null;
  const preferred = preferRegex ? files.find((name) => preferRegex.test(name)) : null;
  const chosen = preferred || files.sort()[0];
  return path.join(dirPath, chosen);
}

function loadReferenceImage(jobDir) {
  const refPath = path.join(jobDir, 'reference.png');
  const bgPath = path.join(jobDir, 'backdrop.png');
  if (fs.existsSync(refPath)) {
    const backdropBuffer = fs.existsSync(bgPath) ? fs.readFileSync(bgPath) : null;
    return { buffer: fs.readFileSync(refPath), path: refPath, backdropBuffer, source: 'reference' };
  }
  if (fs.existsSync(bgPath)) {
    return { buffer: fs.readFileSync(bgPath), path: bgPath, backdropBuffer: null, source: 'backdrop' };
  }
  const fallbackInRoot = pickImageFromDir(jobDir, /^reference(\.|_)/i) || pickImageFromDir(jobDir, /^backdrop(\.|_)/i);
  if (fallbackInRoot) {
    const backdropBuffer = fs.existsSync(bgPath) ? fs.readFileSync(bgPath) : null;
    return { buffer: fs.readFileSync(fallbackInRoot), path: fallbackInRoot, backdropBuffer, source: 'root_fallback' };
  }
  const imagesDir = path.join(jobDir, 'images');
  const fallbackInImages = pickImageFromDir(imagesDir, /^reference(\.|_)/i);
  if (!fallbackInImages) return null;
  const backdropBuffer = fs.existsSync(bgPath) ? fs.readFileSync(bgPath) : null;
  return { buffer: fs.readFileSync(fallbackInImages), path: fallbackInImages, backdropBuffer, source: 'images_fallback' };
}

function tryBackfillBackgroundRect({ psdPath, manifestPath, canvasWidth, canvasHeight }) {
  if (!psdPath || !fs.existsSync(psdPath)) return null;
  try {
    const psd = readPsd(fs.readFileSync(psdPath), {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
      logMissingFeatures: false,
    });
    const meta = extractTemplateMeta(psd);
    const rect = meta?.backgroundRect || null;
    if (!rect) return null;
    if (manifestPath && fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(
            {
              ...manifest,
              width: manifest?.width ?? canvasWidth ?? meta?.width ?? null,
              height: manifest?.height ?? canvasHeight ?? meta?.height ?? null,
              backgroundRect: rect,
            },
            null,
            2,
          ),
          'utf8',
        );
      } catch (e) {
        void e;
      }
    }
    return rect;
  } catch (e) {
    void e;
    return null;
  }
}

function tryBackfillGuides({ psdPath, manifestPath, canvasWidth, canvasHeight }) {
  if (!psdPath || !fs.existsSync(psdPath)) return null;
  try {
    const psd = readPsd(fs.readFileSync(psdPath), {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
      logMissingFeatures: false,
    });
    const meta = extractTemplateMeta(psd);
    const guides = meta?.guides || null;
    const guideLayers = meta?.guideLayers || null;
    if (manifestPath && fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(
            {
              ...manifest,
              width: manifest?.width ?? canvasWidth ?? meta?.width ?? null,
              height: manifest?.height ?? canvasHeight ?? meta?.height ?? null,
              guides: guides || manifest?.guides || null,
              guideLayers: guideLayers || manifest?.guideLayers || null,
            },
            null,
            2,
          ),
          'utf8',
        );
      } catch (e) {
        console.warn('[对齐调试] 参考线回填写入失败', e?.message || String(e));
      }
    }
    return { guides, guideLayers };
  } catch (e) {
    console.warn('[对齐调试] 参考线回填失败', e?.message || String(e));
    return null;
  }
}

async function preScaleImageBufferIfNeeded({
  imageBuffer,
  rect,
  enabled = false,
  triggerScaleFactor = 3,
  maxScaleFactor = 2,
  maxPixels = 24000000,
}) {
  const raw = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer || []);
  if (!enabled) return { buffer: raw, applied: false, meta: null };
  const targetW = rect && Number.isFinite(rect.width) ? Math.max(0, Math.round(Number(rect.width))) : 0;
  const targetH = rect && Number.isFinite(rect.height) ? Math.max(0, Math.round(Number(rect.height))) : 0;
  let meta = null;
  try {
    meta = await sharp(raw, { failOnError: false }).metadata();
  } catch {
    return { buffer: raw, applied: false, meta: null };
  }
  const w = Number(meta?.width) || 0;
  const h = Number(meta?.height) || 0;
  if (!(w > 0 && h > 0)) return { buffer: raw, applied: false, meta: null };
  const pixels = w * h;
  const trig = Number.isFinite(triggerScaleFactor) ? Number(triggerScaleFactor) : 3;
  const maxF = Number.isFinite(maxScaleFactor) ? Number(maxScaleFactor) : 2;
  const maxP = Number.isFinite(maxPixels) ? Number(maxPixels) : 24000000;

  const overPixels = pixels > maxP;
  const overTarget =
    targetW > 0 && targetH > 0 && (w > targetW * trig || h > targetH * trig || pixels > targetW * targetH * trig * trig);
  if (!overPixels && !overTarget) return { buffer: raw, applied: false, meta: { width: w, height: h, pixels } };

  const limitW = targetW > 0 ? Math.max(1, Math.round(targetW * maxF)) : Math.max(1, Math.round(Math.sqrt(maxP)));
  const limitH = targetH > 0 ? Math.max(1, Math.round(targetH * maxF)) : Math.max(1, Math.round(Math.sqrt(maxP)));
  try {
    const resized = await sharp(raw, { failOnError: false })
      .resize({ width: limitW, height: limitH, fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    const meta2 = await sharp(resized, { failOnError: false }).metadata().catch(() => null);
    const w2 = Number(meta2?.width) || 0;
    const h2 = Number(meta2?.height) || 0;
    return {
      buffer: resized,
      applied: w2 > 0 && h2 > 0 && (w2 < w || h2 < h),
      meta: { width: w, height: h, pixels, scaledToWidth: w2 || null, scaledToHeight: h2 || null },
    };
  } catch {
    return { buffer: raw, applied: false, meta: { width: w, height: h, pixels } };
  }
}

async function persistAlignedImage({
  parsed,
  inputsDir,
  filePrefix,
  rect,
  referenceImage,
  backgroundRect,
  guides,
  guideLayers,
  manualGuides,
  canvasWidth,
  canvasHeight,
  debugMeta,
  alignmentMode = 'default',
  disableImageAlignment = false,
  preScale,
  createdTempFiles,
}) {
  const pre = await preScaleImageBufferIfNeeded({
    imageBuffer: parsed.buffer,
    rect,
    enabled: preScale?.enabled === true,
    triggerScaleFactor: preScale?.triggerScaleFactor,
    maxScaleFactor: preScale?.maxScaleFactor,
    maxPixels: preScale?.maxPixels,
  });
  let buffer = pre.buffer;
  let ext = extFromMime(parsed.mime);
  let applied = false;
  if (disableImageAlignment || !rect) {
    buffer = await sharp(buffer, { failOnError: false })
      .ensureAlpha()
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    applied = true;
  } else {
    const psId = Number.isFinite(debugMeta?.psId) ? Number(debugMeta.psId) : null;
    const result = await imageProcessor.alignWhiteBackgroundImage({
      imageBuffer: buffer,
      targetWidth: rect.width,
      targetHeight: rect.height,
      referenceBuffer: referenceImage?.buffer || null,
      backdropBuffer: referenceImage?.backdropBuffer || null,
      referenceRect: rect,
      psId,
      backgroundRect,
      guides,
      guideLayers,
      manualGuides,
      canvasWidth,
      canvasHeight,
      alignmentMode,
      preserveDetail: true,
      maxDetailScale: 4,
      maxCanvasPixels: 128000000,
    });
    buffer = result.buffer;
    applied = result.applied;
    if (result?.debug) {
      const meta = debugMeta && typeof debugMeta === 'object' ? debugMeta : {};
      const origin =
        result.debug.originToBackgroundRect ||
        result.debug.originToBackdrop ||
        result.debug.originToCanvas ||
        result.debug.originMarginsInRect ||
        null;
      const originSource = result.debug.originToBackgroundRect
        ? 'backgroundRect'
        : result.debug.originToBackdrop
          ? 'backdropBounds'
          : result.debug.originToCanvas
            ? 'canvas'
            : result.debug.originMarginsInRect
              ? 'rect'
              : 'none';
      console.info('[对齐调试] 原始图片边距', {
        templateId: meta.templateId || null,
        psId: meta.psId || null,
        name: meta.name || null,
        rect,
        origin,
        originSource,
        backgroundRect: backgroundRect || null,
        originToBackgroundRect: result.debug.originToBackgroundRect || null,
        originToBackdrop: result.debug.originToBackdrop || null,
        backdropBounds: result.debug.backdropBounds || null,
        backdropBoundsMethod: result.debug.backdropBoundsMethod || null,
        refBounds: result.debug.refBounds || null,
        refBoundsBeforeTrim: result.debug.refBoundsBeforeTrim || null,
        refTrimApplied: result.debug.refTrimApplied || null,
        refBoundsMethod: result.debug.refBoundsMethod || null,
        refBgMethod: result.debug.refBgMethod || null,
        refBgColor: result.debug.refBgColor || null,
        cropMethod: result.debug.cropMethod || null,
        cropBeforeTrim: result.debug.cropBeforeTrim || null,
        cropTrimApplied: result.debug.cropTrimApplied || null,
        guideSource: result.debug.guideSource || null,
        guideLeftX: result.debug.guideLeftX ?? null,
        guideRightX: result.debug.guideRightX ?? null,
        targetBoxFromGuides: result.debug.targetBoxFromGuides || null,
        alignmentCheck: result.debug.alignmentCheck || null,
        placement: result.debug.placement || null,
      });
      try {
        const dbgPath = path.join(
          inputsDir,
          `${filePrefix}_psId_${meta.psId != null ? String(meta.psId) : 'na'}_align_debug_${Date.now()}.json`,
        );
        fs.writeFileSync(
          dbgPath,
          JSON.stringify(
            {
              templateId: meta.templateId || null,
              psId: meta.psId || null,
              name: meta.name || null,
              rect,
              manualGuides,
              alignmentMode,
              preScale: pre && pre.meta ? { applied: pre.applied === true, ...pre.meta } : null,
              debug: result.debug,
            },
            null,
            2,
          ),
          'utf8',
        );
        pushTempFile(createdTempFiles, dbgPath);
      } catch (eWrite) {
        void eWrite;
      }
    }
  }
  if (applied) {
    ext = 'png';
  }
  const fp = path.join(inputsDir, `${filePrefix}_${Date.now()}.${ext}`);
  fs.writeFileSync(fp, buffer);
  pushTempFile(createdTempFiles, fp);
  return fp;
}

async function persistAlignedImageFromBuffer({
  imageBuffer,
  extHint,
  inputsDir,
  filePrefix,
  rect,
  referenceImage,
  backgroundRect,
  guides,
  guideLayers,
  manualGuides,
  canvasWidth,
  canvasHeight,
  debugMeta,
  alignmentMode = 'default',
  disableImageAlignment = false,
  preScale,
  createdTempFiles,
}) {
  const pre = await preScaleImageBufferIfNeeded({
    imageBuffer,
    rect,
    enabled: preScale?.enabled === true,
    triggerScaleFactor: preScale?.triggerScaleFactor,
    maxScaleFactor: preScale?.maxScaleFactor,
    maxPixels: preScale?.maxPixels,
  });
  const raw = pre.buffer;
  if (disableImageAlignment || !rect) {
    const buffer = await sharp(raw, { failOnError: false })
      .ensureAlpha()
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    const fp = path.join(inputsDir, `${filePrefix}_${Date.now()}.png`);
    fs.writeFileSync(fp, buffer);
    pushTempFile(createdTempFiles, fp);
    return fp;
  }

  const psId = Number.isFinite(debugMeta?.psId) ? Number(debugMeta.psId) : null;
  const result = await imageProcessor.alignWhiteBackgroundImage({
    imageBuffer: raw,
    targetWidth: rect.width,
    targetHeight: rect.height,
    referenceBuffer: referenceImage?.buffer || null,
    backdropBuffer: referenceImage?.backdropBuffer || null,
    referenceRect: rect,
    psId,
    backgroundRect,
    guides,
    guideLayers,
    manualGuides,
    canvasWidth,
    canvasHeight,
    alignmentMode,
    preserveDetail: true,
    maxDetailScale: 4,
    maxCanvasPixels: 128000000,
  });
  if (result?.debug) {
    const meta = debugMeta && typeof debugMeta === 'object' ? debugMeta : {};
    const origin =
      result.debug.originToBackgroundRect ||
      result.debug.originToBackdrop ||
      result.debug.originToCanvas ||
      result.debug.originMarginsInRect ||
      null;
    const originSource = result.debug.originToBackgroundRect
      ? 'backgroundRect'
      : result.debug.originToBackdrop
        ? 'backdropBounds'
        : result.debug.originToCanvas
          ? 'canvas'
          : result.debug.originMarginsInRect
            ? 'rect'
            : 'none';
    console.info('[对齐调试] 原始图片边距', {
      templateId: meta.templateId || null,
      psId: meta.psId || null,
      name: meta.name || null,
      rect,
      origin,
      originSource,
      backgroundRect: backgroundRect || null,
      originToBackgroundRect: result.debug.originToBackgroundRect || null,
      originToBackdrop: result.debug.originToBackdrop || null,
      backdropBounds: result.debug.backdropBounds || null,
      backdropBoundsMethod: result.debug.backdropBoundsMethod || null,
      refBounds: result.debug.refBounds || null,
      refBoundsBeforeTrim: result.debug.refBoundsBeforeTrim || null,
      refTrimApplied: result.debug.refTrimApplied || null,
      refBoundsMethod: result.debug.refBoundsMethod || null,
      refBgMethod: result.debug.refBgMethod || null,
      refBgColor: result.debug.refBgColor || null,
      cropMethod: result.debug.cropMethod || null,
      cropBeforeTrim: result.debug.cropBeforeTrim || null,
      cropTrimApplied: result.debug.cropTrimApplied || null,
      guideSource: result.debug.guideSource || null,
      guideLeftX: result.debug.guideLeftX ?? null,
      guideRightX: result.debug.guideRightX ?? null,
      targetBoxFromGuides: result.debug.targetBoxFromGuides || null,
      alignmentCheck: result.debug.alignmentCheck || null,
      placement: result.debug.placement || null,
    });
    try {
      const dbgPath = path.join(
        inputsDir,
        `${filePrefix}_psId_${meta.psId != null ? String(meta.psId) : 'na'}_align_debug_${Date.now()}.json`,
      );
      fs.writeFileSync(
        dbgPath,
        JSON.stringify(
          {
            templateId: meta.templateId || null,
            psId: meta.psId || null,
            name: meta.name || null,
            rect,
            manualGuides,
            alignmentMode,
            preScale: pre && pre.meta ? { applied: pre.applied === true, ...pre.meta } : null,
            debug: result.debug,
          },
          null,
          2,
        ),
        'utf8',
      );
      pushTempFile(createdTempFiles, dbgPath);
    } catch (eWrite) {
      void eWrite;
    }
  }
  const ext = result.applied ? 'png' : String(extHint || 'png');
  const fp = path.join(inputsDir, `${filePrefix}_${Date.now()}.${ext}`);
  fs.writeFileSync(fp, result.buffer);
  pushTempFile(createdTempFiles, fp);
  return fp;
}

async function persistAlignedImageToContentEdge({
  imageBuffer,
  extHint,
  inputsDir,
  filePrefix,
  rect,
  referenceImage,
  backgroundRect,
  guides,
  guideLayers,
  manualGuides,
  canvasWidth,
  canvasHeight,
  debugMeta,
  disableImageAlignment = false,
  preScale,
  createdTempFiles,
}) {
  const pre = await preScaleImageBufferIfNeeded({
    imageBuffer,
    rect,
    enabled: preScale?.enabled === true,
    triggerScaleFactor: preScale?.triggerScaleFactor,
    maxScaleFactor: preScale?.maxScaleFactor,
    maxPixels: preScale?.maxPixels,
  });
  const raw = pre.buffer;
  if (disableImageAlignment || !rect) {
    const buffer = await sharp(raw, { failOnError: false })
      .ensureAlpha()
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    const fp = path.join(inputsDir, `${filePrefix}_${Date.now()}.png`);
    fs.writeFileSync(fp, buffer);
    pushTempFile(createdTempFiles, fp);
    return fp;
  }
  if (!referenceImage) {
    console.warn('[对齐警告] PSD自动填充缺少参考图，回退到普通对齐（无法进行内容边缘对齐）', { templateId: debugMeta?.templateId });
    return persistAlignedImageFromBuffer({
      imageBuffer: raw,
      extHint,
      inputsDir,
      filePrefix,
      rect,
      referenceImage: null,
      backgroundRect,
      guides,
      guideLayers,
      manualGuides,
      canvasWidth,
      canvasHeight,
      debugMeta,
      alignmentMode: 'default',
      disableImageAlignment,
      preScale: preScale && typeof preScale === 'object' ? preScale : null,
      createdTempFiles,
    });
  }

  const result = await imageProcessor.alignToRefContent({
    imageBuffer: raw,
    targetWidth: rect.width,
    targetHeight: rect.height,
    referenceBuffer: referenceImage.buffer,
    referenceRect: rect,
    psId: Number.isFinite(debugMeta?.psId) ? Number(debugMeta.psId) : null,
    guides,
    guideLayers,
    manualGuides,
    canvasWidth,
    canvasHeight,
    preserveDetail: true,
    maxDetailScale: 4,
    maxCanvasPixels: 128000000,
  });

  if (result?.debug) {
    const meta = debugMeta && typeof debugMeta === 'object' ? debugMeta : {};
    console.info('[对齐调试] PSD自动填充内容框对齐', {
      templateId: meta.templateId || null,
      psId: meta.psId || null,
      name: meta.name || null,
      rect,
      debug: result.debug,
    });
  }
  const ext = result.applied ? 'png' : String(extHint || 'png');
  const fp = path.join(inputsDir, `${filePrefix}_${Date.now()}.${ext}`);
  fs.writeFileSync(fp, result.buffer);
  pushTempFile(createdTempFiles, fp);
  return fp;
}

function ensureSafeBasename(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const base = path.basename(raw);
  if (base !== raw) return null;
  if (base.includes('/') || base.includes('\\')) return null;
  return base;
}

export function createDuplicateImageGuideGuard(options = {}) {
  const allowMismatch = options && options.allowMismatch === true;
  const map = new Map();
  return {
    register({ imageKey, guideKey, psId, name, id, slotId }) {
      const k = String(imageKey || '').trim();
      if (!k) return;
      const gk = String(guideKey || 'none');
      const item = {
        psId,
        id: id != null ? String(id) : null,
        slotId: slotId != null ? String(slotId) : null,
        name: String(name || ''),
        guideKey: gk,
      };
      const entry = map.get(k);
      if (!entry) {
        map.set(k, { guideKey: gk, items: [item] });
        return;
      }
      entry.items.push(item);
      if (entry.guideKey !== gk) {
        if (allowMismatch) {
          try {
            console.warn('[warn] 忽略同图多变量参考线不一致（已按请求允许继续导出）', {
              imageKey: k,
              guideKeys: [entry.guideKey, gk],
              items: entry.items.slice(0, 10),
            });
          } catch (e) {
            void e;
          }
          return;
        }
        const err = new Error('检测到同一张图片被用于多个图片变量，但参考线绑定不一致。为避免不同位置对齐串用，已阻止导出；请为每个图片变量分别配置/选择图片或确保参考线绑定一致。');
        err.status = 400;
        err.code = 'DUP_IMAGE_GUIDE_MISMATCH';
        err.dupImageGuideMismatch = { imageKey: k, items: entry.items.slice(0, 30) };
        throw err;
      }
    },
  };
}

/**
 * 将客户端 updates（基于 psId 的指令）规范化为 Photoshop JSX 可执行的 updates
 * @param {object} params - 参数
 * @param {Array<any>} params.clientUpdates - 客户端 updates
 * @param {Array<any>} params.variables - 变量定义列表（来自 manifest 或客户端）
 * @param {string} params.inputsDir - 输入资源目录（用于落地图片文件）
 * @returns {Array<any>} 规范化后的 updates
 */
async function normalizeClientUpdates({
  templateId,
  clientUpdates,
  variables,
  inputsDir,
  allowedImagePathRoots,
  referenceImage,
  backgroundRect,
  guides,
  guideLayers,
  canvasWidth,
  canvasHeight,
  outputRoot,
  channels,
  useChannelMaskAlignment = false,
  vbsPath,
  cutoutJsxPath,
  fileBufferCache: externalFileBufferCache,
  alignedImagePathCache: externalAlignedImagePathCache,
  alignmentMode = 'default',
  disableImageAlignment = false,
  isPsdAutoFill = false,
  allowDupImageGuideMismatch = false,
  preScale,
  createdTempFiles,
}) {
  if (!Array.isArray(clientUpdates) || clientUpdates.length === 0) return [];

  const vars = Array.isArray(variables) ? variables : [];
  const byPsId = new Map();
  const byId = new Map();
  for (const v of vars) {
    if (v && v.psId != null) byPsId.set(Number(v.psId), v);
    if (v && v.id) byId.set(String(v.id), v);
  }

  const normalized = [];
  const seenPsId = new Map();
  const duplicatePsIds = [];
  const stats = {
    total: clientUpdates.length,
    text: 0,
    textNewlineNormalized: 0,
    img: 0,
    imgWithPath: 0,
    imgWithDataUrl: 0,
  };
  const fileBufferCache = externalFileBufferCache instanceof Map ? externalFileBufferCache : new Map();
  const alignedImagePathCache = externalAlignedImagePathCache instanceof Map ? externalAlignedImagePathCache : new Map();
  const preScaleOptions = preScale && typeof preScale === 'object' ? preScale : null;

  const resolveImagePath = (srcPathRaw) => {
    const src = String(srcPathRaw || '');
    if (!src) throw new Error('imagePath 为空');
    const hasRoots = Array.isArray(allowedImagePathRoots) && allowedImagePathRoots.length > 0;
    const primaryRoot = hasRoots ? path.resolve(String(allowedImagePathRoots[0] || '')) : '';
    const resolvedSrc = path.isAbsolute(src) ? path.resolve(src) : primaryRoot ? path.resolve(primaryRoot, src) : '';
    if (!resolvedSrc) throw new Error('imagePath 无法解析为有效路径');
    if (hasRoots) {
      const ok = allowedImagePathRoots.some((root) => {
        const base = path.resolve(String(root || ''));
        if (!base) return false;
        return isPathInsideDir(base, resolvedSrc);
      });
      if (!ok) throw new Error('imagePath 不在允许的目录范围内');
    }
    if (!fs.existsSync(resolvedSrc)) throw new Error(`imagePath 不存在: ${resolvedSrc}`);
    return resolvedSrc;
  };

  const useChannel =
    useChannelMaskAlignment === true && Array.isArray(channels) && channels.length > 0 && typeof outputRoot === 'string' && outputRoot;

  let channelIndex = null;
  if (useChannel) {
    const channelDirCandidates = [
      path.join(String(outputRoot), 'assets', 'channels'),
      path.join(String(outputRoot), 'channels'),
    ];
    const resolveChannelFilePath = (storedNameRaw) => {
      const storedName = ensureSafeBasename(storedNameRaw);
      if (!storedName) return '';
      for (let i = 0; i < channelDirCandidates.length; i += 1) {
        const fp = path.join(channelDirCandidates[i], storedName);
        if (fs.existsSync(fp)) return fp;
      }
      return '';
    };
    const missingChannelFiles = [];
    channelIndex = channels
      .map((c) => {
        const storedName = ensureSafeBasename(c?.storedName);
        if (!storedName) return null;
        const filePath = resolveChannelFilePath(storedName);
        if (!filePath) {
          missingChannelFiles.push(storedName);
          return null;
        }
        const sourceName = String(c?.sourceName || storedName);
        const model = pickModel(sourceName);
        const angle = pickAngle(sourceName);
        const baseModel = model ? String(model).toUpperCase() : null;
        return { storedName, filePath, sourceName, model, baseModel, angle, isGeneric: !model };
      })
      .filter(Boolean);
    if (!Array.isArray(channelIndex) || channelIndex.length === 0) {
      channelIndex = null;
      if (missingChannelFiles.length > 0) {
        const err = new Error('通道图文件不存在');
        err.status = 400;
        err.missingChannelFiles = missingChannelFiles.slice(0, 30);
        throw err;
      }
    }
  }

  const cutoutPathByKey = new Map();
  const cutoutRunId = crypto.randomBytes(6).toString('hex');
  if (useChannel && channelIndex) {
    const missingChannels = [];
    const tasks = [];
    const taskKeyByLabel = new Map();
    for (let i = 0; i < clientUpdates.length; i += 1) {
      const u = clientUpdates[i];
      if (!u || typeof u !== 'object') continue;
      const base =
        (u.psId != null ? byPsId.get(Number(u.psId)) : null) || (u.id != null ? byId.get(String(u.id)) : null) || null;
      const type =
        u.varType || base?.varType || (base?.layerType === 'text' ? 'text' : base?.layerType === 'image' ? 'img' : null);
      if (String(type || '').toLowerCase() !== 'img') continue;
      if (!u.imagePath) continue;
      const sourceName = String(u.sourceName || '').trim();
      if (!sourceName) continue;
      const match = matchChannel(sourceName, channelIndex, { modelHint: u.modelHint, angleHint: u.angleHint });
      if (!match) {
        missingChannels.push({
          label: String(i),
          sourceName,
          model: pickModel(sourceName),
          angle: pickAngle(sourceName),
          modelHint: u.modelHint != null ? String(u.modelHint) : null,
          angleHint: u.angleHint != null ? String(u.angleHint) : null,
        });
        continue;
      }
      const resolvedSrc = resolveImagePath(u.imagePath);
      const key = `${resolvedSrc}||${String(match.filePath)}`;
      if (cutoutPathByKey.has(key)) continue;
      const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
      const outPath = path.join(inputsDir, `cutout_${hash}_${cutoutRunId}.png`);
      cutoutPathByKey.set(key, outPath);
      if (!fileExistsNonEmpty(outPath, 2000)) {
        const label = `c_${hash}`;
        tasks.push({
          label,
          productPath: resolvedSrc,
          channelPath: String(match.filePath),
          outputPath: outPath,
          resizeMode: 'exact',
          sourceName,
        });
        taskKeyByLabel.set(label, key);
      }
    }

    if (missingChannels.length > 0) {
      const err = new Error('缺少通道图');
      err.status = 400;
      err.missingChannels = missingChannels;
      err.availableChannels = channelIndex.slice(0, 30).map((c) => c.sourceName);
      err.availableChannelModels = Array.from(new Set(channelIndex.map((c) => c.baseModel).filter(Boolean))).slice(0, 20);
      err.availableChannelAngles = Array.from(new Set(channelIndex.map((c) => c.angle).filter(Boolean))).slice(0, 20);
      err.channelMatchBuild = CHANNEL_MATCH_BUILD;
      throw err;
    }

    if (tasks.length > 0) {
      const safeVbs = String(vbsPath || '').trim();
      const safeJsx = String(cutoutJsxPath || '').trim();
      if (!safeVbs || !safeJsx) throw new Error('抠图服务未就绪');
      const jobPath = path.join(inputsDir, `job_cutout_for_export_${Date.now()}.json`);
      const resultPath = path.join(inputsDir, `result_cutout_for_export_${Date.now()}.json`);
      fs.writeFileSync(jobPath, JSON.stringify({ tasks, resultPath }, null, 2), 'utf8');
      fs.writeFileSync(resultPath, JSON.stringify({ ok: false, placeholder: true, results: [] }, null, 2), 'utf8');
      pushTempFile(createdTempFiles, jobPath);
      pushTempFile(createdTempFiles, resultPath);
      const timeoutMs = Math.min(20 * 60 * 1000, 2 * 60 * 1000 + tasks.length * 12 * 1000);
      await runPhotoshopCommand({
        vbsPath: safeVbs,
        jsxPath: safeJsx,
        jobPath,
        timeoutMs,
        label: `cutout:${String(templateId || 'template')}`,
      });
      const raw = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, 'utf8') : '';
      const parsed = raw ? parseJsonSafely(raw) : null;
      if (!parsed || parsed?.placeholder === true) {
        throw new Error('Photoshop 未生成抠图结果文件');
      }
      if (parsed?.ok === false) {
        const msg = parsed?.error != null ? String(parsed.error) : '抠图失败';
        throw new Error(msg);
      }
      const results = Array.isArray(parsed?.results) ? parsed.results : [];
      const byLabel = new Map();
      results.forEach((r) => {
        const label = r?.label != null ? String(r.label) : '';
        if (!label) return;
        byLabel.set(label, r);
      });
      for (let i = 0; i < tasks.length; i += 1) {
        const t = tasks[i];
        const label = String(t.label || '');
        const r = byLabel.get(label) || null;
        const ok = r ? r.ok === true : fileExistsNonEmpty(t.outputPath, 2000);
        if (!ok || !fileExistsNonEmpty(t.outputPath, 2000)) {
          const top = Array.isArray(r?.errors) && r.errors.length > 0 ? r.errors[0] : null;
          const msg = top && top.message != null ? String(top.message) : '抠图失败';
          throw new Error(msg);
        }
        pushTempFile(createdTempFiles, t.outputPath);
      }
    }
  }

  const resolveManualGuides = ({ guidePickLeft, guidePickRight, rect }) => {
    const left = Math.round(Number(guidePickLeft));
    const right = Math.round(Number(guidePickRight));
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;

    const rectAbsLeft = Number.isFinite(rect?.left) ? Number(rect.left) : NaN;
    const rectAbsRight = Number.isFinite(rectAbsLeft) && Number.isFinite(rect?.width) ? rectAbsLeft + Number(rect.width) : NaN;
    if (!Number.isFinite(rectAbsLeft) || !Number.isFinite(rectAbsRight) || rectAbsRight <= rectAbsLeft) return null;

    const eps = 2;
    const within = (l, r) => l >= rectAbsLeft - eps && r <= rectAbsRight + eps && r > l;

    let chosenLeft = null;
    let chosenRight = null;
    if (within(left, right)) {
      chosenLeft = left;
      chosenRight = right;
    } else if (Number.isFinite(rect?.width) && left >= -eps && right <= Number(rect.width) + eps) {
      const l2 = rectAbsLeft + left;
      const r2 = rectAbsLeft + right;
      if (within(l2, r2)) {
        chosenLeft = l2;
        chosenRight = r2;
      }
    }

    if (chosenLeft == null || chosenRight == null) return null;
    const clampedLeft = Math.max(rectAbsLeft, Math.min(rectAbsRight, chosenLeft));
    const clampedRight = Math.max(rectAbsLeft, Math.min(rectAbsRight, chosenRight));
    if (!Number.isFinite(clampedLeft) || !Number.isFinite(clampedRight) || clampedRight <= clampedLeft) return null;
    return { leftX: Math.round(clampedLeft), rightX: Math.round(clampedRight) };
  };

  const dupImageGuideGuard = createDuplicateImageGuideGuard({ allowMismatch: allowDupImageGuideMismatch === true });
  const guideKeyFromManual = (manualGuides) => {
    if (!manualGuides) return 'none';
    const l = Math.round(Number(manualGuides.leftX));
    const r = Math.round(Number(manualGuides.rightX));
    if (!Number.isFinite(l) || !Number.isFinite(r) || r <= l) return 'none';
    return `${l},${r}`;
  };

  for (let i = 0; i < clientUpdates.length; i += 1) {
    const u = clientUpdates[i];
    if (!u || typeof u !== 'object') continue;
    const base =
      (u.psId != null ? byPsId.get(Number(u.psId)) : null) ||
      (u.id != null ? byId.get(String(u.id)) : null) ||
      null;

    const psId = u.psId != null ? Number(u.psId) : base?.psId != null ? Number(base.psId) : null;
    if (!Number.isFinite(psId)) {
      throw new Error('updates 中存在缺少或无效的 psId');
    }
    const prevIndex = seenPsId.get(psId);
    if (prevIndex !== undefined) {
      duplicatePsIds.push({ psId, prevIndex, index: i, name: u.name || base?.name || '' });
    } else {
      seenPsId.set(psId, i);
    }

    const type =
      u.varType ||
      base?.varType ||
      (base?.layerType === 'text' ? 'text' : base?.layerType === 'image' ? 'img' : null);

    const name = u.name || base?.name || base?.key || `layer_${String(psId)}`;
    const x = Number.isFinite(u.x) ? u.x : base?.x;
    const y = Number.isFinite(u.y) ? u.y : base?.y;
    const width = Number.isFinite(u.width) ? u.width : base?.width;
    const height = Number.isFinite(u.height) ? u.height : base?.height;

    if (type === 'text') {
      stats.text += 1;
      const rawAlign = u.align != null ? String(u.align) : '';
      const align = rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right' ? rawAlign : null;
      const rawValue = u.value ?? '';
      const normalizedValue = normalizeTextValue(rawValue);
      if (normalizedValue !== String(rawValue == null ? '' : rawValue) && normalizedValue.indexOf('\r') >= 0) {
        stats.textNewlineNormalized += 1;
      }
      normalized.push({
        varType: 'text',
        psId,
        name,
        x,
        y,
        width,
        height,
        value: normalizedValue,
        align,
      });
      continue;
    }

    if (type === 'img') {
      stats.img += 1;
      const guidePick = u.guidePick && typeof u.guidePick === 'object' ? u.guidePick : null;
      const guidePickLeft = guidePick ? Math.round(Number(guidePick.leftX)) : NaN;
      const guidePickRight = guidePick ? Math.round(Number(guidePick.rightX)) : NaN;
      if (u.imagePath) {
        stats.imgWithPath += 1;
        const rect = getLayerRect(x, y, width, height);
        const manualGuides = resolveManualGuides({ guidePickLeft, guidePickRight, rect });
        const resolvedSrc = resolveImagePath(u.imagePath);
        const rectKey = rect ? `${rect.left},${rect.top},${rect.width},${rect.height}` : 'none';
        const manualKey = manualGuides ? `${manualGuides.leftX},${manualGuides.rightX}` : 'none';

        if (useChannel && channelIndex) {
          const sourceName = String(u.sourceName || '').trim();
          if (!rect) throw new Error('图片变量缺少有效矩形信息');
          if (!manualGuides) throw new Error('图片变量缺少参考线绑定');
          if (!sourceName) throw new Error('图片变量缺少 sourceName');
          const match = matchChannel(sourceName, channelIndex, { modelHint: u.modelHint, angleHint: u.angleHint });
          if (!match) {
            const err = new Error('缺少通道图');
            err.status = 400;
            err.missingChannels = [
              {
                label: String(i),
                sourceName,
                model: pickModel(sourceName),
                angle: pickAngle(sourceName),
                modelHint: u.modelHint != null ? String(u.modelHint) : null,
                angleHint: u.angleHint != null ? String(u.angleHint) : null,
              },
            ];
            err.availableChannels = channelIndex.slice(0, 30).map((c) => c.sourceName);
            err.availableChannelModels = Array.from(new Set(channelIndex.map((c) => c.baseModel).filter(Boolean))).slice(0, 20);
            err.availableChannelAngles = Array.from(new Set(channelIndex.map((c) => c.angle).filter(Boolean))).slice(0, 20);
            err.channelMatchBuild = CHANNEL_MATCH_BUILD;
            throw err;
          }
          const cutoutKey = `${resolvedSrc}||${String(match.filePath)}`;
          const cutoutPngPath = cutoutPathByKey.get(cutoutKey) || null;
          if (!cutoutPngPath || !fileExistsNonEmpty(cutoutPngPath, 2000)) {
            throw new Error('抠图结果缺失');
          }
          const relLeft = Math.round(Number(manualGuides.leftX) - Number(rect.left));
          const relRight = Math.round(Number(manualGuides.rightX) - Number(rect.left));
          if (!Number.isFinite(relLeft) || !Number.isFinite(relRight) || relRight <= relLeft) {
            throw new Error('无效参考线区间');
          }
          dupImageGuideGuard.register({
            imageKey: `${resolvedSrc}||${String(match.filePath)}`,
            guideKey: `${relLeft},${relRight}`,
            psId,
            name,
            id: u?.id ?? base?.id ?? null,
            slotId: u?.slotId ?? base?.slotId ?? null,
          });
          const maskAlignedKey = `${psId}|${cutoutPngPath}|${rectKey}|mask|${relLeft},${relRight}`;
          const cachedAligned = alignedImagePathCache.get(maskAlignedKey);
          if (cachedAligned) {
            normalized.push({
              varType: 'img',
              psId,
              name,
              x,
              y,
              width,
              height,
              imagePath: cachedAligned,
            });
            continue;
          }
          const hash = crypto.createHash('sha1').update(maskAlignedKey).digest('hex').slice(0, 10);
          const fp = path.join(inputsDir, `img_psId_${psId}_mask_${hash}_${Date.now()}.png`);
          await composeCutoutToCanvasPng({
            cutoutPngPath,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
            guideLeftX: relLeft,
            guideRightX: relRight,
            outputPngPath: fp,
          });
          pushTempFile(createdTempFiles, fp);
          alignedImagePathCache.set(maskAlignedKey, fp);
          normalized.push({
            varType: 'img',
            psId,
            name,
            x,
            y,
            width,
            height,
            imagePath: fp,
            sourceName: u.sourceName != null ? String(u.sourceName) : undefined,
          });
          continue;
        }

        dupImageGuideGuard.register({
          imageKey: resolvedSrc,
          guideKey: guideKeyFromManual(manualGuides),
          psId,
          name,
          id: u?.id ?? base?.id ?? null,
          slotId: u?.slotId ?? base?.slotId ?? null,
        });
        const alignedKey = `${psId}|${resolvedSrc}|${rectKey}|${alignmentMode}|${manualKey}`;
        const cachedAligned = alignedImagePathCache.get(alignedKey);
        if (cachedAligned) {
          normalized.push({
            varType: 'img',
            psId,
            name,
            x,
            y,
            width,
            height,
            imagePath: cachedAligned,
            sourceName: u.sourceName != null ? String(u.sourceName) : undefined,
          });
          continue;
        }

        let raw = fileBufferCache.get(resolvedSrc);
        if (!raw) {
          if (!fs.existsSync(resolvedSrc)) throw new Error(`imagePath 不存在: ${resolvedSrc}`);
          raw = fs.readFileSync(resolvedSrc);
          fileBufferCache.set(resolvedSrc, raw);
        }

        const extHint = path.extname(resolvedSrc).replace('.', '') || 'png';
        const fp = isPsdAutoFill
          ? await persistAlignedImageToContentEdge({
            imageBuffer: raw,
            extHint,
            inputsDir,
            filePrefix: `img_psId_${psId}`,
            rect,
            referenceImage,
            backgroundRect,
            guides,
            guideLayers,
            manualGuides,
            canvasWidth,
            canvasHeight,
            debugMeta: { templateId, psId, name },
            disableImageAlignment,
            preScale: preScaleOptions,
            createdTempFiles,
          })
          : await persistAlignedImageFromBuffer({
            imageBuffer: raw,
            extHint,
            inputsDir,
            filePrefix: `img_psId_${psId}`,
            rect,
            referenceImage,
            backgroundRect,
            guides,
            guideLayers,
            manualGuides,
            canvasWidth,
            canvasHeight,
            debugMeta: { templateId, psId, name },
            alignmentMode,
            disableImageAlignment,
            preScale: preScaleOptions,
            createdTempFiles,
          });
        alignedImagePathCache.set(alignedKey, fp);
        normalized.push({
          varType: 'img',
          psId,
          name,
          x,
          y,
          width,
          height,
          imagePath: fp,
          sourceName: u.sourceName != null ? String(u.sourceName) : undefined,
        });
        continue;
      }

      const raw = String(u.value ?? '');
      const parsed = raw.startsWith('data:') ? parseDataUrl(raw) : null;
      const rect = getLayerRect(x, y, width, height);
      const manualGuides = resolveManualGuides({ guidePickLeft, guidePickRight, rect });

      let fp = null;
      if (parsed) {
        const dataKey = crypto.createHash('sha1').update(parsed.buffer).digest('hex');
        dupImageGuideGuard.register({
          imageKey: `data:${String(parsed.mime)};sha1:${dataKey}`,
          guideKey: guideKeyFromManual(manualGuides),
          psId,
          name,
          id: u?.id ?? base?.id ?? null,
          slotId: u?.slotId ?? base?.slotId ?? null,
        });
        stats.imgWithDataUrl += 1;
        fp = isPsdAutoFill
          ? await persistAlignedImageToContentEdge({
            imageBuffer: parsed.buffer,
            extHint: extFromMime(parsed.mime),
            inputsDir,
            filePrefix: `img_psId_${psId}`,
            rect,
            referenceImage,
            backgroundRect,
            guides,
            guideLayers,
            manualGuides,
            canvasWidth,
            canvasHeight,
            debugMeta: { templateId, psId, name },
            disableImageAlignment,
            preScale: preScaleOptions,
            createdTempFiles,
          })
          : await persistAlignedImage({
            parsed,
            inputsDir,
            filePrefix: `img_psId_${psId}`,
            rect,
            referenceImage,
            backgroundRect,
            guides,
            guideLayers,
            manualGuides,
            canvasWidth,
            canvasHeight,
            debugMeta: { templateId, psId, name },
            alignmentMode,
            disableImageAlignment,
            preScale: preScaleOptions,
            createdTempFiles,
          });
      } else if (isRemoteHttpUrl(raw)) {
        dupImageGuideGuard.register({
          imageKey: raw,
          guideKey: guideKeyFromManual(manualGuides),
          psId,
          name,
          id: u?.id ?? base?.id ?? null,
          slotId: u?.slotId ?? base?.slotId ?? null,
        });
        const fetched = await fetchRemoteImageBuffer(
          raw,
          {
            maxBytes: 40 * 1024 * 1024,
            timeoutMs: 12 * 1000,
            maxRedirects: 3,
          },
          fileBufferCache,
        );
        const extHint = extHintFromUrlOrMime({ urlObj: fetched.urlObj, contentType: fetched.contentType });
        fp = isPsdAutoFill
          ? await persistAlignedImageToContentEdge({
            imageBuffer: fetched.buffer,
            extHint,
            inputsDir,
            filePrefix: `img_psId_${psId}`,
            rect,
            referenceImage,
            backgroundRect,
            guides,
            guideLayers,
            manualGuides,
            canvasWidth,
            canvasHeight,
            debugMeta: { templateId, psId, name },
            disableImageAlignment,
            preScale: preScaleOptions,
            createdTempFiles,
          })
          : await persistAlignedImageFromBuffer({
            imageBuffer: fetched.buffer,
            extHint,
            inputsDir,
            filePrefix: `img_psId_${psId}`,
            rect,
            referenceImage,
            backgroundRect,
            guides,
            guideLayers,
            manualGuides,
            canvasWidth,
            canvasHeight,
            debugMeta: { templateId, psId, name },
            alignmentMode,
            disableImageAlignment,
            preScale: preScaleOptions,
            createdTempFiles,
          });
      } else {
        throw new Error(`图片更新缺少有效图片值（psId=${psId}）`);
      }

      normalized.push({
        varType: 'img',
        psId,
        name,
        x,
        y,
        width,
        height,
        imagePath: fp,
      });
      continue;
    }

    throw new Error(`updates 中存在未知 varType（psId=${psId}）`);
  }

  if (duplicatePsIds.length > 0) {
    console.warn('[导出调试] updates 出现重复 psId，将保留后者', { templateId, duplicatePsIds });
  }
  console.info('[导出调试] normalizeClientUpdates 汇总', {
    templateId,
    total: stats.total,
    text: stats.text,
    textNewlineNormalized: stats.textNewlineNormalized,
    img: stats.img,
    imgWithPath: stats.imgWithPath,
    imgWithDataUrl: stats.imgWithDataUrl,
    uniquePsId: seenPsId.size,
  });
  const textItems = normalized.filter((u) => u && u.varType === 'text');
  if (textItems.length > 0) {
    console.info('[导出调试] 文本变量列表', textItems.map((u) => ({
      psId: u.psId,
      name: u.name,
      valueLen: String(u.value ?? '').length,
      valueSnippet: String(u.value ?? '').slice(0, 30),
    })));
  }
  return normalized;
}

/**
 * 将候选列表转换为“全自动变量列表”（全图层解构与重构的第一步）
 * @param {{text?: any[], img?: any[]}} candidates - 候选列表
 * @returns {any[]} 变量列表
 */
function candidatesToAutoVariables(candidates) {
  const textVars = (candidates?.text || []).map((c) => ({
    ...c,
    varType: 'text',
    defaultValue: c?.defaultValue ?? '',
    value: c?.defaultValue ?? '',
  }));
  const imgVars = (candidates?.img || []).map((c) => ({
    ...c,
    varType: 'img',
    defaultValue: c?.defaultValue ?? '',
    value: c?.defaultValue ?? '',
  }));
  return [...textVars, ...imgVars];
}

function normalizeTextValue(value) {
  const raw = value == null ? '' : String(value);
  if (!raw) return '';
  return raw.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
}

function collectArtboardNamesFromChildren(children, outSet) {
  const list = Array.isArray(children) ? children : [];
  for (let i = 0; i < list.length; i += 1) {
    const layer = list[i];
    if (!layer || typeof layer !== 'object') continue;
    if (layer.artboard && typeof layer.artboard === 'object') {
      const name = String(layer.name || '').trim();
      if (name) outSet.add(name);
    }
    if (Array.isArray(layer.children) && layer.children.length > 0) {
      collectArtboardNamesFromChildren(layer.children, outSet);
    }
  }
}

function extractArtboardNamesFromPsd(psd) {
  const outSet = new Set();
  collectArtboardNamesFromChildren(psd?.children, outSet);
  return Array.from(outSet);
}

function detectTemplateHasArtboard({ manifest, psdPath }) {
  if (manifest && manifest.isArtboardTemplate === true) return true;
  if (Array.isArray(manifest?.artboardNames) && manifest.artboardNames.length > 0) return true;
  if (!psdPath || !fs.existsSync(psdPath)) return false;
  try {
    const buf = fs.readFileSync(psdPath);
    const psd = readPsd(buf, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
      logMissingFeatures: false,
    });
    const names = extractArtboardNamesFromPsd(psd);
    return names.length > 0;
  } catch {
    return false;
  }
}

export default class PhotoshopIngestService {
  constructor({ outputRoot }) {
    this.outputRoot = outputRoot;
    this.vbsPath = path.resolve(__dirname, '../photoshop/run_job.vbs');
    this.jsxPath = path.resolve(__dirname, '../photoshop/render_clean_plate.jsx');
    this.exportJsxPath = path.resolve(__dirname, '../photoshop/render_export.jsx');
    configureResidentRuntime({ outputRoot: this.outputRoot, vbsPath: this.vbsPath, quitJsxPath: this.exportJsxPath });
  }

  getRuntimeDiagnostics() {
    return {
      outputRoot: this.outputRoot,
      vbsPath: this.vbsPath,
      exportJsxPath: this.exportJsxPath,
      exportJsxScriptBuild: readJsxScriptBuild(this.exportJsxPath),
      residentModeEnabled: residentRuntime.enabled === true,
    };
  }

  async ensureTemplatePreview(templateId) {
    if (!isSafeTemplateId(templateId)) {
      throw new Error('无效的 templateId');
    }
    const jobDir = path.join(this.outputRoot, 'templates', templateId);
    const psdPath = path.join(jobDir, 'source.psd');
    const referencePath = path.join(jobDir, 'reference.png');
    if (fileExistsNonEmpty(referencePath)) return { ok: true, source: 'existing' };
    if (!fs.existsSync(psdPath)) throw new Error('模板PSD不存在');

    const buffer = fs.readFileSync(psdPath);
    const refJobPath = path.join(jobDir, `job_reference_${Date.now()}.json`);
    const refResultPath = path.join(jobDir, `result_reference_${Date.now()}.json`);
    const refJob = {
      id: templateId,
      name: 'template.psd',
      psdPath,
      outputPngPath: referencePath,
      hideLayerNames: [],
      quitAfter: !residentRuntime.enabled,
      resultPath: refResultPath,
    };
    fs.writeFileSync(refJobPath, JSON.stringify(refJob, null, 2), 'utf8');
    try {
      await runPhotoshopCommand({
        vbsPath: this.vbsPath,
        jsxPath: this.jsxPath,
        jobPath: refJobPath,
        timeoutMs: 5 * 60 * 1000,
        label: `ensure-reference:${templateId}`,
      });
      if (!fileExistsNonEmpty(referencePath)) {
        throw new Error('Photoshop 未生成 reference.png');
      }
      return { ok: true, source: 'photoshop' };
    } catch (err) {
      const fallback = await renderReferencePngFallback({ buffer, outputPngPath: referencePath });
      if (!fileExistsNonEmpty(referencePath)) {
        throw new Error(err?.message || '预览生成失败');
      }
      return { ok: true, source: fallback?.source || 'fallback' };
    }
  }

  async ingestPsd(buffer, originalName) {
    const id = crypto.randomBytes(8).toString('hex');
    const jobDir = path.join(this.outputRoot, 'templates', id);
    safeMkdir(jobDir);

    const psdPath = path.join(jobDir, 'source.psd');
    const backdropPath = path.join(jobDir, 'backdrop.png');
    const referencePath = path.join(jobDir, 'reference.png');
    const jobPath = path.join(jobDir, 'job.json');
    const resultPath = path.join(jobDir, 'result.json');
    const manifestPath = path.join(jobDir, 'manifest.json');

    const psdBuffer = Buffer.from(buffer);
    fs.writeFileSync(psdPath, psdBuffer);

    console.log(`开始解析 PSD: ${originalName}, 大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
    let psd;
    try {
      psd = readPsd(Buffer.from(buffer), {
        skipLayerImageData: true,
        skipCompositeImageData: true,
        skipThumbnail: true,
        logMissingFeatures: false,
      });
      console.log('PSD 解析成功，图层数:', psd.children?.length);
    } catch (parseErr) {
      console.error('PSD 解析异常:', parseErr);
      const msg = parseErr.message || String(parseErr);
      throw new Error(`PSD 解析失败: ${msg}`);
    }

    let meta;
    try {
      meta = extractTemplateMeta(psd);
      console.log('元数据提取成功，变量数:', meta.variables.length);
    } catch (metaErr) {
      console.error('元数据提取异常:', metaErr);
      throw new Error(`元数据提取失败: ${metaErr.message}`);
    }

    const initialTagged = meta.variables.length > 0;
    const initialCandidateImgCount = Array.isArray(meta?.candidates?.img) ? meta.candidates.img.length : 0;
    if (!initialTagged && initialCandidateImgCount <= 1) {
      try {
        const psd2 = readPsd(Buffer.from(buffer), {
          skipLayerImageData: false,
          skipCompositeImageData: true,
          skipThumbnail: true,
          logMissingFeatures: false,
          useImageData: true,
          useCanvas: false,
        });
        const meta2 = extractTemplateMeta(psd2);
        const tagged2 = meta2.variables.length > 0;
        const cand2 = Array.isArray(meta2?.candidates?.img) ? meta2.candidates.img.length : 0;
        if (tagged2 || cand2 > initialCandidateImgCount) {
          meta = meta2;
          console.log('元数据提取已增强（包含更多图层像素信息），变量数:', meta.variables.length);
        }
      } catch (e) {
        void e;
      }
    }

    const isTaggedMode = meta.variables.length > 0;
    const autoVariables = !isTaggedMode ? candidatesToAutoVariables(meta.candidates) : [];
    const variablesForClient = isTaggedMode ? meta.variables : autoVariables;

    const hideLayerNames = variablesForClient.map((v) => v.name).filter(Boolean);
    const warnings = [...(meta.warnings || [])];
    if (!isTaggedMode && variablesForClient.length > 0) {
      warnings.push(`未检测到变量标记，已自动将 ${variablesForClient.length} 个图层设为变量`);
    }

    const artboardNames = extractArtboardNamesFromPsd(psd);
    const isArtboardTemplate = artboardNames.length > 0;

    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          id,
          name: originalName || 'template.psd',
          originalPsdName: originalName || 'template.psd',
          width: meta.width,
          height: meta.height,
          variables: variablesForClient,
          backgroundRect: meta.backgroundRect || null,
          guides: meta.guides || null,
          guideLayers: meta.guideLayers || null,
          isArtboardTemplate,
          artboardNames,
          isUserSaved: true,
          savedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );

    let renderer = 'photoshop';
    try {
      const refJobPath = path.join(jobDir, 'job_reference.json');
      const refResultPath = path.join(jobDir, 'result_reference.json');
      const refJob = {
        id,
        name: originalName || 'template.psd',
        psdPath,
        outputPngPath: referencePath,
        hideLayerNames: [],
        quitAfter: !residentRuntime.enabled,
        resultPath: refResultPath,
      };
      fs.writeFileSync(refJobPath, JSON.stringify(refJob, null, 2), 'utf8');

      console.log('Attempting to launch Photoshop via VBS:', this.vbsPath);
      await runPhotoshopCommand({
        vbsPath: this.vbsPath,
        jsxPath: this.jsxPath,
        jobPath: refJobPath,
        timeoutMs: 5 * 60 * 1000,
        label: `ingest-reference:${id}`,
      });
      if (!fileExistsNonEmpty(referencePath)) {
        throw new Error('Photoshop 未生成 reference.png');
      }

      const backdropJob = {
        id,
        name: originalName || 'template.psd',
        psdPath,
        outputPngPath: backdropPath,
        hideLayerNames,
        quitAfter: !residentRuntime.enabled,
        resultPath,
      };
      fs.writeFileSync(jobPath, JSON.stringify(backdropJob, null, 2), 'utf8');
      await runPhotoshopCommand({
        vbsPath: this.vbsPath,
        jsxPath: this.jsxPath,
        jobPath,
        timeoutMs: 5 * 60 * 1000,
        label: `ingest-backdrop:${id}`,
      });
      if (!fileExistsNonEmpty(backdropPath)) {
        throw new Error('Photoshop 未生成 backdrop.png');
      }
    } catch (err) {
      console.error('Photoshop automation failed:', err.message);
      if (err.stdout) console.error('VBS Output:', err.stdout.toString());
      if (err.stderr) console.error('VBS Error:', err.stderr.toString());
      renderer = 'unavailable';
      try {
        const fallback = await renderReferencePngFallback({ buffer: psdBuffer, outputPngPath: referencePath });
        if (fileExistsNonEmpty(referencePath)) {
          renderer = fallback?.source === 'sharp' ? 'sharp' : 'agpsd';
          warnings.push(`预览图生成已降级为 ${renderer === 'sharp' ? 'sharp' : 'ag-psd'} 合成（Photoshop 未能导出预览图）`);
        }
      } catch (fallbackErr) {
        console.error('ag-psd preview fallback failed:', fallbackErr?.message || String(fallbackErr));
      }
    }

    const backdropExists = fs.existsSync(backdropPath);
    const referenceExists = fs.existsSync(referencePath);

    // 导入完成后自动清理 images 文件夹中的旧参考图
    try {
      const imagesDir = path.join(jobDir, 'images');
      if (fs.existsSync(imagesDir)) {
        const preservedNames = new Set(['reference.png', 'backdrop.png']);
        const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
        const files = fs.readdirSync(imagesDir);
        let deletedCount = 0;

        for (const fileName of files) {
          const lowerName = fileName.toLowerCase();
          // 保留 reference.png 和 backdrop.png
          if (preservedNames.has(lowerName)) continue;

          // 只清理图片文件
          const ext = path.extname(lowerName);
          if (!imageExtensions.has(ext)) continue;

          const filePath = path.join(imagesDir, fileName);
          try {
            fs.unlinkSync(filePath);
            deletedCount += 1;
            console.log(`[导入清理] 已删除旧参考图: ${id}/images/${fileName}`);
          } catch (unlinkErr) {
            console.warn(`[导入清理] 删除文件失败: ${id}/images/${fileName}`, unlinkErr);
          }
        }

        if (deletedCount > 0) {
          console.log(`[导入清理] 模板 ${id} images 清理完成: 删除 ${deletedCount} 个旧参考图`);
        }
      }
    } catch (cleanupErr) {
      // 清理失败不影响导入流程,仅记录警告
      console.warn(`[导入清理] 模板 ${id} images 清理失败:`, cleanupErr);
    }

    return {
      id,
      renderer,
      width: meta.width,
      height: meta.height,
      variables: variablesForClient,
      candidates: meta.candidates,
      warnings,
      backdropUrl: backdropExists ? `/templates/${id}/backdrop.png` : null,
      referenceUrl: referenceExists ? `/templates/${id}/reference.png` : null,
    };
  }

  /**
   * 使用 Photoshop 回写变量并导出（不修改原始 PSD，导出仅来自副本）
   * @param {object} payload - 参数
   * @param {string} payload.templateId - 模板ID
   * @param {Record<string, any>} payload.values - 变量值，key 为变量 id
   * @param {Array<object>} payload.variables - 可选：直接提供变量定义列表（覆盖 manifest）
   * @param {Array<object>} payload.updates - 可选：直接提供基于 psId 的更新指令（优先生效）
   * @param {string} payload.format - png/jpeg
   * @param {number} payload.quality - 1-100
   * @param {boolean} payload.dryRun - 可选：仅生成 job 与输入文件，不执行 Photoshop
   * @returns {Promise<{url: string, outputPath: string}>}
   */
  async exportTemplate({
    templateId,
    values,
    variables: clientVariables,
    updates: clientUpdates,
    format = 'png',
    quality = 100,
    dryRun = false,
    isPsdAutoFill = false,
    allowDupImageGuideMismatch = false,
  }) {
    if (!isSafeTemplateId(templateId)) {
      throw new Error('无效的 templateId');
    }

    const jobDir = path.join(this.outputRoot, 'templates', templateId);
    const psdPath = path.join(jobDir, 'source.psd');
    const manifestPath = path.join(jobDir, 'manifest.json');
    if (!fs.existsSync(psdPath)) throw new Error('模板PSD不存在');
    
    // 如果客户端没传 variables，才检查 manifest
    if ((!clientVariables || clientVariables.length === 0) && !fs.existsSync(manifestPath)) {
        throw new Error('模板清单不存在');
    }
    
    let canvasWidth = null;
    let canvasHeight = null;
    let backgroundRect = null;
    let guides = null;
    let guideLayers = null;
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        canvasWidth = manifest?.width ?? null;
        canvasHeight = manifest?.height ?? null;
        backgroundRect = manifest?.backgroundRect ?? null;
        guides = manifest?.guides ?? null;
        guideLayers = manifest?.guideLayers ?? null;
      } catch {
        canvasWidth = null;
        canvasHeight = null;
        backgroundRect = null;
        guides = null;
        guideLayers = null;
      }
    }
    if (!backgroundRect) {
      backgroundRect = tryBackfillBackgroundRect({ psdPath, manifestPath, canvasWidth, canvasHeight });
    }
    const needGuides = !guides || !Array.isArray(guides.vertical) || guides.vertical.length === 0;
    const needGuideLayers = !guideLayers || !Array.isArray(guideLayers.all) || guideLayers.all.length === 0 || !Number.isFinite(guideLayers.leftX) || !Number.isFinite(guideLayers.rightX);
    if (needGuides || needGuideLayers) {
      const backfill = tryBackfillGuides({ psdPath, manifestPath, canvasWidth, canvasHeight });
      if (backfill) {
        guides = backfill.guides || guides;
        guideLayers = backfill.guideLayers || guideLayers;
      }
    }

    let variables = [];
    if (Array.isArray(clientVariables) && clientVariables.length > 0) {
      variables = clientVariables;
    } else if (Array.isArray(manifest?.variables)) {
      variables = manifest.variables;
    }
    const renameVariables = Array.isArray(manifest?.variables) && manifest.variables.length > 0
      ? manifest.variables
      : variables;

    const exportsDir = path.join(jobDir, 'exports');
    const inputsDir = path.join(jobDir, 'inputs');
    safeMkdir(exportsDir);
    safeMkdir(inputsDir);
    const keepTempFiles = process.env.KEEP_EXPORT_TEMP_FILES === 'true';
    const createdTempFiles = [];
    const referenceImage = loadReferenceImage(jobDir);
    const expectedScriptBuild = readJsxScriptBuild(this.exportJsxPath);
    console.info('[对齐调试] 背景底图层 bounds', { templateId, backgroundRect: backgroundRect || null });
    console.info('[对齐调试] 参考图加载结果', {
      templateId,
      referencePath: referenceImage?.path || null,
      referenceSource: referenceImage?.source || null,
      hasBackdrop: Boolean(referenceImage?.backdropBuffer),
    });
    console.info('[导出调试] JSX 期望版本', {
      templateId,
      exportJsxPath: this.exportJsxPath,
      expectedScriptBuild: expectedScriptBuild || null,
    });

    const safeFormat = normalizeExportFormat(format);
    const safeQuality = normalizeExportQuality(quality);
    console.info('[导出调试] 请求摘要', {
      templateId,
      format: safeFormat,
      quality: safeQuality,
      clientUpdates: Array.isArray(clientUpdates) ? clientUpdates.length : 0,
      values: Object.keys(values || {}).length,
      variables: variables.length,
    });
    const outExt = exportExtFromFormat(safeFormat);
    const outName = `export_${Date.now()}.${outExt}`;
    const outputPath = path.join(exportsDir, outName);
    const jobPath = path.join(exportsDir, `job_${Date.now()}.json`);
    const resultPath = path.join(exportsDir, `result_${Date.now()}.json`);

    const hasClientUpdates = Array.isArray(clientUpdates) && clientUpdates.length > 0;
    const shouldUseContentEdgeAlignment =
      isPsdAutoFill === true &&
      hasClientUpdates &&
      (clientUpdates || []).some((u) => String(u?.varType || '').toLowerCase() === 'img');
    const hasArtboardTemplate = detectTemplateHasArtboard({ manifest, psdPath });
    const enableArtboardStableExport = shouldUseContentEdgeAlignment && hasArtboardTemplate;
    console.info('[导出调试] 画板稳态开关', {
      templateId,
      isPsdAutoFill: isPsdAutoFill === true,
      hasClientUpdates,
      shouldUseContentEdgeAlignment,
      hasArtboardTemplate,
      enableArtboardStableExport,
    });
    const preScale = shouldUseContentEdgeAlignment
      ? { enabled: true, triggerScaleFactor: 3, maxScaleFactor: 3, maxPixels: 36000000 }
      : null;
    const updates = hasClientUpdates
      ? await normalizeClientUpdates({
        templateId,
        clientUpdates,
        variables,
        inputsDir,
        allowedImagePathRoots: [path.join(this.outputRoot, 'uploads'), path.join(this.outputRoot, 'assets', 'images')],
        referenceImage,
        backgroundRect,
        guides,
        guideLayers,
        canvasWidth,
        canvasHeight,
        disableImageAlignment: false,
        isPsdAutoFill: shouldUseContentEdgeAlignment,
        allowDupImageGuideMismatch: allowDupImageGuideMismatch === true,
        preScale,
        createdTempFiles,
      })
      : [];
    const updateStats = { total: updates.length, text: 0, img: 0, imgWithPath: 0, imgMissingRect: 0 };
    for (let i = 0; i < updates.length; i += 1) {
      const u = updates[i];
      if (!u) continue;
      const type = String(u.varType || '').toLowerCase();
      if (type === 'text') updateStats.text += 1;
      if (type === 'img') {
        updateStats.img += 1;
        if (u.imagePath) updateStats.imgWithPath += 1;
        const w = Number(u.width);
        const h = Number(u.height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) updateStats.imgMissingRect += 1;
      }
    }

    if (!hasClientUpdates) {
      for (const v of variables) {
        if (!values || !Object.prototype.hasOwnProperty.call(values, v.id)) {
          continue;
        }

        console.log(
          `[Ingest Debug] Processing update for variable: ${v.key} (ID: ${v.id}, psId: ${v.psId}, varType: ${v.varType}, layerType: ${v.layerType})`,
        );
        const nextValue = values[v.id];

        const type =
          v.varType || (v.layerType === 'text' ? 'text' : v.layerType === 'image' ? 'img' : null);

        if (type === 'text') {
          updates.push({
            varType: 'text',
            psId: v.psId,
            name: v.name,
            x: v.x,
            y: v.y,
            width: v.width,
            height: v.height,
            value: String(nextValue ?? ''),
          });
          console.log(`[Ingest Debug] Added TEXT update for ${v.key}`);
        } else if (type === 'img') {
          let imagePath = null;
          const raw = String(nextValue ?? '');
          const parsed = raw.startsWith('data:') ? parseDataUrl(raw) : null;
          if (parsed) {
            const rect = getLayerRect(v.x, v.y, v.width, v.height);
            imagePath = await persistAlignedImage({
              parsed,
              inputsDir,
              filePrefix: `img_${v.id}`,
              rect,
              referenceImage,
              backgroundRect,
              guides,
              guideLayers,
              canvasWidth,
              canvasHeight,
              debugMeta: { templateId, psId: v.psId, name: v.name || v.key || v.id },
              disableImageAlignment: false,
              createdTempFiles,
            });
          } else {
            console.log(`[Ingest Debug] Image value is not base64 for ${v.key}: ${raw.substring(0, 50)}...`);
          }

          if (imagePath) {
            updates.push({
              varType: 'img',
              psId: v.psId,
              name: v.name,
              x: v.x,
              y: v.y,
              width: v.width,
              height: v.height,
              imagePath,
            });
            console.log(`[Ingest Debug] Added IMG update for ${v.key}`);
          } else {
            console.log(`[Ingest Debug] Skipped IMG update for ${v.key} (No valid image path)`);
          }
        } else {
          console.warn(`[Ingest Debug] Unknown variable type for ${v.key}: ${v.varType} / ${v.layerType}`);
        }
      }
    }

    console.log(
      '[Ingest Debug] Export request received.',
      'Mode:',
      hasClientUpdates ? 'client-updates' : 'values',
      'Variables:',
      variables.length,
      'ClientUpdates:',
      Array.isArray(clientUpdates) ? clientUpdates.length : 0,
      'Values:',
      Object.keys(values || {}).length,
      'FinalUpdates:',
      updates.length,
    );

    const job = {
      templateId,
      psdPath,
      outputPath,
      format: safeFormat,
      quality: safeQuality,
      updates,
      artboardRenames: buildArtboardRenameMap({ variables: renameVariables, updates }),
      preserveArtboardTextPosition: enableArtboardStableExport,
      mode: 'single',
      quitAfter: !residentRuntime.enabled,
      resultPath,
    };

    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');
    console.info('[debug][artboardRenames]', JSON.stringify(job.artboardRenames));
    console.info('[导出调试] 任务文件', {
      templateId,
      jobPath,
      resultPath,
      jsxLogPath: `${jobPath}.log`,
      updates: updateStats,
      preserveArtboardTextPosition: enableArtboardStableExport,
    });

    if (dryRun) {
      return {
        url: null,
        outputPath,
        dryRun: true,
        jobPath,
        updatesCount: updates.length,
        debug: {
          hasArtboardTemplate,
          shouldUseContentEdgeAlignment,
          preserveArtboardTextPosition: enableArtboardStableExport,
        },
      };
    }

    try {
      const isPsdLike = safeFormat === 'psd' || safeFormat === 'psb';
      try {
        await runPhotoshopCommand({
          vbsPath: this.vbsPath,
          jsxPath: this.exportJsxPath,
          jobPath,
          timeoutMs: 10 * 60 * 1000,
          label: `export:${templateId}`,
        });
      } catch (err) {
        const errMsg = errorToText(err) || err.message || String(err);
        console.error('Photoshop Export Failed:', errMsg);
        const e = new Error(`Photoshop 脚本执行失败: ${errMsg}`);
        e.jobPath = jobPath;
        e.resultPath = resultPath;
        throw e;
      }

      let scriptBuild = null;
      let warnings = [];
      let outputFormat = null;
      let resultOutputPath = null;
      const loadResult = () => {
        if (!fs.existsSync(resultPath)) return null;
        const result = parseJsonSafely(fs.readFileSync(resultPath, 'utf8'));
        if (!result) {
          console.warn('Failed to parse result.json');
          return null;
        }
        scriptBuild = result?.scriptBuild != null ? String(result.scriptBuild) : null;
        assertScriptBuildMatch({
          phase: 'single_export',
          templateId,
          jsxPath: this.exportJsxPath,
          expectedScriptBuild,
          actualScriptBuild: scriptBuild,
          jobPath,
          resultPath,
        });
        warnings = Array.isArray(result?.warnings) ? result.warnings.map((w) => String(w)) : [];
        outputFormat = result?.outputFormat != null ? String(result.outputFormat) : null;
        resultOutputPath = result?.outputPath != null ? String(result.outputPath) : null;
        console.info('[导出调试] Photoshop 结果摘要', {
          templateId,
          scriptBuild,
          updatedText: Number(result?.updatedText) || 0,
          updatedImage: Number(result?.updatedImage) || 0,
          errors: Array.isArray(result?.errors) ? result.errors.length : 0,
          outputPath: result?.outputPath || outputPath,
        });
        if (result.errors && result.errors.length > 0) {
          const errDetails = result.errors.map(e => `${e.name || 'Unknown'}: ${e.message}`).join('; ');
          console.error('Photoshop Layer Updates Failed:', errDetails);
          const psbUnsupported = /psb_save_options_unsupported/i.test(errDetails);
          const msg = psbUnsupported
            ? `当前 Photoshop 环境不支持导出 PSB（大文档）。请升级 Photoshop，或改用 PNG/JPG 导出。细节：${errDetails}`
            : `部分图层更新失败: ${errDetails}`;
          const e = new Error(msg);
          e.jobPath = jobPath;
          e.resultPath = resultPath;
          e.scriptBuild = scriptBuild;
          throw e;
        }
        return result;
      };

      if (!fs.existsSync(resultPath)) {
        await waitForFirstExistingPath({
          fs,
          candidates: [resultPath],
          maxWaitMs: isPsdLike ? 90000 : 20000,
          pollIntervalMs: 150,
          minBytes: 2,
        });
      }
      loadResult();

      const resolveEffectiveOutputPath = async () => {
        const candidates = buildOutputLookupCandidates({
          outputRoot: this.outputRoot,
          candidates: [resultOutputPath, outputPath],
        }).filter((p) => isPathInsideDir(exportsDir, p));
        let effectiveOutputPath = pickFirstExistingPath({ fs, candidates });
        if (!effectiveOutputPath) {
          effectiveOutputPath = await waitForFirstExistingPath({
            fs,
            candidates,
            maxWaitMs: isPsdLike ? 120000 : 20000,
            pollIntervalMs: 120,
            minBytes: isPsdLike ? 1024 : 1,
          });
          if (effectiveOutputPath) {
            console.warn('[导出调试] 输出文件存在延迟，已通过轮询确认落盘', {
              templateId,
              format: safeFormat,
              outputPath: effectiveOutputPath,
              resultPath,
              jobPath,
            });
          }
        }
        return { effectiveOutputPath, candidates };
      };

      let { effectiveOutputPath, candidates } = await resolveEffectiveOutputPath();
      if (!effectiveOutputPath && !fs.existsSync(resultPath)) {
        console.warn('[warn][export][single] 首轮导出未产出 result 与输出文件，触发强制重试', {
          templateId,
          format: safeFormat,
          outputPath,
          jobPath,
          resultPath,
        });
        const retryJob = { ...job, quitAfter: true };
        fs.writeFileSync(jobPath, JSON.stringify(retryJob, null, 2), 'utf8');
        await runPhotoshopCommand({
          vbsPath: this.vbsPath,
          jsxPath: this.exportJsxPath,
          jobPath,
          timeoutMs: 10 * 60 * 1000,
          label: `export:${templateId}:retry`,
        });
        if (!fs.existsSync(resultPath)) {
          await waitForFirstExistingPath({
            fs,
            candidates: [resultPath],
            maxWaitMs: isPsdLike ? 90000 : 20000,
            pollIntervalMs: 150,
            minBytes: 2,
          });
        }
        loadResult();
        ({ effectiveOutputPath, candidates } = await resolveEffectiveOutputPath());
      }

      if (!effectiveOutputPath) {
        console.error('[error][export][single] 未解析到输出文件', {
          templateId,
          format: safeFormat,
          outputPath,
          resultOutputPath,
          candidates,
          jobPath,
          resultPath,
        });
        if (safeFormat !== 'psd' && safeFormat !== 'psb') {
          const imagesDir = path.join(exportsDir, 'images');
          if (fs.existsSync(imagesDir)) {
            const slices = fs.readdirSync(imagesDir).filter(f => f.startsWith(outName.replace(/\.(png|jpg|jpeg)$/, '')));
            if (slices.length > 0) {
              return {
                url: `/templates/${templateId}/exports/images/${slices[0]}`,
                outputPath: path.join(imagesDir, slices[0]),
              };
            }
          }
        }

        const e = new Error('Photoshop 导出失败：未生成输出文件');
        e.jobPath = jobPath;
        e.resultPath = resultPath;
        e.scriptBuild = scriptBuild;
        throw e;
      }

      const url = buildTemplateFileUrl({ outputRoot: this.outputRoot, templateId, absPath: effectiveOutputPath });
      if (!url) {
        const e = new Error('Photoshop 导出失败：输出路径不安全');
        e.jobPath = jobPath;
        e.resultPath = resultPath;
        e.scriptBuild = scriptBuild;
        throw e;
      }
      const ext = path.extname(effectiveOutputPath).replace('.', '').toLowerCase();
      const formatUsed = outputFormat || (ext === 'psb' ? 'psb' : ext === 'psd' ? 'psd' : safeFormat);

      // JPEG 后处理：用 Sharp 重新编码去除 XMP 元数据
      // 策略：去XMP + 加极微弱噪声(±1)增加文件熵值，满足平台≥200KB要求
      const MIN_JPG_SIZE = 200 * 1024;
      if ((formatUsed === 'jpeg' || ext === 'jpg' || ext === 'jpeg') && fs.existsSync(effectiveOutputPath)) {
        try {
          const origSize = fs.statSync(effectiveOutputPath).size;
          console.info('[info][export][single] XMP strip START:', templateId, 'orig:', Math.round(origSize / 1024), 'KB');
          const tmpPath = effectiveOutputPath + '.strip.tmp';
          
          // 步骤1: 去XMP，quality=100
          await sharp(effectiveOutputPath)
            .jpeg({ quality: 100, mozjpeg: false, optimiseCoding: false, trellisQuantisation: false, overshootDeringing: false, optimiseScans: false, chromaSubsampling: '4:4:4' })
            .toFile(tmpPath);
          
          let currentSize = fs.statSync(tmpPath).size;
          console.info('[info][export][single] After XMP strip:', templateId, Math.round(currentSize / 1024), 'KB');
          
          // 步骤2: 如果 < 200KB，加噪声增加熵值
          if (currentSize < MIN_JPG_SIZE) {
            const { data: rawData, info } = await sharp(tmpPath).raw().toBuffer({ resolveWithObject: true });
            const noisyData = Buffer.alloc(rawData.length);
            for (let i = 0; i < rawData.length; i++) {
              const noise = Math.random() > 0.5 ? 1 : -1;
              noisyData[i] = Math.min(255, Math.max(0, rawData[i] + noise));
            }
            const noisyPath = effectiveOutputPath + '.noisy.tmp';
            await sharp(noisyData, { raw: { width: info.width, height: info.height, channels: info.channels } })
              .jpeg({ quality: 100, mozjpeg: false, optimiseCoding: false, chromaSubsampling: '4:4:4' })
              .toFile(noisyPath);
            const noisySize = fs.statSync(noisyPath).size;
            console.info('[info][export][single] After noise:', templateId, Math.round(noisySize / 1024), 'KB');
            fs.renameSync(noisyPath, effectiveOutputPath);
            try { fs.unlinkSync(tmpPath); } catch { /* best effort cleanup */ }
            warnings.push('xmp_stripped_noise_added');
          } else {
            fs.renameSync(tmpPath, effectiveOutputPath);
            warnings.push('xmp_stripped');
          }
          console.info('[info][export][single] XMP strip DONE:', templateId, Math.round(fs.statSync(effectiveOutputPath).size / 1024), 'KB');
        } catch (stripErr) {
          console.error('[error][export][single] XMP strip FAILED:', templateId, stripErr.message, stripErr.stack);
        }
      }

      // 读取 ExtendScript 日志（包含画板重命名诊断）
      let jsxLogContent = null;
      try {
        const jsxLogPath0 = jobPath + '.log';
        if (fs.existsSync(jsxLogPath0)) {
          jsxLogContent = fs.readFileSync(jsxLogPath0, 'utf8');
        }
      } catch { /* 日志读取失败不影响导出结果 */ }

      return {
        url,
        outputPath: effectiveOutputPath,
        requestFormat: safeFormat,
        formatUsed,
        warnings,
        scriptBuild,
        expectedScriptBuild: expectedScriptBuild || null,
        extendScriptLog: jsxLogContent,
        jobPath,
      };
    } finally {
      cleanupTempFilesInDir({ templateId, dir: inputsDir, files: createdTempFiles, keepTempFiles });
    }
  }

  async exportTemplateBatch({
    templateId,
    variables: clientVariables,
    tasks,
    format = 'png',
    quality = 100,
    channels,
    useChannelMaskAlignment = false,
    dryRun = false,
  }) {
    if (!isSafeTemplateId(templateId)) {
      throw new Error('无效的 templateId');
    }
    const list = Array.isArray(tasks) ? tasks : [];
    if (list.length === 0) {
      throw new Error('tasks 参数无效');
    }
    if (list.length > 200) {
      throw new Error('tasks 过多（最多 200 条）');
    }
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i] || {};
      const updates = Array.isArray(t.updates) ? t.updates : [];
      const imgUpdates = updates.filter((u) => u && String(u.varType || '').toLowerCase() === 'img');
      if (imgUpdates.length !== 1) {
        throw new Error('合并PSD仅支持每张产品图对应 1 个图片变量（请在前端只选择 1 个图片变量）');
      }
    }

    const jobDir = path.join(this.outputRoot, 'templates', templateId);
    const psdPath = path.join(jobDir, 'source.psd');
    const manifestPath = path.join(jobDir, 'manifest.json');
    if (!fs.existsSync(psdPath)) throw new Error('模板PSD不存在');
    if ((!clientVariables || clientVariables.length === 0) && !fs.existsSync(manifestPath)) {
      throw new Error('模板清单不存在');
    }

    let canvasWidth = null;
    let canvasHeight = null;
    let backgroundRect = null;
    let guides = null;
    let guideLayers = null;
    let templateName = null;
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        templateName = manifest?.originalPsdName || manifest?.name || null;
        canvasWidth = manifest?.width ?? null;
        canvasHeight = manifest?.height ?? null;
        backgroundRect = manifest?.backgroundRect ?? null;
        guides = manifest?.guides ?? null;
        guideLayers = manifest?.guideLayers ?? null;
      } catch {
        canvasWidth = null;
        canvasHeight = null;
        backgroundRect = null;
        guides = null;
        guideLayers = null;
      }
    }
    if (!backgroundRect) {
      backgroundRect = tryBackfillBackgroundRect({ psdPath, manifestPath, canvasWidth, canvasHeight });
    }
    const needGuides = !guides || !Array.isArray(guides.vertical) || guides.vertical.length === 0;
    const needGuideLayers = !guideLayers || !Array.isArray(guideLayers.all) || guideLayers.all.length === 0 || !Number.isFinite(guideLayers.leftX) || !Number.isFinite(guideLayers.rightX);
    if (needGuides || needGuideLayers) {
      const backfill = tryBackfillGuides({ psdPath, manifestPath, canvasWidth, canvasHeight });
      if (backfill) {
        guides = backfill.guides || guides;
        guideLayers = backfill.guideLayers || guideLayers;
      }
    }

    let variables = [];
    if (Array.isArray(clientVariables) && clientVariables.length > 0) {
      variables = clientVariables;
    } else if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      variables = Array.isArray(manifest?.variables) ? manifest.variables : [];
    }

    const exportsDir = path.join(jobDir, 'exports');
    const inputsDir = path.join(jobDir, 'inputs');
    safeMkdir(exportsDir);
    safeMkdir(inputsDir);
    const keepTempFiles = process.env.KEEP_EXPORT_TEMP_FILES === 'true';
    const createdTempFiles = [];
    const expectedScriptBuild = readJsxScriptBuild(this.exportJsxPath);
    const referenceImage = loadReferenceImage(jobDir);
    console.info('[对齐调试] 背景底图层 bounds', { templateId, backgroundRect: backgroundRect || null });
    console.info('[导出调试] JSX 期望版本', {
      templateId,
      exportJsxPath: this.exportJsxPath,
      expectedScriptBuild: expectedScriptBuild || null,
    });

    const batchDir = `batch_${Date.now()}`;
    const batchFsDir = path.join(exportsDir, batchDir);
    safeMkdir(batchFsDir);

    const jobPath = path.join(exportsDir, `job_batch_${Date.now()}.json`);
    const resultPath = path.join(exportsDir, `result_batch_${Date.now()}.json`);

    const defaultFormat = normalizeExportFormat(format);
    const defaultQuality = normalizeExportQuality(quality);
    const isPngNamedTemplate = typeof templateName === 'string' && /png/i.test(templateName);

    const fileBufferCache = new Map();
    const alignedImagePathCache = new Map();
    const cutoutJsxPath = path.join(__dirname, '../photoshop/cutout_batch.jsx');

    const jobTasks = [];
    let imgUpdatesTotal = 0;
    let imgUpdatesMissingRect = 0;
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i] || {};
      const label = t.label != null ? String(t.label) : String(i);
      const taskFormat = normalizeExportFormat(t.format != null ? t.format : defaultFormat);
      const taskQuality = normalizeExportQuality(t.quality != null ? t.quality : defaultQuality);
      const needTransparentPsdCutout = isPngNamedTemplate && (taskFormat === 'psd' || taskFormat === 'psb');
      const taskUseChannelMaskAlignment = needTransparentPsdCutout ? true : useChannelMaskAlignment === true;
      if (needTransparentPsdCutout && (!Array.isArray(channels) || channels.length === 0)) {
        const err = new Error('PNG 模板导出 PSD 需要上传通道 TGA');
        err.status = 400;
        throw err;
      }
      const ext = exportExtFromFormat(taskFormat);
      const outName = buildBatchOutputName(i, label, ext);
      const outputPath = path.join(batchFsDir, outName);

      const clientUpdates = Array.isArray(t.updates) ? t.updates : [];
      const updates = await normalizeClientUpdates({
        templateId,
        clientUpdates,
        variables,
        inputsDir,
        allowedImagePathRoots: [path.join(this.outputRoot, 'uploads'), path.join(this.outputRoot, 'assets', 'images')],
        referenceImage,
        backgroundRect,
        guides,
        guideLayers,
        canvasWidth,
        canvasHeight,
        outputRoot: this.outputRoot,
        channels,
        useChannelMaskAlignment: taskUseChannelMaskAlignment,
        vbsPath: this.vbsPath,
        cutoutJsxPath,
        fileBufferCache,
        alignedImagePathCache,
        disableImageAlignment: false,
        createdTempFiles,
      });
      for (const u of updates) {
        if (!u || u.varType !== 'img') continue;
        imgUpdatesTotal += 1;
        const w = Number(u.width);
        const h = Number(u.height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
          imgUpdatesMissingRect += 1;
        }
      }

      jobTasks.push({
        label,
        outputPath,
        format: taskFormat,
        quality: taskQuality,
        updates,
        artboardRenames: buildArtboardRenameMap({ variables, updates }),
      });
    }

    const job = {
      templateId,
      psdPath,
      tasks: jobTasks,
      mode: 'batch',
      quitAfter: !residentRuntime.enabled,
      resultPath,
    };

    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');
    console.info('[debug][artboardRenames][batch]', JSON.stringify(jobTasks.map((t) => ({ label: t.label, renames: t.artboardRenames }))));
    console.info('[批量导出] 图片更新矩形统计', { templateId, imgUpdatesTotal, imgUpdatesMissingRect });

    if (dryRun) {
      return { dryRun: true, jobPath, batchDir, tasksCount: jobTasks.length };
    }

    const timeoutMs = Math.min(60 * 60 * 1000, 10 * 60 * 1000 + jobTasks.length * 20 * 1000);
    try {
      try {
        await runPhotoshopCommand({
          vbsPath: this.vbsPath,
          jsxPath: this.exportJsxPath,
          jobPath,
          timeoutMs,
          label: `batch-export:${templateId}:${batchDir}`,
        });
      } catch (err) {
        const errMsg = errorToText(err) || err.message || String(err);
        console.error('Photoshop Batch Export Failed:', errMsg);
        throw new Error(`Photoshop 脚本执行失败: ${errMsg}`);
      }

      let parsed = null;
      if (fs.existsSync(resultPath)) {
        parsed = parseJsonSafely(fs.readFileSync(resultPath, 'utf8'));
      }

      if (parsed && parsed.ok === false) {
        const top = Array.isArray(parsed.errors) && parsed.errors.length > 0 ? parsed.errors[0] : null;
        const msg = top && top.message != null ? String(top.message) : '未知错误';
        throw new Error(`Photoshop 合并导出失败：${msg}`);
      }

      const rawResults = Array.isArray(parsed?.results) ? parsed.results : [];
      const scriptBuild = parsed?.scriptBuild != null ? String(parsed.scriptBuild) : null;
      assertScriptBuildMatch({
        phase: 'batch_export',
        templateId,
        jsxPath: this.exportJsxPath,
        expectedScriptBuild,
        actualScriptBuild: scriptBuild,
        jobPath,
        resultPath,
      });
      const byLabel = new Map();
      for (const r of rawResults) {
        if (!r) continue;
        const label = r.label != null ? String(r.label) : '';
        if (!label) continue;
        byLabel.set(label, r);
      }

      const batchFsDir2 = path.join(exportsDir, batchDir);
      const results = await Promise.all(jobTasks.map(async (t) => {
        const r = byLabel.get(String(t.label)) || null;
        const candidates = buildOutputLookupCandidates({
          outputRoot: this.outputRoot,
          candidates: [r?.outputPath, t.outputPath],
        }).filter((p) => isPathInsideDir(batchFsDir2, p));
        let effectiveOutputPath = pickFirstExistingPath({ fs, candidates });
        if (!effectiveOutputPath) {
          const outputExt = path.extname(String(t?.outputPath || '')).toLowerCase();
          const isPsdLike = outputExt === '.psd' || outputExt === '.psb';
          effectiveOutputPath = await waitForFirstExistingPath({
            fs,
            candidates,
            maxWaitMs: isPsdLike ? 12000 : 3000,
            pollIntervalMs: 100,
            minBytes: isPsdLike ? 1024 : 1,
          });
        }
        const ok = r ? r.ok === true && Boolean(effectiveOutputPath) : Boolean(effectiveOutputPath);
        const errors = Array.isArray(r?.errors) ? r.errors : ok ? [] : [{ message: '未生成输出文件' }];
        const url = ok && effectiveOutputPath
          ? buildTemplateFileUrl({ outputRoot: this.outputRoot, templateId, absPath: effectiveOutputPath })
          : null;

        // JPEG 后处理：用 Sharp 重新编码去除 XMP 元数据
        const MIN_JPG_SIZE = 200 * 1024;
        if (ok && effectiveOutputPath && fs.existsSync(effectiveOutputPath)) {
          const outExt = path.extname(effectiveOutputPath).replace('.', '').toLowerCase();
          const fmtHint = String(r?.outputFormat || outExt).toLowerCase();
          if (fmtHint === 'jpeg' || fmtHint === 'jpg' || outExt === 'jpg' || outExt === 'jpeg') {
            try {
              const tmpPath = effectiveOutputPath + '.strip.tmp';
              await sharp(effectiveOutputPath)
                .jpeg({ quality: 100, mozjpeg: false, optimiseCoding: false, trellisQuantisation: false, overshootDeringing: false, optimiseScans: false, chromaSubsampling: '4:4:4' })
                .toFile(tmpPath);
              
              let currentSize = fs.statSync(tmpPath).size;
              console.info('[info][export][batch] After XMP strip:', t.label, Math.round(currentSize / 1024), 'KB');
              
              if (currentSize < MIN_JPG_SIZE) {
                const { data: rawData, info } = await sharp(tmpPath).raw().toBuffer({ resolveWithObject: true });
                const noisyData = Buffer.alloc(rawData.length);
                for (let i = 0; i < rawData.length; i++) {
                  const noise = Math.random() > 0.5 ? 1 : -1;
                  noisyData[i] = Math.min(255, Math.max(0, rawData[i] + noise));
                }
                const noisyPath = effectiveOutputPath + '.noisy.tmp';
                await sharp(noisyData, { raw: { width: info.width, height: info.height, channels: info.channels } })
                  .jpeg({ quality: 100, mozjpeg: false, optimiseCoding: false, chromaSubsampling: '4:4:4' })
                  .toFile(noisyPath);
                fs.renameSync(noisyPath, effectiveOutputPath);
                try { fs.unlinkSync(tmpPath); } catch { /* best effort cleanup */ }
              } else {
                fs.renameSync(tmpPath, effectiveOutputPath);
              }
              console.info('[info][export][batch] XMP strip DONE:', t.label, Math.round(fs.statSync(effectiveOutputPath).size / 1024), 'KB');
            } catch (stripErr) {
              console.error('[error][export][batch] XMP strip FAILED:', t.label, stripErr.message);
            }
          }
        }

        return {
          label: String(t.label),
          ok,
          url,
          outputPath: effectiveOutputPath || t.outputPath,
          errors,
          warnings: Array.isArray(r?.warnings) ? r.warnings : [],
          formatUsed: r?.outputFormat ?? null,
          updatedText: r?.updatedText ?? 0,
          updatedImage: r?.updatedImage ?? 0,
        };
      }));

      return {
        batchDir,
        results,
        jobPath,
        resultPath,
        scriptBuild,
        expectedScriptBuild: expectedScriptBuild || null,
      };
    } finally {
      cleanupTempFilesInDir({ templateId, dir: inputsDir, files: createdTempFiles, keepTempFiles });
    }
  }

  async exportTemplateBatchBundlePsd({
    templateId,
    variables: clientVariables,
    tasks,
    channels,
    useChannelMaskAlignment = false,
    dryRun = false,
  }) {
    if (!isSafeTemplateId(templateId)) {
      throw new Error('无效的 templateId');
    }
    const list = Array.isArray(tasks) ? tasks : [];
    if (list.length === 0) {
      throw new Error('tasks 参数无效');
    }
    if (list.length > 200) {
      throw new Error('tasks 过多（最多 200 条）');
    }

    const jobDir = path.join(this.outputRoot, 'templates', templateId);
    const psdPath = path.join(jobDir, 'source.psd');
    const manifestPath = path.join(jobDir, 'manifest.json');
    if (!fs.existsSync(psdPath)) throw new Error('模板PSD不存在');
    if ((!clientVariables || clientVariables.length === 0) && !fs.existsSync(manifestPath)) {
      throw new Error('模板清单不存在');
    }

    let canvasWidth = null;
    let canvasHeight = null;
    let backgroundRect = null;
    let guides = null;
    let guideLayers = null;
    let templateName = null;
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        templateName = manifest?.originalPsdName || manifest?.name || null;
        canvasWidth = manifest?.width ?? null;
        canvasHeight = manifest?.height ?? null;
        backgroundRect = manifest?.backgroundRect ?? null;
        guides = manifest?.guides ?? null;
        guideLayers = manifest?.guideLayers ?? null;
      } catch {
        canvasWidth = null;
        canvasHeight = null;
        backgroundRect = null;
        guides = null;
        guideLayers = null;
      }
    }
    if (!backgroundRect) {
      backgroundRect = tryBackfillBackgroundRect({ psdPath, manifestPath, canvasWidth, canvasHeight });
    }
    const needGuides = !guides || !Array.isArray(guides.vertical) || guides.vertical.length === 0;
    const needGuideLayers = !guideLayers || !Array.isArray(guideLayers.all) || guideLayers.all.length === 0 || !Number.isFinite(guideLayers.leftX) || !Number.isFinite(guideLayers.rightX);
    if (needGuides || needGuideLayers) {
      const backfill = tryBackfillGuides({ psdPath, manifestPath, canvasWidth, canvasHeight });
      if (backfill) {
        guides = backfill.guides || guides;
        guideLayers = backfill.guideLayers || guideLayers;
      }
    }

    let variables = [];
    if (Array.isArray(clientVariables) && clientVariables.length > 0) {
      variables = clientVariables;
    } else if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      variables = Array.isArray(manifest?.variables) ? manifest.variables : [];
    }

    const exportsDir = path.join(jobDir, 'exports');
    const inputsDir = path.join(jobDir, 'inputs');
    safeMkdir(exportsDir);
    safeMkdir(inputsDir);
    const keepTempFiles = process.env.KEEP_EXPORT_TEMP_FILES === 'true';
    const createdTempFiles = [];
    const expectedScriptBuild = readJsxScriptBuild(this.exportJsxPath);
    const referenceImage = loadReferenceImage(jobDir);
    console.info('[对齐调试] 背景底图层 bounds', { templateId, backgroundRect: backgroundRect || null });
    console.info('[导出调试] JSX 期望版本', {
      templateId,
      exportJsxPath: this.exportJsxPath,
      expectedScriptBuild: expectedScriptBuild || null,
    });

    const batchDir = `bundle_${Date.now()}`;
    const batchFsDir = path.join(exportsDir, batchDir);
    safeMkdir(batchFsDir);

    const outputExt = exportExtFromFormat('psd');
    const outputName = buildBundleOutputName('批量合并', outputExt);
    const outputPath = path.join(batchFsDir, outputName);

    const jobPath = path.join(exportsDir, `job_bundle_${Date.now()}.json`);
    const resultPath = path.join(exportsDir, `result_bundle_${Date.now()}.json`);

    const fileBufferCache = new Map();
    const alignedImagePathCache = new Map();
    const cutoutJsxPath = path.join(__dirname, '../photoshop/cutout_batch.jsx');
    const isPngNamedTemplate = typeof templateName === 'string' && /png/i.test(templateName);
    const needTransparentPsdCutout = isPngNamedTemplate === true;
    const effectiveUseChannelMaskAlignment = needTransparentPsdCutout ? true : useChannelMaskAlignment === true;
    if (needTransparentPsdCutout && (!Array.isArray(channels) || channels.length === 0)) {
      const err = new Error('PNG 模板导出 PSD 需要上传通道 TGA');
      err.status = 400;
      throw err;
    }

    const jobTasks = [];
    let imgUpdatesTotal = 0;
    let imgUpdatesMissingRect = 0;
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i] || {};
      const label = t.label != null ? String(t.label) : String(i);
      const clientUpdates = Array.isArray(t.updates) ? t.updates : [];
      const updates = await normalizeClientUpdates({
        templateId,
        clientUpdates,
        variables,
        inputsDir,
        allowedImagePathRoots: [path.join(this.outputRoot, 'uploads'), path.join(this.outputRoot, 'assets', 'images')],
        referenceImage,
        backgroundRect,
        guides,
        guideLayers,
        canvasWidth,
        canvasHeight,
        outputRoot: this.outputRoot,
        channels,
        useChannelMaskAlignment: effectiveUseChannelMaskAlignment,
        vbsPath: this.vbsPath,
        cutoutJsxPath,
        fileBufferCache,
        alignedImagePathCache,
        disableImageAlignment: false,
        createdTempFiles,
      });
      for (const u of updates) {
        if (!u || u.varType !== 'img') continue;
        imgUpdatesTotal += 1;
        const w = Number(u.width);
        const h = Number(u.height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
          imgUpdatesMissingRect += 1;
        }
      }
      jobTasks.push({
        label,
        updates,
        artboardRenames: buildArtboardRenameMap({ variables, updates }),
      });
    }

    const job = {
      templateId,
      psdPath,
      tasks: jobTasks,
      mode: 'psd-bundle',
      outputPath,
      bundleOptions: {
        hideOriginalReplacedLayers: true,
        showOnlyFirstVariant: true,
      },
      quitAfter: !residentRuntime.enabled,
      resultPath,
    };

    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');
    console.info('[debug][artboardRenames][psd-bundle]', JSON.stringify(jobTasks.map((t) => ({ label: t.label, renames: t.artboardRenames }))));
    console.info('[批量合并PSD] 图片更新矩形统计', { templateId, imgUpdatesTotal, imgUpdatesMissingRect, outputName });

    if (dryRun) {
      return {
        dryRun: true,
        jobPath,
        batchDir,
        outputPath,
        outputUrl: `/templates/${templateId}/exports/${batchDir}/${outputName}`,
        tasksCount: jobTasks.length,
      };
    }

    const timeoutMs = Math.min(60 * 60 * 1000, 10 * 60 * 1000 + jobTasks.length * 25 * 1000);
    try {
      try {
        await runPhotoshopCommand({
          vbsPath: this.vbsPath,
          jsxPath: this.exportJsxPath,
          jobPath,
          timeoutMs,
          label: `psd-bundle:${templateId}:${batchDir}`,
        });
      } catch (err) {
        const errMsg = errorToText(err) || err.message || String(err);
        console.error('Photoshop PSD Bundle Export Failed:', errMsg);
        throw new Error(`Photoshop 脚本执行失败: ${errMsg}`);
      }

      let parsed = null;
      if (fs.existsSync(resultPath)) {
        parsed = parseJsonSafely(fs.readFileSync(resultPath, 'utf8'));
      }

      const scriptBuild = parsed?.scriptBuild != null ? String(parsed.scriptBuild) : null;
      assertScriptBuildMatch({
        phase: 'psd_bundle_export',
        templateId,
        jsxPath: this.exportJsxPath,
        expectedScriptBuild,
        actualScriptBuild: scriptBuild,
        jobPath,
        resultPath,
      });
      const rawResults = Array.isArray(parsed?.results) ? parsed.results : [];
      const byLabel = new Map();
      for (const r of rawResults) {
        if (!r) continue;
        const label = r.label != null ? String(r.label) : '';
        if (!label) continue;
        byLabel.set(label, r);
      }

      const bundleResult = byLabel.get('bundle') || null;
      const candidates = buildOutputLookupCandidates({
        outputRoot: this.outputRoot,
        candidates: [parsed?.outputPath, bundleResult?.outputPath, outputPath],
      }).filter((p) => isPathInsideDir(batchFsDir, p));
      let effectiveOutputPath = pickFirstExistingPath({ fs, candidates });
      if (!effectiveOutputPath) {
        effectiveOutputPath = await waitForFirstExistingPath({
          fs,
          candidates,
          maxWaitMs: 15000,
          pollIntervalMs: 120,
          minBytes: 1024,
        });
      }
      if (!effectiveOutputPath) {
        console.error('[error][export][psd-bundle] 未解析到输出文件', {
          templateId,
          outputPath,
          parsedOutputPath: parsed?.outputPath || null,
          bundleResultOutputPath: bundleResult?.outputPath || null,
          candidates,
          jobPath,
          resultPath,
        });
        throw new Error('Photoshop 导出失败：未生成输出文件');
      }

      const url = buildTemplateFileUrl({ outputRoot: this.outputRoot, templateId, absPath: effectiveOutputPath });
      if (!url) {
        throw new Error('Photoshop 导出失败：输出路径不安全');
      }
      const outputNameUsed = path.basename(effectiveOutputPath);
      const results = jobTasks.map((t) => {
        const r = byLabel.get(String(t.label)) || null;
        const ok = r ? r.ok === true : true;
        const errors = Array.isArray(r?.errors) ? r.errors : ok ? [] : [{ message: '任务失败' }];
        return {
          label: String(t.label),
          ok,
          url,
          outputPath: effectiveOutputPath,
          errors,
          updatedText: r?.updatedText ?? 0,
          updatedImage: r?.updatedImage ?? 0,
        };
      });

      return {
        batchDir,
        mode: 'psd_bundle',
        bundle: {
          url,
          outputPath: effectiveOutputPath,
          outputName: outputNameUsed,
          formatUsed: parsed?.outputFormat ?? 'psd',
          warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
        },
        results,
        jobPath,
        resultPath,
        scriptBuild,
        expectedScriptBuild: expectedScriptBuild || null,
      };
    } finally {
      cleanupTempFilesInDir({ templateId, dir: inputsDir, files: createdTempFiles, keepTempFiles });
    }
  }

  async exportVariableImages({
    templateId,
    variables: clientVariables,
    updates: clientUpdates,
    variants,
    dryRun = false,
  }) {
    if (!isSafeTemplateId(templateId)) {
      throw new Error('无效的 templateId');
    }

    const jobDir = path.join(this.outputRoot, 'templates', templateId);
    const psdPath = path.join(jobDir, 'source.psd');
    const manifestPath = path.join(jobDir, 'manifest.json');
    if (!fs.existsSync(psdPath)) throw new Error('模板PSD不存在');
    if ((!clientVariables || clientVariables.length === 0) && !fs.existsSync(manifestPath)) {
      throw new Error('模板清单不存在');
    }

    let canvasWidth = null;
    let canvasHeight = null;
    let backgroundRect = null;
    let guides = null;
    let guideLayers = null;
    let manifestVariables = [];
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        canvasWidth = manifest?.width ?? null;
        canvasHeight = manifest?.height ?? null;
        backgroundRect = manifest?.backgroundRect ?? null;
        guides = manifest?.guides ?? null;
        guideLayers = manifest?.guideLayers ?? null;
        manifestVariables = Array.isArray(manifest?.variables) ? manifest.variables : [];
      } catch {
        canvasWidth = null;
        canvasHeight = null;
        backgroundRect = null;
        guides = null;
        guideLayers = null;
        manifestVariables = [];
      }
    }
    if (!backgroundRect) {
      backgroundRect = tryBackfillBackgroundRect({ psdPath, manifestPath, canvasWidth, canvasHeight });
    }
    const needGuides = !guides || !Array.isArray(guides.vertical) || guides.vertical.length === 0;
    const needGuideLayers = !guideLayers || !Array.isArray(guideLayers.all) || guideLayers.all.length === 0 || !Number.isFinite(guideLayers.leftX) || !Number.isFinite(guideLayers.rightX);
    if (needGuides || needGuideLayers) {
      const backfill = tryBackfillGuides({ psdPath, manifestPath, canvasWidth, canvasHeight });
      if (backfill) {
        guides = backfill.guides || guides;
        guideLayers = backfill.guideLayers || guideLayers;
      }
    }

    let variables = [];
    if (Array.isArray(clientVariables) && clientVariables.length > 0) {
      variables = clientVariables;
    } else if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      variables = Array.isArray(manifest?.variables) ? manifest.variables : [];
    }

    const imageVariables = pickExportableImgVariables(variables);
    if (imageVariables.length === 0) {
      throw new Error('模板未包含可导出的图片变量');
    }

    const exportsDir = path.join(jobDir, 'exports');
    const inputsDir = path.join(jobDir, 'inputs');
    safeMkdir(exportsDir);
    safeMkdir(inputsDir);
    const keepTempFiles = process.env.KEEP_EXPORT_TEMP_FILES === 'true';
    const createdTempFiles = [];
    const referenceImage = loadReferenceImage(jobDir);

    const normalizedVariantsRaw = Array.isArray(variants) ? variants : ['white', 'transparent'];
    const normalizedVariants = normalizedVariantsRaw
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    const uniqueVariants = Array.from(new Set(normalizedVariants));
    const finalVariants = uniqueVariants.length > 0 ? uniqueVariants : ['white', 'transparent'];

    const allowed = new Set(['white', 'transparent']);
    const effectiveVariants = finalVariants.filter((v) => allowed.has(v));
    if (effectiveVariants.length === 0) {
      throw new Error('variants 参数无效（仅支持 white/transparent）');
    }

    const hasClientUpdates = Array.isArray(clientUpdates) && clientUpdates.length > 0;
    const variablesForNormalize = Array.isArray(manifestVariables) && manifestVariables.length > 0 ? manifestVariables : variables;
    const updates = hasClientUpdates
      ? await normalizeClientUpdates({
        templateId,
        clientUpdates,
        variables: variablesForNormalize,
        inputsDir,
        allowedImagePathRoots: [path.join(this.outputRoot, 'uploads'), path.join(this.outputRoot, 'assets', 'images')],
        referenceImage,
        backgroundRect,
        guides,
        guideLayers,
        canvasWidth,
        canvasHeight,
        createdTempFiles,
      })
      : [];

    const batchName = `var_images_${Date.now()}`;
    const exportDir = path.join(exportsDir, batchName);
    safeMkdir(exportDir);

    const exportItems = imageVariables.map((v) => {
      const base = sanitizeFileNameSegment(v.key || v.name || v.id || `psId_${String(v.psId)}`);
      return {
        psId: Number(v.psId),
        name: String(v.name || v.key || `layer_${String(v.psId)}`),
        x: Number(v.x),
        y: Number(v.y),
        width: Number(v.width),
        height: Number(v.height),
        fileBase: base,
        key: v.key != null ? String(v.key) : null,
        id: v.id != null ? String(v.id) : null,
      };
    });

    const jobPath = path.join(exportsDir, `job_vars_${Date.now()}.json`);
    const resultPath = path.join(exportsDir, `result_vars_${Date.now()}.json`);
    const job = {
      templateId,
      psdPath,
      exportDir,
      format: 'png',
      quality: 100,
      updates,
      exportItems,
      exportVariants: effectiveVariants,
      mode: 'export-variable-images',
      quitAfter: !residentRuntime.enabled,
      resultPath,
    };
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');

    if (dryRun) {
      return {
        dryRun: true,
        jobPath,
        exportDir,
        exportItemsCount: exportItems.length,
        variants: effectiveVariants,
      };
    }

    try {
      try {
        await runPhotoshopCommand({
          vbsPath: this.vbsPath,
          jsxPath: this.exportJsxPath,
          jobPath,
          timeoutMs: 15 * 60 * 1000,
          label: `export-vars:${templateId}`,
        });
      } catch (err) {
        const errMsg = errorToText(err) || err.message || String(err);
        console.error('Photoshop Export Variables Failed:', errMsg);
        throw new Error(`Photoshop 脚本执行失败: ${errMsg}`);
      }

      let result = null;
      if (fs.existsSync(resultPath)) {
        result = parseJsonSafely(fs.readFileSync(resultPath, 'utf8'));
        if (!result) {
          console.warn('导出结果解析失败');
        }
      }

      const images = Array.isArray(result?.images) ? result.images : [];
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      if (images.length === 0) {
        const detail = errors.length > 0 ? errors.map((e) => String(e?.message || e?.name || 'error')).join('; ') : '';
        throw new Error(detail ? `图片变量导出失败：${detail}` : '图片变量导出失败：未生成任何图片');
      }

      const urls = images
        .map((img) => {
          const fileName = String(img?.fileName || '').trim();
          if (!fileName) return null;
          return {
            psId: img?.psId != null ? Number(img.psId) : null,
            variant: img?.variant ? String(img.variant) : null,
            fileName,
            url: `/templates/${templateId}/exports/${batchName}/${fileName}`,
          };
        })
        .filter(Boolean);

      return {
        batchDir: batchName,
        images: urls,
        errors,
        jobPath,
        resultPath,
      };
    } finally {
      cleanupTempFilesInDir({ templateId, dir: inputsDir, files: createdTempFiles, keepTempFiles });
    }
  }
}

export { buildPreparedRunJsxSource, detectSilentNoopAfterPhotoshopRun, getRetryBudgetForPhotoshopError, runPhotoshopCommand, tryPrepareRunJsx };
