import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { promisify } from 'util';
import sharp from 'sharp';
import PuppeteerRenderService from './services/puppeteerRender.js';
import SharpImageProcessor from './services/sharpProcessor.js';
import PhotoshopIngestService, { runPhotoshopCommand } from './services/photoshopIngest.js';
import { composeCutoutToCanvasPng } from './services/composeCutout.js';
import { cutoutNoPsdBatchWithSharp, cutoutNoPsdOneWithSharp } from './services/sharpCutoutNoPsd.js';
import CleanupService from './services/cleanupService.js';
import SlotConfigService, { isSafeTemplateId } from './services/slotConfigService.js';
import TaskTemplateService from './services/taskTemplateService.js';
import { CHANNEL_MATCH_BUILD, explainChannelMatch, pickAngle, pickModel } from './utils/channelMatch.js';
import { runStartupBackup } from './services/startupBackupService.js';
import * as agPsd from 'ag-psd';
import { extractTemplateMeta } from './utils/templateMeta.js';
import { migrateGuidePicks, migrateSlotConfig } from './utils/templateMigration.js';
import { duplicateTemplateOnDisk } from './utils/templateDuplicate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { readPsd } = agPsd;

const app = express();
const PORT = process.env.PORT || 3001;
const APP_VERSION = readPackageVersion();
app.set('trust proxy', 1);

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    return String(pkg?.version || '0.0.0');
  } catch (e) {
    console.warn('[warn] read_package_version_failed', { message: e?.message || String(e) });
    return '0.0.0';
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB
  },
});

const allowedOrigins = String(process.env.ADMIN_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function getRequestProto(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (xfProto === 'https' || xfProto === 'http') return xfProto;
  return String(req.protocol || 'http');
}

function isSameOrigin(origin, req) {
  try {
    const u = new URL(String(origin));
    const reqHost = String(req.get('host') || '');
    const reqProto = getRequestProto(req);
    return u.host === reqHost && u.protocol === `${reqProto}:`;
  } catch {
    return false;
  }
}

function isOriginAllowed(origin, req) {
  if (!origin) return true;
  if (isSameOrigin(origin, req)) return true;
  if (allowedOrigins.includes(origin)) return true;
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (allowedOrigins.length === 0) return !isProd;
  return false;
}

app.use(
  cors((req, callback) => {
    const origin = String(req.headers.origin || '');
    const ok = isOriginAllowed(origin, req);
    callback(ok ? null : new Error('跨域来源不被允许'), { origin: ok, credentials: true });
  }),
);
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use((err, req, res, next) => {
  if (err && err.message === '跨域来源不被允许') {
    return res.status(403).json({ error: '跨域来源不被允许' });
  }
  return next(err);
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const puppeteerService = new PuppeteerRenderService();
const sharpProcessor = new SharpImageProcessor();
const projectRoot = path.join(__dirname, '..');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function ensureDir(p) {
  const dir = String(p || '').trim();
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[storage][json] 读取失败', { filePath, message: e && e.message ? String(e.message) : String(e) });
    return null;
  }
}

function safeWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function copyRecursive(srcPath, dstPath) {
  const st = fs.statSync(srcPath);
  if (st.isDirectory()) {
    ensureDir(dstPath);
    const entries = fs.readdirSync(srcPath, { withFileTypes: true });
    for (const e of entries) {
      const nextSrc = path.join(srcPath, e.name);
      const nextDst = path.join(dstPath, e.name);
      if (e.isDirectory()) {
        copyRecursive(nextSrc, nextDst);
      } else if (e.isFile()) {
        ensureDir(path.dirname(nextDst));
        fs.copyFileSync(nextSrc, nextDst);
      }
    }
    return;
  }
  if (st.isFile()) {
    ensureDir(path.dirname(dstPath));
    fs.copyFileSync(srcPath, dstPath);
  }
}

function migrateLegacyOutputToDataRoot({ legacyOutputRoot, dataRoot }) {
  const legacy = path.resolve(legacyOutputRoot);
  const next = path.resolve(dataRoot);
  if (legacy === next) return { migrated: false, reason: 'same_path' };
  if (!fs.existsSync(legacy)) return { migrated: false, reason: 'legacy_missing' };

  const markerDir = path.join(next, '_migrations');
  const markerPath = path.join(markerDir, 'legacy_output_copied.json');
  if (fs.existsSync(markerPath)) return { migrated: false, reason: 'already_migrated', markerPath };

  const legacyTemplates = path.join(legacy, 'templates');
  const legacyDb = path.join(legacy, 'db');
  const legacyAdmin = path.join(legacy, 'admin');
  const legacyAssets = path.join(legacy, 'assets');
  const legacyHasAny =
    fs.existsSync(legacyTemplates) || fs.existsSync(legacyDb) || fs.existsSync(legacyAdmin) || fs.existsSync(legacyAssets);
  if (!legacyHasAny) return { migrated: false, reason: 'legacy_empty' };

  const nextHasAny =
    fs.existsSync(path.join(next, 'templates')) ||
    fs.existsSync(path.join(next, 'db')) ||
    fs.existsSync(path.join(next, 'admin')) ||
    fs.existsSync(path.join(next, 'assets'));
  if (nextHasAny) return { migrated: false, reason: 'data_root_not_empty' };

  ensureDir(next);
  const startedAt = Date.now();
  const copied = [];
  const copyOne = (name, src) => {
    if (!fs.existsSync(src)) return;
    const dst = path.join(next, name);
    copyRecursive(src, dst);
    copied.push(name);
  };
  copyOne('templates', legacyTemplates);
  copyOne('db', legacyDb);
  copyOne('admin', legacyAdmin);
  copyOne('assets', legacyAssets);

  const elapsedMs = Date.now() - startedAt;
  ensureDir(markerDir);
  safeWriteJson(markerPath, {
    migratedAt: new Date().toISOString(),
    legacyOutputRoot: legacy,
    dataRoot: next,
    copied,
    elapsedMs,
  });
  return { migrated: true, markerPath, copied, elapsedMs };
}

function resolveOutputRoot() {
  const legacyDefault = path.resolve(projectRoot, 'output');
  const env = isNonEmptyString(process.env.FDESIGN_DATA_DIR)
    ? process.env.FDESIGN_DATA_DIR
    : isNonEmptyString(process.env.FDESIGN_OUTPUT_DIR)
      ? process.env.FDESIGN_OUTPUT_DIR
      : '';
  const picked = env ? path.resolve(env) : legacyDefault;
  ensureDir(picked);

  if (env) {
    const r = migrateLegacyOutputToDataRoot({ legacyOutputRoot: legacyDefault, dataRoot: picked });
    if (r.migrated) {
      console.info('[storage][migrate]', {
        from: legacyDefault,
        to: picked,
        copied: r.copied,
        elapsedMs: r.elapsedMs,
        marker: r.markerPath,
      });
    } else if (r.reason !== 'legacy_missing' && r.reason !== 'legacy_empty') {
      console.info('[storage][migrate]', { from: legacyDefault, to: picked, skipped: true, reason: r.reason });
    }
  }

  const schemaVersion = 1;
  const metaPath = path.join(picked, 'db', 'storage_meta.json');
  const existing = safeReadJson(metaPath);
  if (!existing || typeof existing !== 'object') {
    safeWriteJson(metaPath, {
      schemaVersion,
      createdAt: new Date().toISOString(),
      outputRoot: picked,
      projectRoot,
    });
  } else if (Number(existing.schemaVersion) !== schemaVersion) {
    safeWriteJson(metaPath, {
      ...existing,
      schemaVersion,
      updatedAt: new Date().toISOString(),
      outputRoot: picked,
      projectRoot,
    });
  }

  return { outputRoot: picked, legacyDefault, envPicked: env ? String(env) : '' };
}

const storage = resolveOutputRoot();
const outputRoot = storage.outputRoot;
console.info('[storage]', { outputRoot, envPicked: storage.envPicked || null });
const photoshopIngest = new PhotoshopIngestService({ outputRoot });
const slotConfigService = new SlotConfigService({ outputRoot });
const taskTemplateService = new TaskTemplateService({ outputRoot });
const cleanupService = new CleanupService({ outputRoot, isTemplatePinned: (templateId) => taskTemplateService.isTemplateIdPinned(templateId) });
const dataTemplatesDir = path.join(outputRoot, 'templates');
const legacyTemplatesDir = path.join(projectRoot, 'output', 'templates');
const hasLegacyTemplatesMirror = path.resolve(dataTemplatesDir) !== path.resolve(legacyTemplatesDir);

function adoptLegacyTemplateToDataRoot(templateId) {
  const dataTemplateDir = path.join(dataTemplatesDir, templateId);
  const dataPsdPath = path.join(dataTemplateDir, 'source.psd');
  if (fs.existsSync(dataTemplateDir) && fs.existsSync(dataPsdPath)) {
    return dataTemplateDir;
  }
  if (!hasLegacyTemplatesMirror) {
    return dataTemplateDir;
  }
  const legacyTemplateDir = path.join(legacyTemplatesDir, templateId);
  if (!fs.existsSync(legacyTemplateDir)) {
    return dataTemplateDir;
  }
  try {
    copyRecursive(legacyTemplateDir, dataTemplateDir);
    console.info('[info][template] adopt legacy template', { templateId, from: legacyTemplateDir, to: dataTemplateDir });
    return dataTemplateDir;
  } catch (error) {
    console.warn('[warn][template] adopt legacy template failed', {
      templateId,
      from: legacyTemplateDir,
      to: dataTemplateDir,
      message: error?.message ? String(error.message) : String(error),
    });
    return legacyTemplateDir;
  }
}

async function analyzeExportJobForHumans(jobPath) {
  try {
    const fp = String(jobPath || '').trim();
    if (!fp) return null;
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, 'utf8');
    const job = raw ? JSON.parse(raw) : null;
    if (!job || typeof job !== 'object') return null;
    const updates = Array.isArray(job.updates) ? job.updates : [];
    const imgs = updates
      .filter((u) => u && String(u.varType || '').toLowerCase() === 'img')
      .map((u) => ({
        psId: u.psId != null ? Number(u.psId) : null,
        name: u.name != null ? String(u.name) : null,
        imagePath: u.imageAbsPath || u.imagePath || null,
      }))
      .filter((u) => u.imagePath);
    if (imgs.length === 0) {
      return { updatesTotal: updates.length, imgUpdates: 0, topImages: [] };
    }
    const normalized = imgs.map((u) => {
      const p = String(u.imagePath || '');
      const abs = path.isAbsolute(p) ? p : path.join(outputRoot, p);
      return { ...u, abs };
    });
    const stats = normalized
      .map((u) => {
        try {
          const st = fs.statSync(u.abs);
          return { ...u, bytes: Number(st.size) };
        } catch {
          return { ...u, bytes: null };
        }
      })
      .sort((a, b) => Number(b.bytes || 0) - Number(a.bytes || 0))
      .slice(0, 6);

    const topImages = await Promise.all(
      stats.map(async (u) => {
        let meta = null;
        try {
          meta = await sharp(u.abs).metadata();
        } catch {
          meta = null;
        }
        const rel = path.relative(outputRoot, u.abs).replace(/\\/g, '/');
        return {
          psId: u.psId,
          name: u.name,
          file: rel || path.basename(u.abs),
          bytes: u.bytes,
          width: meta?.width ?? null,
          height: meta?.height ?? null,
          channels: meta?.channels ?? null,
          format: meta?.format ?? null,
        };
      }),
    );

    return {
      updatesTotal: updates.length,
      imgUpdates: imgs.length,
      topImages,
    };
  } catch {
    return null;
  }
}

try {
  const backup = runStartupBackup({ projectRoot: path.join(__dirname, '..'), outputRoot });
  if (backup && backup.skipped !== true) {
    console.log('[startup-backup]', {
      ok: backup.ok === true,
      backupRoot: backup.backupRoot,
      backupName: backup.backupName,
      keep: backup.keep,
      elapsedMs: backup.elapsedMs,
    });
  }
} catch (e) {
  console.warn('[startup-backup] failed:', e && e.message ? e.message : String(e));
}

if (process.env.DISABLE_SCHEDULED_CLEANUP !== 'true') {
  cleanupService.startScheduledCleanup(24);
}

function pickFirstExistingDir(dirs) {
  for (const d of dirs) {
    if (!d) continue;
    try {
      if (fs.existsSync(d)) return d;
    } catch (e) {
      console.warn(`检查目录失败: ${d}`, e && e.message ? e.message : String(e));
    }
  }
  return null;
}

const fontAssetsCandidates = [
  process.env.FONT_ASSETS_DIR ? path.resolve(process.env.FONT_ASSETS_DIR) : null,
  path.join(__dirname, '../dist/3-字体'),
  path.join(__dirname, '../public/3-字体'),
  path.resolve(__dirname, '../../3-字体'),
];
const fontAssetsDir = pickFirstExistingDir(fontAssetsCandidates);
if (fontAssetsDir) {
  console.log('Mounting fonts from:', fontAssetsDir);
  app.use(['/3-字体', '/3-%E5%AD%97%E4%BD%93'], express.static(fontAssetsDir, {
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
    },
  }));
} else {
  console.warn(`字体目录不存在: ${fontAssetsCandidates.filter(Boolean).join(' | ')}`);
}

if (fs.existsSync(dataTemplatesDir)) {
  app.use('/templates', express.static(dataTemplatesDir));
} else {
  fs.mkdirSync(dataTemplatesDir, { recursive: true });
  app.use('/templates', express.static(dataTemplatesDir));
}
if (hasLegacyTemplatesMirror && fs.existsSync(legacyTemplatesDir)) {
  app.use('/templates', express.static(legacyTemplatesDir));
}

app.get('/health', (req, res) => {
  const runtime = photoshopIngest.getRuntimeDiagnostics();
  res.json({
    status: 'ok',
    version: APP_VERSION,
    build: 'server/index.js@2026-03-03_cutout_no_psd_fix1',
    timestamp: new Date().toISOString(),
    runtime: {
      outputRoot: runtime?.outputRoot || null,
      exportJsxPath: runtime?.exportJsxPath || null,
      exportJsxScriptBuild: runtime?.exportJsxScriptBuild || null,
      residentModeEnabled: runtime?.residentModeEnabled === true,
    },
    services: {
      puppeteer: puppeteerService.isInitialized ? 'ready' : 'initializing',
      sharp: 'ready',
    },
  });
});

const scryptAsync = promisify(crypto.scrypt);
const ADMIN_COOKIE_NAME = 'fdesign_admin';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const adminAuthDir = path.join(outputRoot, 'admin');
const adminAuthPath = path.join(adminAuthDir, 'auth.json');
const adminSecretPath = path.join(adminAuthDir, 'secret.json');
const loginAttemptsByIp = new Map();

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeToBuffer(input) {
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (s.length % 4)) % 4;
  const padded = s + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

function isSecureRequest(req) {
  const proto = getRequestProto(req);
  if (proto === 'https') return true;
  if (req.secure) return true;
  return false;
}

function getAdminCookieSameSite(req) {
  const forced = String(process.env.ADMIN_COOKIE_SAMESITE || '').trim().toLowerCase();
  if (forced === 'none' || forced === 'lax' || forced === 'strict') return forced;
  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const reqProto = getRequestProto(req);
      const reqHost = String(req.get('host') || '');
      const reqUrl = new URL(`${reqProto}://${reqHost}`);
      const sameSite = originUrl.protocol === reqUrl.protocol && originUrl.hostname === reqUrl.hostname;
      if (!sameSite) return 'none';
    } catch {
      return 'none';
    }
  }
  return 'strict';
}

function getAdminCookieOptions(req, maxAgeMs) {
  const sameSite = getAdminCookieSameSite(req);
  const secure = sameSite === 'none' ? true : isSecureRequest(req);
  return {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: maxAgeMs,
    path: '/',
  };
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  if (!header) return {};
  const pairs = header.split(';');
  const out = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

async function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('读取 JSON 失败:', filePath, e && e.message ? e.message : String(e));
    return null;
  }
}

async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  safeMkdir(dir);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  await fs.promises.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.promises.rename(tmpPath, filePath);
}

async function getAdminSecretKey() {
  const envSecret = String(process.env.ADMIN_AUTH_SECRET || '').trim();
  if (envSecret) {
    return crypto.createHash('sha256').update(envSecret, 'utf8').digest();
  }
  const existing = await readJsonIfExists(adminSecretPath);
  const keyB64 = existing && typeof existing.keyB64 === 'string' ? existing.keyB64 : '';
  if (keyB64) {
    const buf = Buffer.from(keyB64, 'base64');
    if (buf.length >= 32) return buf;
  }
  const key = crypto.randomBytes(32);
  await writeJsonAtomic(adminSecretPath, { keyB64: key.toString('base64'), createdAt: new Date().toISOString() });
  return key;
}

async function hashPassword(password, salt) {
  const pw = Buffer.from(String(password || ''), 'utf8');
  const derived = await scryptAsync(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return Buffer.from(derived);
}

function timingSafeEqualBuf(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function readOrInitAdminAuthState() {
  safeMkdir(adminAuthDir);
  const existing = await readJsonIfExists(adminAuthPath);
  if (
    existing &&
    typeof existing.saltB64 === 'string' &&
    typeof existing.hashB64 === 'string' &&
    Number.isInteger(existing.tokenVersion)
  ) {
    return existing;
  }
  const salt = crypto.randomBytes(16);
  const hash = await hashPassword('admin', salt);
  const next = {
    version: 1,
    saltB64: salt.toString('base64'),
    hashB64: hash.toString('base64'),
    tokenVersion: 1,
    isDefaultPassword: true,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(adminAuthPath, next);
  return next;
}

function validateNewPassword(newPassword) {
  const s = String(newPassword || '');
  if (s.length < 6) return '新密码至少 6 位';
  if (s.length > 128) return '新密码过长';
  if (!s.trim()) return '新密码不能为空白';
  const hasLetter = /[A-Za-z]/.test(s);
  const hasDigit = /\d/.test(s);
  const hasSymbol = /[^A-Za-z0-9]/.test(s);
  const categories = [hasLetter, hasDigit, hasSymbol].filter(Boolean).length;
  if (categories < 2) return '新密码需至少包含字母、数字、符号中的两类';
  if (/^admin$/i.test(s)) return '新密码不能与默认密码相同';
  return null;
}

function getClientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  if (xff) return xff.split(',')[0].trim();
  return String(req.ip || req.connection?.remoteAddress || '');
}

function shouldBlockLogin(ip, nowMs) {
  const rec = loginAttemptsByIp.get(ip);
  if (!rec) return { blocked: false };
  if (rec.blockedUntilMs && nowMs < rec.blockedUntilMs) {
    return { blocked: true, retryAfterMs: rec.blockedUntilMs - nowMs };
  }
  return { blocked: false };
}

function recordLoginAttempt(ip, ok, nowMs) {
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;
  const blockMs = 15 * 60 * 1000;
  const rec = loginAttemptsByIp.get(ip) || { count: 0, windowStartMs: nowMs, blockedUntilMs: 0 };
  if (nowMs - rec.windowStartMs > windowMs) {
    rec.count = 0;
    rec.windowStartMs = nowMs;
    rec.blockedUntilMs = 0;
  }
  if (!ok) {
    rec.count += 1;
    if (rec.count >= maxAttempts) {
      rec.blockedUntilMs = nowMs + blockMs;
    }
  } else {
    rec.count = 0;
    rec.windowStartMs = nowMs;
    rec.blockedUntilMs = 0;
  }
  loginAttemptsByIp.set(ip, rec);
}

async function signAdminToken(payload) {
  const key = await getAdminSecretKey();
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = crypto.createHmac('sha256', key).update(body, 'utf8').digest();
  return `${body}.${base64UrlEncode(sig)}`;
}

async function verifyAdminToken(token) {
  const raw = String(token || '');
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return { ok: false };
  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  if (!body || !sig) return { ok: false };
  const key = await getAdminSecretKey();
  const expected = crypto.createHmac('sha256', key).update(body, 'utf8').digest();
  let provided;
  try {
    provided = base64UrlDecodeToBuffer(sig);
  } catch {
    return { ok: false };
  }
  if (!timingSafeEqualBuf(expected, provided)) return { ok: false };
  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToBuffer(body).toString('utf8'));
  } catch {
    return { ok: false };
  }
  const nowMs = Date.now();
  if (!payload || typeof payload !== 'object') return { ok: false };
  if (!Number.isFinite(payload.expMs) || payload.expMs <= nowMs) return { ok: false };
  if (!Number.isInteger(payload.tokenVersion)) return { ok: false };
  return { ok: true, payload };
}

async function getAdminAuthFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return { authenticated: false };
  const verified = await verifyAdminToken(token);
  if (!verified.ok) return { authenticated: false };
  const state = await readOrInitAdminAuthState();
  if (verified.payload.tokenVersion !== state.tokenVersion) return { authenticated: false };
  return { authenticated: true, state };
}

async function requireAdmin(req, res, next) {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (!isProd || process.env.ADMIN_AUTH_DISABLED === 'true') {
    req.adminAuth = { authenticated: true, bypass: true };
    return next();
  }
  try {
    const auth = await getAdminAuthFromRequest(req);
    if (!auth.authenticated) {
      return res.status(401).json({ error: '未登录或登录已失效' });
    }
    req.adminAuth = auth;
    return next();
  } catch (e) {
    return res.status(500).json({ error: '鉴权失败', message: e.message || String(e) });
  }
}

app.get('/api/admin/me', async (req, res) => {
  const auth = await getAdminAuthFromRequest(req);
  if (!auth.authenticated) {
    return res.json({ authenticated: false });
  }
  return res.json({ authenticated: true, mustChangePassword: auth.state.isDefaultPassword === true });
});

app.post('/api/admin/login', async (req, res) => {
  const ip = getClientIp(req);
  const nowMs = Date.now();
  const block = shouldBlockLogin(ip, nowMs);
  if (block.blocked) {
    const retryAfterSeconds = Math.max(1, Math.ceil((block.retryAfterMs || 0) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ error: '登录尝试过于频繁，请稍后再试', retryAfterSeconds });
  }
  const password = String(req.body?.password || '');
  const state = await readOrInitAdminAuthState();
  const salt = Buffer.from(state.saltB64, 'base64');
  const expectedHash = Buffer.from(state.hashB64, 'base64');
  let ok = false;
  try {
    const actualHash = await hashPassword(password, salt);
    ok = timingSafeEqualBuf(expectedHash, actualHash);
  } catch {
    ok = false;
  }
  recordLoginAttempt(ip, ok, nowMs);
  if (!ok) {
    return res.status(401).json({ error: '密码错误' });
  }
  const token = await signAdminToken({
    tokenVersion: state.tokenVersion,
    iatMs: nowMs,
    expMs: nowMs + ADMIN_SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  });
  res.cookie(ADMIN_COOKIE_NAME, token, getAdminCookieOptions(req, ADMIN_SESSION_TTL_MS));
  return res.json({ success: true, mustChangePassword: state.isDefaultPassword === true });
});

app.post('/api/admin/logout', async (req, res) => {
  try {
    const auth = await getAdminAuthFromRequest(req);
    if (auth.authenticated) {
      const state = await readOrInitAdminAuthState();
      const next = {
        ...state,
        tokenVersion: Number(state.tokenVersion) + 1,
        updatedAt: new Date().toISOString(),
      };
      await writeJsonAtomic(adminAuthPath, next);
    }
  } catch (e) {
    console.warn('退出登录时更新会话版本失败:', e && e.message ? e.message : String(e));
  }
  res.cookie(ADMIN_COOKIE_NAME, '', getAdminCookieOptions(req, 0));
  res.json({ success: true });
});

app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const oldPassword = String(req.body?.oldPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const err = validateNewPassword(newPassword);
  if (err) return res.status(400).json({ error: err });
  const state = await readOrInitAdminAuthState();
  const salt = Buffer.from(state.saltB64, 'base64');
  const expectedHash = Buffer.from(state.hashB64, 'base64');
  const actualOld = await hashPassword(oldPassword, salt);
  if (!timingSafeEqualBuf(expectedHash, actualOld)) {
    return res.status(401).json({ error: '原密码不正确' });
  }
  const nextSalt = crypto.randomBytes(16);
  const nextHash = await hashPassword(newPassword, nextSalt);
  const next = {
    ...state,
    saltB64: nextSalt.toString('base64'),
    hashB64: nextHash.toString('base64'),
    tokenVersion: Number(state.tokenVersion) + 1,
    isDefaultPassword: false,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(adminAuthPath, next);
  const nowMs = Date.now();
  const token = await signAdminToken({
    tokenVersion: next.tokenVersion,
    iatMs: nowMs,
    expMs: nowMs + ADMIN_SESSION_TTL_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  });
  res.cookie(ADMIN_COOKIE_NAME, token, getAdminCookieOptions(req, ADMIN_SESSION_TTL_MS));
  return res.json({ success: true });
});

app.get('/api/task-templates', (req, res) => {
  try {
    const rows = taskTemplateService.list();
    res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    res.status(500).json({ error: '获取任务模板失败', message: error.message });
  }
});

// 导出全部任务模版(不需要admin认证) - 必须放在 :id 前面,避免 export-all 被当作 :id 匹配
app.get('/api/task-templates/export-all', (req, res) => {
  try {
    const data = taskTemplateService.exportAll();
    res.json(data);
  } catch (error) {
    console.error('[error][export-all]', error.message);
    res.status(500).json({ error: '导出失败', message: error.message });
  }
});

// 导入全部任务模版(不需要admin认证) - 必须放在 :id 前面
app.post('/api/task-templates/import-all', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: '请求体必须是JSON对象' });
    }
    const result = taskTemplateService.importAll(data);
    res.json(result);
  } catch (error) {
    console.error('[error][import-all]', error.message);
    res.status(400).json({ error: '导入失败', message: error.message });
  }
});

app.get('/api/task-templates/:id', (req, res) => {
  try {
    const tpl = taskTemplateService.get(req.params.id);
    res.json(tpl);
  } catch (error) {
    if (error && error.code === 'TASK_TEMPLATE_NOT_FOUND') {
      return res.status(404).json({ error: '任务模板不存在', message: error.message });
    }
    res.status(400).json({ error: '获取任务模板失败', message: error.message });
  }
});

app.post('/api/task-templates', requireAdmin, (req, res) => {
  try {
    const { name, items } = req.body || {};
    const tpl = taskTemplateService.create({ name, items });
    res.json(tpl);
  } catch (error) {
    res.status(400).json({ error: '创建任务模板失败', message: error.message });
  }
});

app.put('/api/task-templates/:id', requireAdmin, (req, res) => {
  try {
    const { name, items } = req.body || {};
    const tpl = taskTemplateService.update(req.params.id, { name, items });
    res.json(tpl);
  } catch (error) {
    if (error && error.code === 'TASK_TEMPLATE_NOT_FOUND') {
      return res.status(404).json({ error: '任务模板不存在', message: error.message });
    }
    res.status(400).json({ error: '更新任务模板失败', message: error.message });
  }
});

app.delete('/api/task-templates/:id', requireAdmin, (req, res) => {
  try {
    const out = taskTemplateService.delete(req.params.id);
    res.json(out);
  } catch (error) {
    if (error && error.code === 'TASK_TEMPLATE_NOT_FOUND') {
      return res.status(404).json({ error: '任务模板不存在', message: error.message });
    }
    res.status(400).json({ error: '删除任务模板失败', message: error.message });
  }
});

app.get('/api/templates', async (req, res) => {
  try {
    if (!fs.existsSync(dataTemplatesDir) && !fs.existsSync(legacyTemplatesDir)) {
      return res.json([]);
    }
    const templateDirs = [{ dir: dataTemplatesDir, source: 'data' }];
    if (hasLegacyTemplatesMirror) {
      templateDirs.push({ dir: legacyTemplatesDir, source: 'legacy' });
    }
    const out = [];
    let ensured = 0;
    let warned = 0;
    const stats = { scanned: 0, valid: 0, returned: 0, legacyReturned: 0 };
    const seen = new Set();
    for (let d = 0; d < templateDirs.length; d += 1) {
      const baseDir = templateDirs[d];
      if (!fs.existsSync(baseDir.dir)) continue;
      const templateIds = await fs.promises.readdir(baseDir.dir);
      stats.scanned += templateIds.length;
      for (let i = 0; i < templateIds.length; i += 1) {
        const id = templateIds[i];
        if (!isSafeTemplateId(id)) continue;
        if (seen.has(id)) continue;
        let templateDir = path.join(baseDir.dir, id);
        if (baseDir.source === 'legacy') {
          templateDir = adoptLegacyTemplateToDataRoot(id);
        }
        const manifestPath = path.join(templateDir, 'manifest.json');
      let manifest = {};
      try {
        const manifestData = await fs.promises.readFile(manifestPath, 'utf-8');
        manifest = JSON.parse(manifestData);
      } catch {
        continue;
      }

      if (!manifest.isUserSaved) continue;
      seen.add(id);
      stats.valid += 1;

      let previewUrl = slotConfigService.buildImageUrl(id, templateDir);
      const canEnsurePreview = path.resolve(templateDir).startsWith(path.resolve(dataTemplatesDir));
      if (!previewUrl && ensured < 6 && canEnsurePreview) {
        try {
          ensured += 1;
          await photoshopIngest.ensureTemplatePreview(id);
          previewUrl = slotConfigService.buildImageUrl(id, templateDir);
        } catch (previewErr) {
          console.warn('预览图补全失败:', previewErr?.message || String(previewErr));
        }
      } else if (!previewUrl && !canEnsurePreview && warned < 3) {
        warned += 1;
        console.warn('[warn][template] 预览图缺失且目录不可写', { id, templateDir });
      }

      let thumbnailUrl = null;
      if (canEnsurePreview) {
        try {
          thumbnailUrl = await slotConfigService.ensureThumbnailUrl(id, templateDir);
        } catch (thumbErr) {
          console.warn('模板缩略图补全失败:', thumbErr?.message || String(thumbErr));
        }
      } else {
        thumbnailUrl = slotConfigService.buildThumbnailUrl(id, templateDir);
      }

      out.push({
        id,
        name: manifest.name || `未命名模版 (${id.slice(0, 6)})`,
        previewUrl,
        thumbnailUrl,
        savedAt: manifest.savedAt,
      });
      stats.returned += 1;
      if (baseDir.source === 'legacy') stats.legacyReturned += 1;
    }
    }
    console.info('[info][templates] list', {
      outputRoot,
      legacyTemplatesDir: hasLegacyTemplatesMirror ? legacyTemplatesDir : null,
      scanned: stats.scanned,
      valid: stats.valid,
      returned: stats.returned,
      legacyReturned: stats.legacyReturned,
    });
    res.json(out);
  } catch (error) {
    console.error('获取模板列表失败:', error);
    res.status(500).json({ error: '获取模板列表失败', message: error.message });
  }
});

app.post('/api/cleanup/temporary-templates', async (req, res) => {
  try {
    console.log('Starting on-demand temporary template cleanup...');
    await cleanupService.cleanupAllTemporaryTemplates();
    res.json({ success: true, message: '所有临时模版已清理' });
  } catch (error) {
    console.error('Cleanup failed:', error);
    res.status(500).json({ error: '清理失败', message: error.message });
  }
});

app.delete('/api/template/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isSafeTemplateId(id)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }
    if (taskTemplateService.isTemplateReferenced(id)) {
      return res.status(409).json({ error: '该 PSD 正被任务模板引用，禁止删除' });
    }
    const success = await cleanupService.deleteTemplate(id);
    const legacyTemplateDir = path.join(legacyTemplatesDir, id);
    const successLegacy = hasLegacyTemplatesMirror && (await cleanupService.deleteTemplateAtPath(id, legacyTemplateDir));
    if (success || successLegacy) {
      console.info('[info][template] deleted', { templateId: id, deleteSource: success ? 'data' : 'legacy' });
      return res.json({ success: true, message: '模版已删除' });
    }

    res.status(404).json({ error: '模版不存在' });
  } catch (error) {
    console.error('Delete template failed:', error);
    res.status(500).json({ error: '删除失败', message: error.message });
  }
});

app.post('/api/template/:id/duplicate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isSafeTemplateId(id)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }
    adoptLegacyTemplateToDataRoot(id);
    const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const { manifest } = await slotConfigService.readManifest(id);
    const baseName =
      typeof manifest?.name === 'string' && manifest.name.trim()
        ? manifest.name.trim()
        : `未命名模版 (${id.slice(0, 6)})`;
    const nextName = requestedName || `${baseName}（副本）`;
    console.info('[info][template] duplicate', { from: id, name: nextName });
    const out = await duplicateTemplateOnDisk({ outputRoot, templateId: id, name: nextName });
    return res.json(out);
  } catch (error) {
    const status = Number(error?.status);
    if (status === 400) return res.status(400).json({ error: '复制失败', message: error.message });
    if (error && error.code === 'TEMPLATE_NOT_FOUND') return res.status(404).json({ error: '模版不存在' });
    console.error('[error][template] duplicate failed:', error);
    return res.status(500).json({ error: '复制失败', message: error.message });
  }
});

app.post('/api/template/save', requireAdmin, async (req, res) => {
  try {
    const { templateId, name, config } = req.body;
    if (!templateId || !name) {
      return res.status(400).json({ error: '缺少参数: templateId 或 name' });
    }
    if (!isSafeTemplateId(templateId)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }

    const templateDir = adoptLegacyTemplateToDataRoot(templateId);
    const manifestPath = path.join(templateDir, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: '模版不存在' });
    }
    
    const manifestData = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestData);
    
    // 更新元数据
    manifest.name = name;
    manifest.isUserSaved = true;
    manifest.savedAt = new Date().toISOString();
    
    // 更新前端配置（如果提供了）
    // 这包含了用户调整后的变量位置、默认值、切片线等
    if (config) {
        manifest.frontendConfig = config;
    }
    
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    
    console.log(`模版已保存: ${name} (${templateId})`);
    let previewUrl = slotConfigService.buildImageUrl(templateId, templateDir);
    if (!previewUrl) {
      try {
        await photoshopIngest.ensureTemplatePreview(templateId);
        previewUrl = slotConfigService.buildImageUrl(templateId, templateDir);
      } catch (previewErr) {
        console.warn('保存后预览图补全失败:', previewErr?.message || String(previewErr));
      }
    }
    let thumbnailUrl = null;
    try {
      thumbnailUrl = await slotConfigService.ensureThumbnailUrl(templateId, templateDir);
    } catch (thumbErr) {
      console.warn('保存后模板缩略图补全失败:', thumbErr?.message || String(thumbErr));
    }
    res.json({ success: true, name: manifest.name, savedAt: manifest.savedAt, previewUrl, thumbnailUrl });
    
  } catch (error) {
    console.error('保存模版失败:', error);
    res.status(500).json({ error: '保存模版失败', message: error.message });
  }
});

app.get('/api/template/:id/config', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isSafeTemplateId(id)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }
    adoptLegacyTemplateToDataRoot(id);

    const config = await slotConfigService.getTemplateConfig(id);
    res.json(config);
  } catch (error) {
    if (error && error.code === 'TEMPLATE_NOT_FOUND') {
      return res.status(404).json({ error: '找不到模板' });
    }
    if (error && (error.code === 'SLOT_CONFIG_BROKEN' || error.code === 'INVALID_SLOT_CONFIG')) {
      console.error('模版配置损坏:', error);
      return res.status(500).json({ error: '模版配置损坏', message: error.message });
    }
    console.error('获取模版配置失败:', error);
    res.status(500).json({ error: '获取模版配置失败', message: error.message });
  }
});

app.post('/api/template/:id/slot-config', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isSafeTemplateId(id)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }
    adoptLegacyTemplateToDataRoot(id);

    const requestSummary = slotConfigService.buildSlotConfigDebugSummary(req.body || {});
    console.info('[debug][slot-config] api request', { templateId: id, ...requestSummary });

    const saved = await slotConfigService.saveSlotConfig(id, req.body || {});
    const responseSummary = slotConfigService.buildSlotConfigDebugSummary(saved);
    console.info('[debug][slot-config] api response', { templateId: id, ...responseSummary });
    res.json({
      success: true,
      templateId: id,
      version: saved.version,
      slots: saved.slots,
      fieldDefinitions: saved.fieldDefinitions,
    });
  } catch (error) {
    if (error && error.code === 'TEMPLATE_NOT_FOUND') {
      return res.status(404).json({ error: '模版不存在' });
    }
    if (error && error.code === 'INVALID_SLOT_CONFIG') {
      return res.status(400).json({ error: '无效的商品位配置', message: error.message });
    }
    console.error('保存商品位配置失败:', error);
    res.status(500).json({ error: '保存商品位配置失败', message: error.message });
  }
});

app.get('/api/template/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isSafeTemplateId(id)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }
    const templateDir = adoptLegacyTemplateToDataRoot(id);
    const manifestPath = path.join(templateDir, 'manifest.json');
    const sourcePsdPath = path.join(templateDir, 'source.psd');

    if (!fs.existsSync(manifestPath) || !fs.existsSync(sourcePsdPath)) {
      return res.status(404).json({ error: '找不到模板' });
    }

    const manifestData = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestData);

    const imageUrl = slotConfigService.buildImageUrl(id, templateDir);
    const fixedOriginal = normalizeUploadOriginalName(manifest?.originalPsdName || manifest?.name || '');
    if (fixedOriginal) {
      manifest.originalPsdName = fixedOriginal;
      if (typeof manifest?.name === 'string' && /\.psd$/i.test(manifest.name.trim())) {
        manifest.name = fixedOriginal;
      }
    }

    const hasVars = Array.isArray(manifest?.variables) && manifest.variables.length > 0;
    if (!hasVars) {
      try {
        const buf = await fs.promises.readFile(sourcePsdPath);
        const psd = readPsd(Buffer.from(buf), {
          skipLayerImageData: true,
          skipCompositeImageData: true,
          skipThumbnail: true,
          logMissingFeatures: false,
        });
        const meta = extractTemplateMeta(psd);
        const vars = Array.isArray(meta?.variables) ? meta.variables : [];
        if (vars.length > 0) {
          manifest.variables = vars;
          if (!(Number(manifest?.width) > 0) && Number(meta?.width) > 0) manifest.width = meta.width;
          if (!(Number(manifest?.height) > 0) && Number(meta?.height) > 0) manifest.height = meta.height;
          await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
          console.info('[template] 补全 manifest.variables', { templateId: id, variables: vars.length });
        }
      } catch (e) {
        console.warn('[template] 补全 manifest.variables 失败', { templateId: id, error: e?.message ? String(e.message) : String(e) });
      }
    }

    const varCount = Array.isArray(manifest?.variables) ? manifest.variables.length : 0;
    if (varCount > 0 && varCount <= 1) {
      try {
        const buf = await fs.promises.readFile(sourcePsdPath);
        const psd = readPsd(Buffer.from(buf), {
          skipLayerImageData: false,
          skipCompositeImageData: true,
          skipThumbnail: true,
          logMissingFeatures: false,
          useImageData: true,
          useCanvas: false,
        });
        const meta = extractTemplateMeta(psd);
        const taggedVars = Array.isArray(meta?.variables) ? meta.variables : [];
        const candImgCount = Array.isArray(meta?.candidates?.img) ? meta.candidates.img.length : 0;
        if (taggedVars.length === 0 && candImgCount > varCount) {
          const autoVars = Array.isArray(meta?.candidates?.text) || Array.isArray(meta?.candidates?.img)
            ? [
                ...(Array.isArray(meta?.candidates?.text) ? meta.candidates.text.map((c) => ({ ...c, varType: 'text', defaultValue: c?.defaultValue ?? '', value: c?.defaultValue ?? '' })) : []),
                ...(Array.isArray(meta?.candidates?.img) ? meta.candidates.img.map((c) => ({ ...c, varType: 'img', defaultValue: c?.defaultValue ?? '', value: c?.defaultValue ?? '' })) : []),
              ]
            : [];
          if (autoVars.length > varCount) {
            manifest.variables = autoVars;
            if (!(Number(manifest?.width) > 0) && Number(meta?.width) > 0) manifest.width = meta.width;
            if (!(Number(manifest?.height) > 0) && Number(meta?.height) > 0) manifest.height = meta.height;
            await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
            console.info('[template] 增强 manifest.variables（补全更多自动变量）', { templateId: id, variables: autoVars.length });
          }
        }
      } catch (e) {
        console.warn('[template] 增强 manifest.variables 失败', { templateId: id, error: e?.message ? String(e.message) : String(e) });
      }
    }

    if (Array.isArray(manifest?.variables) && manifest.variables.length > 0) {
      let changed = false;
      for (let i = 0; i < manifest.variables.length; i += 1) {
        const v = manifest.variables[i];
        if (!v || typeof v !== 'object') continue;
        const hasId = v.id != null && String(v.id).trim();
        if (hasId) continue;
        const path0 = v.path != null ? String(v.path) : '';
        const vt0 = String(v.varType || v.type || '').toLowerCase();
        const vt = vt0 === 'image' ? 'img' : (vt0 === 'img' || vt0 === 'text' ? vt0 : vt0);
        const key0 = v.key != null ? String(v.key).trim() : '';
        const key = key0 || (v.name != null ? String(v.name).trim() : '');
        if (!key) continue;
        v.id = crypto.createHash('sha1').update(`${path0}:${vt}:${key}`).digest('hex').slice(0, 16);
        changed = true;
      }
      if (changed) {
        try {
          await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
          console.info('[template] 补全 manifest.variables.id', { templateId: id });
        } catch (e) {
          console.warn('[template] 补全 manifest.variables.id 失败', { templateId: id, error: e?.message ? String(e.message) : String(e) });
        }
      }
    }

    res.json({
      ...manifest,
      id,
      imageUrl
    });
  } catch (error) {
    console.error('获取模板详情失败:', error);
    res.status(500).json({ error: '获取模板详情失败', message: error.message });
  }
});

app.post('/api/export/slices', async (req, res) => {
  try {
    const { dom, width, height, sliceLines, format, quality, deviceScaleFactor, backgroundColor } = req.body;

    if (!dom || typeof dom !== 'string') {
      return res.status(400).json({ error: '缺少 dom 字段（exportRoot.outerHTML）' });
    }

    const w = parseInt(width) || 790;
    const h = parseInt(height) || 1200;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = await puppeteerService.renderDomToSlices({
      dom,
      width: w,
      height: h,
      sliceLines: Array.isArray(sliceLines) ? sliceLines : [],
      baseUrl,
      format: format || 'png',
      quality: parseInt(quality) || 95,
      deviceScaleFactor: parseFloat(deviceScaleFactor) || 2,
      backgroundColor: backgroundColor || '#ffffff',
    });

    res.json({
      success: true,
      format: result.format,
      slices: result.slices.map((s) => ({
        index: s.index,
        y0: s.y0,
        y1: s.y1,
        base64: s.data.toString('base64'),
      })),
    });
  } catch (error) {
    console.error('服务端切片导出失败:', error);
    res.status(500).json({
      error: '服务端切片导出失败',
      message: error.message,
    });
  }
});

function safeMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeUploadOriginalName(input) {
  const s = String(input || '');
  if (!s) return s;
  const hasReplacement = s.includes('�');
  const hasHighLatin1 = /[\u00c0-\u00ff]/.test(s);
  const hasCjk = /[\u4e00-\u9fff]/.test(s);
  if (!hasReplacement && (!hasHighLatin1 || hasCjk)) return s;
  try {
    const decoded = Buffer.from(s, 'latin1').toString('utf8');
    if (!decoded) return s;
    const decodedHasReplacement = decoded.includes('�');
    const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded);
    if (decodedHasCjk && !decodedHasReplacement) return decoded;
    if (hasReplacement && !decodedHasReplacement) return decoded;
    return s;
  } catch {
    return s;
  }
}

function parseJsonSafely(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s) return null;
  try {
    const noBom = s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
    return JSON.parse(noBom);
  } catch {
    let sanitized = '';
    for (let i = 0; i < s.length; i += 1) {
      const code = s.charCodeAt(i);
      if (code >= 32 && code !== 127) sanitized += s[i];
    }
    if (!sanitized || sanitized === s) return null;
    try {
      const noBom = sanitized.charCodeAt(0) === 0xfeff ? sanitized.slice(1) : sanitized;
      return JSON.parse(noBom);
    } catch {
      return null;
    }
  }
}

function normalizeCutoutErrorMessage(raw) {
  const msg = raw != null ? String(raw).trim() : '';
  if (!msg) return msg;
  const lowered = msg.toLowerCase();
  if (lowered.includes('input file contains unsupported image format') || lowered.includes('input buffer contains unsupported image format')) {
    return '图片格式无法解析（可能文件损坏/不是图片内容/通道TGA不兼容）。';
  }
  if (lowered.includes('unable to parse') && lowered.includes('jpg')) {
    return 'JPG 图片解析失败（可能文件损坏或下载未完成）。';
  }
  if (lowered.includes('corrupt') && lowered.includes('jpeg')) {
    return 'JPG 图片已损坏（无法解析）。';
  }
  return msg;
}

function normalizeCutoutErrors(errors) {
  const list = Array.isArray(errors) ? errors : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    const message = normalizeCutoutErrorMessage(e?.message != null ? e.message : e);
    if (!message) continue;
    out.push({ message });
  }
  return out;
}

function isPathInside(childPath, parentPath) {
  const child = path.resolve(String(childPath || ''));
  const parent = path.resolve(String(parentPath || ''));
  const c = child.toLowerCase();
  const p = parent.toLowerCase();
  if (c === p) return true;
  return c.startsWith(p.endsWith(path.sep) ? p : `${p}${path.sep}`);
}

function ensureSafeBasename(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const base = path.basename(raw);
  if (base !== raw) return null;
  if (base.includes('/') || base.includes('\\')) return null;
  return base;
}

function sanitizeFileName(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'file';
  return raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(0, 160);
}

function resolveExistingPathVariants(filePath) {
  const fp = String(filePath || '');
  if (!fp) return fp;
  if (fs.existsSync(fp)) return fp;
  const variants = [];
  if (fp.includes(' ')) {
    variants.push(fp.replace(/\s+/g, '-'));
    variants.push(fp.replace(/\s+/g, '_'));
  }
  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    if (v && fs.existsSync(v)) return v;
  }
  return fp;
}

function parseClientPrefixedName(originalName) {
  const s = String(originalName || '');
  const m = /^cid_([^_]+)__([\s\S]+)$/.exec(s);
  if (!m) return { clientId: null, originalName: s };
  return { clientId: String(m[1] || '').trim() || null, originalName: String(m[2] || '').trim() || s };
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  return 'bin';
}

app.post('/api/template/ingest-temp', upload.single('psd'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 PSD 文件' });
    const safeOriginalName = normalizeUploadOriginalName(req.file.originalname);
    const result = await photoshopIngest.ingestPsd(req.file.buffer, safeOriginalName);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('模板临时入库失败:', error);
    res.status(500).json({ error: '模板临时入库失败', message: error.message });
  }
});

app.post('/api/assets/upload-images', upload.array('images', 200), async (req, res) => {
  try {
    const batchId = sanitizeFileName(req.body?.batchId || '');
    const batchDir = batchId ? `batch_${batchId}` : `batch_${Date.now()}`;
    const uploadDir = path.join(outputRoot, 'assets', 'images', batchDir);
    safeMkdir(uploadDir);

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) return res.status(400).json({ error: '请上传产品图' });

    const images = files.map((f) => {
      const safeOriginal = normalizeUploadOriginalName(f.originalname);
      const { clientId, originalName } = parseClientPrefixedName(safeOriginal);
      const ext = path.extname(originalName || '') || `.${extFromMime(f.mimetype || '')}`;
      const base = sanitizeFileName((originalName || 'image').replace(/\.[^/.]+$/g, ''));
      const storedName = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}_${base}${ext.startsWith('.') ? ext : `.${ext}`}`;
      const fp = path.join(uploadDir, storedName);
      fs.writeFileSync(fp, f.buffer);
      const relFromOutput = path.relative(outputRoot, fp);
      const publicUrl = `/output/${relFromOutput.split(path.sep).join('/')}`;
      return {
        clientId,
        originalName,
        storedName,
        imagePath: fp,
        publicUrl,
      };
    });

    res.json({ success: true, images });
  } catch (error) {
    console.error('上传产品图失败:', error);
    res.status(500).json({ error: '上传产品图失败', message: error.message });
  }
});

app.post('/api/assets/upload-channel-masks', upload.array('channels', 200), async (req, res) => {
  try {
    const uploadDir = path.join(outputRoot, 'assets', 'channels');
    safeMkdir(uploadDir);

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) return res.status(400).json({ error: '请上传通道图' });

    const channels = files.map((f) => {
      const safeOriginal = normalizeUploadOriginalName(f.originalname);
      const { clientId, originalName } = parseClientPrefixedName(safeOriginal);
      const ext = path.extname(originalName || '') || '.tga';
      const base = sanitizeFileName((originalName || 'channel').replace(/\.[^/.]+$/g, ''));
      const storedName = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}_${base}${ext.startsWith('.') ? ext : `.${ext}`}`;
      const fp = path.join(uploadDir, storedName);
      fs.writeFileSync(fp, f.buffer);
      return {
        clientId,
        originalName,
        storedName,
      };
    });

    res.json({ success: true, channels });
  } catch (error) {
    console.error('上传通道图失败:', error);
    res.status(500).json({ error: '上传通道图失败', message: error.message });
  }
});

app.post('/api/cutout/batch-no-psd', async (req, res) => {
  try {
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    const channelsReq = Array.isArray(req.body?.channels) ? req.body.channels : [];
    const resizeMode = String(req.body?.resizeMode || 'exact').toLowerCase() === 'exact' ? 'exact' : 'none';

    if (images.length === 0) return res.status(400).json({ error: '缺少产品图' });
    if (channelsReq.length === 0) return res.status(400).json({ error: '缺少通道图' });

    const channelDir = path.join(outputRoot, 'assets', 'channels');
    const channelIndex = channelsReq
      .map((c) => {
        const storedName = ensureSafeBasename(c?.storedName);
        if (!storedName) return null;
        const filePath = path.join(channelDir, storedName);
        const sourceName = String(c?.sourceName || storedName);
        const model = pickModel(sourceName);
        const angle = pickAngle(sourceName);
        const baseModel = model ? String(model).toUpperCase() : null;
        return { storedName, filePath, sourceName, model, baseModel, angle, isGeneric: !model };
      })
      .filter(Boolean);

    const missingChannels = [];
    const batchDir = `cutout_no_psd_${Date.now()}`;
    const outDir = path.join(outputRoot, 'cutout_no_psd', batchDir);
    safeMkdir(outDir);

    const allowedImagesRoot = path.join(outputRoot, 'assets', 'images');
    const tasks = images.map((img, idx) => {
      const rawProductPath = String(img?.imagePath || '').trim();
      const resolvedProductPath = rawProductPath
        ? path.resolve(path.isAbsolute(rawProductPath) ? rawProductPath : path.join(outputRoot, rawProductPath))
        : '';
      if (!resolvedProductPath || !isPathInside(resolvedProductPath, allowedImagesRoot) || !fs.existsSync(resolvedProductPath)) {
        const err = new Error('产品图路径无效或文件不存在');
        err.status = 400;
        throw err;
      }
      const sourceName = String(img?.sourceName || img?.storedName || `image_${idx + 1}`);
      const explain = explainChannelMatch(sourceName, channelIndex, { modelHint: img?.modelHint, angleHint: img?.angleHint });
      const match = explain?.match || null;
      if (!match) {
        missingChannels.push({
          label: String(idx),
          sourceName,
          model: pickModel(sourceName),
          angle: pickAngle(sourceName),
          modelHint: img?.modelHint != null ? String(img.modelHint) : null,
          angleHint: img?.angleHint != null ? String(img.angleHint) : null,
          extracted: explain?.extracted || null,
          candidates: Array.isArray(explain?.candidates) ? explain.candidates : null,
          channelMatchBuild: explain?.build || CHANNEL_MATCH_BUILD,
        });
      }
      const fileBase = sanitizeFileName(sourceName).replace(/\.[^/.]+$/g, '') || `image_${idx + 1}`;
      const outputName = `${String(idx + 1).padStart(4, '0')}_${fileBase}_cutout.png`;
      return {
        label: String(idx),
        productPath: resolvedProductPath,
        channelPath: match ? match.filePath : '',
        channelSourceName: match ? (match.sourceName || match.storedName || '') : '',
        outputPath: path.join(outDir, outputName),
        resizeMode,
      };
    });

    if (missingChannels.length > 0) {
      const availableChannels = channelIndex.slice(0, 30).map((c) => c.sourceName);
      const availableChannelModels = Array.from(new Set(channelIndex.map((c) => c.baseModel).filter(Boolean))).slice(0, 20);
      const availableChannelAngles = Array.from(new Set(channelIndex.map((c) => c.angle).filter(Boolean))).slice(0, 20);
      return res.status(400).json({
        error: '缺少通道图',
        message: '缺少通道图',
        missingChannels,
        availableChannels,
        availableChannelModels,
        availableChannelAngles,
        channelMatchBuild: CHANNEL_MATCH_BUILD,
      });
    }

    const jobPath = path.join(outDir, `job_cutout_${Date.now()}.json`);
    const resultPath = path.join(outDir, `result_cutout_${Date.now()}.json`);
    fs.writeFileSync(jobPath, JSON.stringify({ tasks, resultPath }, null, 2), 'utf8');
    fs.writeFileSync(
      resultPath,
      JSON.stringify({ ok: false, placeholder: true, error: '等待 Photoshop 生成结果', results: [] }, null, 2),
      'utf8',
    );

    const cutoutJsx = path.join(__dirname, './photoshop/cutout_batch.jsx');
    let parsed = null;
    try {
      await runPhotoshopCommand({
        vbsPath: photoshopIngest.vbsPath,
        jsxPath: cutoutJsx,
        jobPath,
        timeoutMs: 20 * 60 * 1000,
        label: `cutout-batch-no-psd:${batchDir}`,
      });
      const raw = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, 'utf8') : '';
      parsed = raw ? parseJsonSafely(raw) : null;
      if (!parsed || parsed?.placeholder === true) {
        throw new Error('Photoshop 未生成结果文件');
      }
      if (parsed?.ok === false) {
        const msg = parsed?.error != null ? String(parsed.error) : 'Photoshop 执行失败';
        throw new Error(msg);
      }
    } catch (e) {
      const reason = e && e.message ? String(e.message) : String(e);

      const mappedFromFiles = tasks.map((t) => {
        const outPathRaw = t?.outputPath ? String(t.outputPath) : '';
        const outPath = outPathRaw ? resolveExistingPathVariants(outPathRaw) : '';
        const exists = outPath ? fs.existsSync(outPath) : false;
        const sizeOk = exists ? Number(fs.statSync(outPath).size) > 32 : false;
        const ok = exists && sizeOk;
        const rel = outPath ? path.relative(outputRoot, outPath).replace(/\\/g, '/') : '';
        const url = ok && rel ? `/output/${rel}` : null;
        const fileName = outPath ? path.basename(outPath) : null;
        const errors = ok ? [] : normalizeCutoutErrors([{ message: reason }]);
        return { label: t?.label, ok, url, fileName, errors };
      });
      if (mappedFromFiles.some((r) => r.ok === true)) {
        return res.json({ success: true, results: mappedFromFiles, fallback: 'ps_files' });
      }

      const sharpResults = await cutoutNoPsdBatchWithSharp(tasks);
      const mapped = sharpResults.map((r) => {
        const outPathRaw = r?.outputPath ? String(r.outputPath) : '';
        const outPath = outPathRaw ? resolveExistingPathVariants(outPathRaw) : '';
        const rel = outPath ? path.relative(outputRoot, outPath).replace(/\\/g, '/') : '';
        const url = rel ? `/output/${rel}` : null;
        const fileName = outPath ? path.basename(outPath) : null;
        return { label: r?.label, ok: r?.ok === true, url, fileName, errors: normalizeCutoutErrors(r?.errors) };
      });
      return res.json({ success: true, results: mapped, fallback: 'sharp' });
    }

    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    const mapped = results.map((r) => {
      const outPathRaw = r?.outputPath ? String(r.outputPath) : '';
      const outPath = outPathRaw ? resolveExistingPathVariants(outPathRaw) : '';
      const rel = outPath ? path.relative(outputRoot, outPath).replace(/\\/g, '/') : '';
      const url = rel ? `/output/${rel}` : null;
      const fileName = outPath ? path.basename(outPath) : null;
      return { label: r?.label, ok: r?.ok === true, url, fileName, errors: normalizeCutoutErrors(r?.errors) };
    });
    res.json({ success: true, results: mapped });
  } catch (error) {
    console.error('无PSD批量抠图失败:', error);
    const status = Number(error?.status);
    if (status === 400) {
      return res.status(400).json({ error: '无PSD批量抠图失败', message: error.message });
    }
    res.status(500).json({ error: '无PSD批量抠图失败', message: error.message });
  }
});

app.post('/api/cutout/batch-no-psd-compose', async (req, res) => {
  try {
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    const channelsReq = Array.isArray(req.body?.channels) ? req.body.channels : [];
    const compositionsReq = Array.isArray(req.body?.compositions) ? req.body.compositions : [];
    const resizeMode = String(req.body?.resizeMode || 'exact').toLowerCase() === 'exact' ? 'exact' : 'none';
    const dryRun = req.body?.dryRun === true;

    if (images.length === 0) return res.status(400).json({ error: '缺少产品图' });
    if (channelsReq.length === 0) return res.status(400).json({ error: '缺少通道图' });
    if (compositionsReq.length === 0) return res.status(400).json({ error: '缺少 compositions' });

    const channelDirCandidates = [path.join(outputRoot, 'assets', 'channels'), path.join(outputRoot, 'channels')];
    const resolveChannelFilePath = (storedNameRaw) => {
      const storedName = ensureSafeBasename(storedNameRaw);
      if (!storedName) return '';
      for (let i = 0; i < channelDirCandidates.length; i += 1) {
        const dir = channelDirCandidates[i];
        const fp = path.join(dir, storedName);
        if (fs.existsSync(fp)) return fp;
      }
      return path.join(channelDirCandidates[0], storedName);
    };
    const channelIndex = channelsReq
      .map((c) => {
        const storedName = ensureSafeBasename(c?.storedName);
        if (!storedName) return null;
        const filePath = resolveChannelFilePath(storedName);
        const sourceName = String(c?.sourceName || storedName);
        const model = pickModel(sourceName);
        const angle = pickAngle(sourceName);
        const baseModel = model ? String(model).toUpperCase() : null;
        return { storedName, filePath, sourceName, model, baseModel, angle, isGeneric: !model };
      })
      .filter(Boolean);

    const missingChannels = [];
    const batchDir = `cutout_no_psd_compose_${Date.now()}`;
    const outDir = path.join(outputRoot, 'cutout_no_psd', batchDir);
    safeMkdir(outDir);

    const allowedImagesRoot = path.join(outputRoot, 'assets', 'images');
    const tasks = images.map((img, idx) => {
      const rawProductPath = String(img?.imagePath || '').trim();
      const resolvedProductPath = rawProductPath
        ? path.resolve(path.isAbsolute(rawProductPath) ? rawProductPath : path.join(outputRoot, rawProductPath))
        : '';
      if (!resolvedProductPath || !isPathInside(resolvedProductPath, allowedImagesRoot) || !fs.existsSync(resolvedProductPath)) {
        const err = new Error('产品图路径无效或文件不存在');
        err.status = 400;
        throw err;
      }
      const sourceName = String(img?.sourceName || img?.storedName || `image_${idx + 1}`);
      const explain = explainChannelMatch(sourceName, channelIndex, { modelHint: img?.modelHint, angleHint: img?.angleHint });
      const match = explain?.match || null;
      if (!match) {
        missingChannels.push({
          label: String(idx),
          sourceName,
          model: pickModel(sourceName),
          angle: pickAngle(sourceName),
          modelHint: img?.modelHint != null ? String(img.modelHint) : null,
          angleHint: img?.angleHint != null ? String(img.angleHint) : null,
          extracted: explain?.extracted || null,
          candidates: Array.isArray(explain?.candidates) ? explain.candidates : null,
          channelMatchBuild: explain?.build || CHANNEL_MATCH_BUILD,
        });
      } else if (!fs.existsSync(String(match.filePath))) {
        missingChannels.push({
          label: String(idx),
          sourceName,
          model: pickModel(sourceName),
          angle: pickAngle(sourceName),
          modelHint: img?.modelHint != null ? String(img.modelHint) : null,
          angleHint: img?.angleHint != null ? String(img.angleHint) : null,
          missingFilePath: String(match.filePath),
          extracted: explain?.extracted || null,
          candidates: Array.isArray(explain?.candidates) ? explain.candidates : null,
          channelMatchBuild: explain?.build || CHANNEL_MATCH_BUILD,
        });
      }
      const fileBase = sanitizeFileName(sourceName).replace(/\.[^/.]+$/g, '') || `image_${idx + 1}`;
      const outputName = `${String(idx + 1).padStart(4, '0')}_${fileBase}_cutout.png`;
      return {
        label: String(idx),
        productPath: resolvedProductPath,
        channelPath: match ? match.filePath : '',
        channelSourceName: match ? (match.sourceName || match.storedName || '') : '',
        outputPath: path.join(outDir, outputName),
        resizeMode,
        sourceName,
      };
    });

    if (missingChannels.length > 0) {
      const availableChannels = channelIndex.slice(0, 30).map((c) => c.sourceName);
      const availableChannelModels = Array.from(new Set(channelIndex.map((c) => c.baseModel).filter(Boolean))).slice(0, 20);
      const availableChannelAngles = Array.from(new Set(channelIndex.map((c) => c.angle).filter(Boolean))).slice(0, 20);
      return res.status(400).json({
        error: '缺少通道图',
        message: '缺少通道图',
        missingChannels,
        availableChannels,
        availableChannelModels,
        availableChannelAngles,
        channelMatchBuild: CHANNEL_MATCH_BUILD,
      });
    }

    const compositions = compositionsReq.map((c, idx) => {
      const templateKey = String(c?.templateKey || '').trim() || `tpl_${idx}`;
      const imageIndex = Math.floor(Number(c?.imageIndex));
      const canvasWidth = Math.floor(Number(c?.canvasWidth));
      const canvasHeight = Math.floor(Number(c?.canvasHeight));
      const guideLeftX = Math.round(Number(c?.guideLeftX));
      const guideRightX = Math.round(Number(c?.guideRightX));
      if (!Number.isFinite(imageIndex) || imageIndex < 0 || imageIndex >= tasks.length) {
        const err = new Error('无效 imageIndex');
        err.status = 400;
        throw err;
      }
      if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) {
        const err = new Error('无效画布尺寸');
        err.status = 400;
        throw err;
      }
      if (!Number.isFinite(guideLeftX) || !Number.isFinite(guideRightX) || guideRightX <= guideLeftX) {
        const err = new Error('无效参考线区间');
        err.status = 400;
        throw err;
      }
      if (guideLeftX < 0 || guideRightX > canvasWidth) {
        const err = new Error('参考线超出画布范围');
        err.status = 400;
        throw err;
      }
      return { templateKey, imageIndex, canvasWidth, canvasHeight, guideLeftX, guideRightX };
    });

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        tasksCount: tasks.length,
        compositionsCount: compositions.length,
        batchDir,
      });
    }

    const jobPath = path.join(outDir, `job_cutout_${Date.now()}.json`);
    const resultPath = path.join(outDir, `result_cutout_${Date.now()}.json`);
    fs.writeFileSync(jobPath, JSON.stringify({ tasks, resultPath }, null, 2), 'utf8');
    fs.writeFileSync(
      resultPath,
      JSON.stringify({ ok: false, placeholder: true, error: '等待 Photoshop 生成结果', results: [] }, null, 2),
      'utf8',
    );

    const cutoutJsx = path.join(__dirname, './photoshop/cutout_batch.jsx');
    let rawResults = [];
    const hasTgaChannel = tasks.some((t) => String(path.extname(String(t?.channelPath || ''))).toLowerCase() === '.tga');
    const runCutoutByPhotoshop = async () => {
      const attempts = 2;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await runPhotoshopCommand({
          vbsPath: photoshopIngest.vbsPath,
          jsxPath: cutoutJsx,
          jobPath,
          timeoutMs: 20 * 60 * 1000,
          label: `cutout-compose:${batchDir}:try${attempt}`,
        });
        const raw = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, 'utf8') : '';
        const parsed = raw ? parseJsonSafely(raw) : null;
        if (!parsed || parsed?.placeholder === true) {
          if (attempt < attempts) continue;
          throw new Error('Photoshop 未生成结果文件');
        }
        if (parsed?.ok === false) {
          const msg = parsed?.error != null ? String(parsed.error) : 'Photoshop 执行失败';
          throw new Error(msg);
        }
        return Array.isArray(parsed?.results) ? parsed.results : [];
      }
      return [];
    };
    try {
      rawResults = await runCutoutByPhotoshop();
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e);
      if (hasTgaChannel) {
        console.warn('[cutout-compose] Photoshop 抠图失败（TGA 不支持 sharp 兜底）', { batchDir, message: msg });
        rawResults = tasks.map((t) => ({
          label: t?.label != null ? String(t.label) : '',
          ok: false,
          outputPath: t?.outputPath || null,
          errors: [{ message: `photoshop_failed:${msg}` }],
        }));
      } else {
        console.warn('[cutout-compose] Photoshop 执行失败，回退 sharp', { batchDir, message: msg });
        rawResults = await cutoutNoPsdBatchWithSharp(tasks);
      }
    }

    const cutoutByLabel = new Map();
    rawResults.forEach((r) => {
      if (!r) return;
      const label = r?.label != null ? String(r.label) : '';
      if (!label) return;
      cutoutByLabel.set(label, r);
    });

    const pickCutoutErrorMessage = (cutout) => {
      if (!cutout || typeof cutout !== 'object') return null;
      const errors = Array.isArray(cutout.errors) ? cutout.errors : [];
      for (let i = 0; i < errors.length; i += 1) {
        const msg = errors[i] && errors[i].message != null ? String(errors[i].message).trim() : '';
        if (!msg) continue;
        const lowered = msg.toLowerCase();
        if (lowered.startsWith('photoshop_failed:')) {
          return normalizeCutoutErrorMessage(msg.slice('photoshop_failed:'.length));
        }
        if (lowered.includes('failed_to_create_photoshop_application') || lowered.includes('failed_to_run_script')) {
          return `无法启动 Photoshop（可能未安装、权限不足或被安全策略拦截）：${msg}`;
        }
        if (lowered.includes('product_not_found:')) {
          return `产品图文件不存在或路径不可访问：${msg}`;
        }
        if (lowered.includes('channel_not_found:')) {
          return `通道图文件不存在或路径不可访问：${msg}`;
        }
        if (lowered.includes('mask_copy_failed') || lowered.includes('paste_to_channel_failed') || lowered.includes('selection_load_failed')) {
          return `通道拷贝/选区生成失败（可能通道图不含 Alpha 或格式异常）：${msg}`;
        }
        if (lowered.includes('saveforweb') || lowered.includes('exportdocument')) {
          return `PNG 导出失败（Photoshop Save for Web/导出不可用）：${msg}`;
        }
        return normalizeCutoutErrorMessage(msg);
      }
      return null;
    };

    const results = [];
    for (let i = 0; i < compositions.length; i += 1) {
      const c = compositions[i];
      const t = tasks[c.imageIndex];
      const cutout = cutoutByLabel.get(String(t.label)) || null;
      let cutoutPath = resolveExistingPathVariants(t?.outputPath);
      let cutoutExists = cutoutPath ? fs.existsSync(cutoutPath) : false;
      let cutoutOk = cutout ? cutout.ok === true : cutoutExists;
      let sharpRetry = null;
      if ((!cutoutOk || !cutoutExists) && !hasTgaChannel) {
        sharpRetry = await cutoutNoPsdOneWithSharp(t);
        cutoutPath = resolveExistingPathVariants(t?.outputPath);
        cutoutExists = cutoutPath ? fs.existsSync(cutoutPath) : false;
        cutoutOk = (sharpRetry && sharpRetry.ok === true && cutoutExists) || cutoutOk;
      }
      if (!cutoutOk || !cutoutExists) {
        const detail = pickCutoutErrorMessage(cutout);
        const retryMsg =
          sharpRetry && Array.isArray(sharpRetry.errors) && sharpRetry.errors[0] && sharpRetry.errors[0].message != null
            ? String(sharpRetry.errors[0].message)
            : '';
        const channelInfo = t?.channelSourceName ? `（通道:${String(t.channelSourceName)}）` : '';
        const msg = detail
          ? `抠图失败：${detail}`
          : retryMsg
            ? `抠图失败：${normalizeCutoutErrorMessage(retryMsg)}`
            : '抠图结果缺失或任务失败';
        results.push({
          templateKey: c.templateKey,
          imageIndex: c.imageIndex,
          ok: false,
          url: null,
          errors: [{ message: `${msg}${channelInfo}` }],
          match: { channelSourceName: t?.channelSourceName || null },
        });
        continue;
      }
      const tplSafe = sanitizeFileName(c.templateKey).slice(0, 32) || 'template';
      const base = sanitizeFileName(String(t.sourceName || `image_${c.imageIndex + 1}`)).replace(/\.[^/.]+$/g, '') || `image_${c.imageIndex + 1}`;
      const outputName = `${tplSafe}_${String(c.imageIndex + 1).padStart(4, '0')}_${base}.png`;
      const outputPath = path.join(outDir, outputName);
      try {
        await composeCutoutToCanvasPng({
          cutoutPngPath: cutoutPath,
          canvasWidth: c.canvasWidth,
          canvasHeight: c.canvasHeight,
          guideLeftX: c.guideLeftX,
          guideRightX: c.guideRightX,
          outputPngPath: outputPath,
        });
        const rel = path.relative(outputRoot, outputPath).replace(/\\/g, '/');
        results.push({
          templateKey: c.templateKey,
          imageIndex: c.imageIndex,
          ok: true,
          url: rel ? `/output/${rel}` : null,
          errors: [],
          match: { channelSourceName: t?.channelSourceName || null },
        });
      } catch (e) {
        results.push({
          templateKey: c.templateKey,
          imageIndex: c.imageIndex,
          ok: false,
          url: null,
          errors: [{ message: `${normalizeCutoutErrorMessage(e && e.message ? String(e.message) : '合成失败')}${t?.channelSourceName ? `（通道:${String(t.channelSourceName)}）` : ''}` }],
          match: { channelSourceName: t?.channelSourceName || null },
        });
      }
    }

    const relJob = path.relative(outputRoot, jobPath).replace(/\\/g, '/');
    const relResult = path.relative(outputRoot, resultPath).replace(/\\/g, '/');
    res.json({
      success: true,
      batchDir,
      results,
      debug: {
        cutoutEngine: hasTgaChannel ? 'photoshop' : 'auto',
        jobPath: relJob ? `/output/${relJob}` : null,
        resultPath: relResult ? `/output/${relResult}` : null,
      },
    });
  } catch (error) {
    console.error('无PSD批量抠图合成失败:', error);
    const status = Number(error?.status);
    if (status === 400) {
      return res.status(400).json({ error: '无PSD批量抠图合成失败', message: error.message });
    }
    res.status(500).json({ error: '无PSD批量抠图合成失败', message: error.message });
  }
});

app.post('/api/template/batch-export', async (req, res) => {
  const requestId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  try {
    const templateId = String(req.body?.templateId || '').trim();
    if (!isSafeTemplateId(templateId)) return res.status(400).json({ error: '无效的 templateId' });
    const tasksReq = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    if (tasksReq.length === 0) return res.status(400).json({ error: '缺少 tasks' });
    if (tasksReq.length > 200) return res.status(400).json({ error: 'tasks 过多（最多 200）' });

    const formatReq = String(req.body?.format || 'png').toLowerCase();
    const channels = Array.isArray(req.body?.channels) ? req.body.channels : [];
    const useChannelMaskAlignment = req.body?.useChannelMaskAlignment === true;
    const bundlePsd = req.body?.bundlePsd === true;
    if (bundlePsd) {
      const safeFormat = String(formatReq || '').toLowerCase();
      if (safeFormat && safeFormat !== 'psd') {
        return res.status(400).json({ error: '合并导出仅支持 PSD 格式' });
      }
      const result = await photoshopIngest.exportTemplateBatchBundlePsd({
        templateId,
        variables: Array.isArray(req.body?.variables) ? req.body.variables : [],
        tasks: tasksReq,
        channels,
        useChannelMaskAlignment,
        dryRun: req.body?.dryRun === true,
      });
      console.info(`[batch-export][${requestId}] 合并PSD导出完成`, {
        templateId,
        format: 'psd',
        bundlePsd: true,
        tasks: tasksReq.length,
        ok: true,
        url: result?.bundle?.url || null,
        scriptBuild: result?.scriptBuild != null ? String(result.scriptBuild) : null,
      });
      return res.json({ success: true, requestId, ...result });
    }

    const format = formatReq === 'jpeg' || formatReq === 'jpg' ? 'jpeg' : formatReq === 'psd' ? 'psd' : 'png';
    const quality = Math.max(1, Math.min(100, Number(req.body?.quality) || 100));

    const result = await photoshopIngest.exportTemplateBatch({
      templateId,
      variables: Array.isArray(req.body?.variables) ? req.body.variables : [],
      tasks: tasksReq,
      format,
      quality,
      channels,
      useChannelMaskAlignment,
      dryRun: req.body?.dryRun === true,
    });

    const results = Array.isArray(result?.results) ? result.results : [];
    const mapped = results.map((r) => ({
      label: r?.label != null ? String(r.label) : '',
      ok: r?.ok === true,
      url: r?.url ? String(r.url) : null,
      errors: Array.isArray(r?.errors) ? r.errors : [],
    }));

    res.json({
      success: true,
      requestId,
      batchDir: result?.batchDir || null,
      results: mapped,
      scriptBuild: result?.scriptBuild != null ? String(result.scriptBuild) : null,
    });
    console.info(`[batch-export][${requestId}] 批量导出完成`, {
      templateId,
      format,
      bundlePsd: false,
      tasks: tasksReq.length,
      ok: true,
      results: mapped.length,
      okCount: mapped.filter((r) => r.ok === true).length,
      scriptBuild: result?.scriptBuild != null ? String(result.scriptBuild) : null,
    });
  } catch (error) {
    console.error(`[batch-export][${requestId}] 批量导出失败:`, error);
    const status = Number(error?.status);
    const missingChannels = Array.isArray(error?.missingChannels) ? error.missingChannels : [];
    const availableChannels = Array.isArray(error?.availableChannels) ? error.availableChannels : [];
    const availableChannelModels = Array.isArray(error?.availableChannelModels) ? error.availableChannelModels : [];
    const availableChannelAngles = Array.isArray(error?.availableChannelAngles) ? error.availableChannelAngles : [];
    const channelMatchBuild = error?.channelMatchBuild != null ? String(error.channelMatchBuild) : null;
    if (status === 400) {
      return res.status(400).json({
        error: '批量导出失败',
        message: error.message,
        requestId,
        missingChannels,
        availableChannels,
        availableChannelModels,
        availableChannelAngles,
        channelMatchBuild,
      });
    }
    res.status(500).json({
      error: '批量导出失败',
      message: error.message,
      requestId,
      missingChannels,
      availableChannels,
      availableChannelModels,
      availableChannelAngles,
      channelMatchBuild,
    });
  }
});

app.post('/api/template/export-variable-images', async (req, res) => {
  try {
    const { templateId, variables, updates, variants, dryRun } = req.body || {};
    if (!templateId) return res.status(400).json({ error: '缺少 templateId' });
    if (!isSafeTemplateId(templateId)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }

    const result = await photoshopIngest.exportVariableImages({
      templateId,
      variables,
      updates,
      variants,
      dryRun: dryRun === true,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('图片变量导出失败:', error);
    res.status(500).json({ error: '图片变量导出失败', message: error.message });
  }
});

app.post('/api/template/ingest', upload.single('psd'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 PSD 文件' });
    const safeOriginalName = normalizeUploadOriginalName(req.file.originalname);
    const result = await photoshopIngest.ingestPsd(req.file.buffer, safeOriginalName);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('模板入库失败:', error);
    res.status(500).json({ error: '模板入库失败', message: error.message });
  }
});

app.post('/api/template/:id/replace-psd', requireAdmin, upload.single('psd'), async (req, res) => {
  try {
    const templateId = String(req.params?.id || '').trim();
    if (!isSafeTemplateId(templateId)) return res.status(400).json({ error: '无效的 templateId' });
    if (!req.file) return res.status(400).json({ error: '请上传 PSD 文件' });

    const safeOriginalName = normalizeUploadOriginalName(req.file.originalname);

    const { templateDir, manifest: oldManifest } = await slotConfigService.readManifest(templateId);
    const oldVars = Array.isArray(oldManifest?.variables) ? oldManifest.variables : [];
    const oldConfig = await slotConfigService.readSlotConfig(templateId);

    const ingestResult = await photoshopIngest.ingestPsd(req.file.buffer, safeOriginalName);
    const tempId = String(ingestResult?.id || '').trim();
    if (!isSafeTemplateId(tempId)) throw new Error('替换失败：临时模板ID无效');

    const tempDir = path.join(outputRoot, 'templates', tempId);
    const tempManifestPath = path.join(tempDir, 'manifest.json');
    const tempManifestRaw = await fs.promises.readFile(tempManifestPath, 'utf-8');
    const tempManifest = JSON.parse(tempManifestRaw);
    const newVars = Array.isArray(tempManifest?.variables) ? tempManifest.variables : [];

    const migrated = migrateSlotConfig({ oldVars, newVars, oldConfig, templateId });

    const oldFrontendConfig = oldManifest?.frontendConfig && typeof oldManifest.frontendConfig === 'object'
      ? oldManifest.frontendConfig
      : null;
    const hasOldGuidePicks = !!(oldFrontendConfig?.guidePicks && typeof oldFrontendConfig.guidePicks === 'object');
    const migratedGuidePicks = hasOldGuidePicks
      ? migrateGuidePicks({
          oldGuidePicks: oldFrontendConfig.guidePicks,
          oldVars,
          newVars,
          oldPsIdToNew: migrated?.mapping?.oldPsIdToNew,
        })
      : null;
    const nextFrontendConfig = (() => {
      if (!oldFrontendConfig) return null;
      if (!hasOldGuidePicks) return oldFrontendConfig;
      return {
        ...oldFrontendConfig,
        guidePicks: migratedGuidePicks,
      };
    })();

    const mergedManifest = {
      ...tempManifest,
      id: templateId,
      name:
        typeof oldManifest?.name === 'string' && oldManifest.name.trim()
          ? oldManifest.name.trim()
          : tempManifest?.name,
      originalPsdName: safeOriginalName || tempManifest?.originalPsdName || tempManifest?.name || null,
      ...(oldManifest && typeof oldManifest === 'object' ? (oldManifest.isUserSaved ? { isUserSaved: true } : {}) : {}),
      ...(oldManifest && typeof oldManifest === 'object' && oldManifest.savedAt ? { savedAt: oldManifest.savedAt } : {}),
      ...(nextFrontendConfig ? { frontendConfig: nextFrontendConfig } : {}),
    };

    await fs.promises.writeFile(path.join(templateDir, 'manifest.json'), JSON.stringify(mergedManifest, null, 2), 'utf-8');

    const filesToCopy = ['source.psd', 'backdrop.png', 'reference.png', 'job.json', 'result.json', 'job_reference.json', 'result_reference.json'];
    for (const name of filesToCopy) {
      const src = path.join(tempDir, name);
      if (!fs.existsSync(src)) continue;
      await fs.promises.copyFile(src, path.join(templateDir, name));
    }

    const tempImagesDir = path.join(tempDir, 'images');
    if (fs.existsSync(tempImagesDir) && fs.statSync(tempImagesDir).isDirectory()) {
      const dstImagesDir = path.join(templateDir, 'images');
      await fs.promises.mkdir(dstImagesDir, { recursive: true });
      const ents = await fs.promises.readdir(tempImagesDir, { withFileTypes: true });
      for (const ent of ents) {
        if (!ent || !ent.isFile()) continue;
        const src = path.join(tempImagesDir, ent.name);
        const dst = path.join(dstImagesDir, ent.name);
        await fs.promises.copyFile(src, dst);
      }
    }

    await slotConfigService.saveSlotConfig(templateId, migrated.config);

    await fs.promises.rm(tempDir, { recursive: true, force: true });

    res.json({ success: true, templateId, migrationReport: migrated.report });
  } catch (error) {
    console.error('替换PSD失败:', error);
    const status = Number(error?.status);
    if (status === 400) return res.status(400).json({ error: '替换PSD失败', message: error.message });
    res.status(500).json({ error: '替换PSD失败', message: error.message });
  }
});

app.post('/api/template/export', async (req, res) => {
  const requestId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  try {
    const { templateId, values, variables, updates, format, quality, dryRun, isPsdAutoFill, allowDupImageGuideMismatch } = req.body || {};
    if (!templateId) return res.status(400).json({ error: '缺少 templateId' });
    if (!isSafeTemplateId(templateId)) {
      return res.status(400).json({ error: '无效的 templateId' });
    }

    /**
     * 汇总导出请求的关键字段（用于定位协议不一致问题）
     * @param {any} body - 请求体
     * @returns {{keys: string[], updatesCount: number, valuesCount: number, variablesCount: number}}
     */
    const summarizeExportBody = (body) => {
      const b = body || {};
      const keys = Object.keys(b);
      const updatesCount = Array.isArray(b.updates) ? b.updates.length : 0;
      const valuesCount = b.values && typeof b.values === 'object' ? Object.keys(b.values).length : 0;
      const variablesCount = Array.isArray(b.variables) ? b.variables.length : 0;
      return { keys, updatesCount, valuesCount, variablesCount };
    };

    const summary = summarizeExportBody(req.body);
    console.log(
      `[API Debug][export][${requestId}] /api/template/export body:`,
      `keys=${summary.keys.join(',')}`,
      `updates=${summary.updatesCount}`,
      `values=${summary.valuesCount}`,
      `variables=${summary.variablesCount}`,
    );

    const requestFormat = String(format || 'png').toLowerCase();
    const result = await photoshopIngest.exportTemplate({
      templateId,
      values: values || {},
      variables,
      updates,
      format: requestFormat,
      quality,
      dryRun: dryRun === true,
      isPsdAutoFill: isPsdAutoFill === true,
      allowDupImageGuideMismatch: allowDupImageGuideMismatch === true,
    });
    res.json({ success: true, requestId, ...result });
  } catch (error) {
    console.error(`[export][${requestId}] 模板导出失败:`, error);
    const status = Number(error?.status);
    const missingChannels = Array.isArray(error?.missingChannels) ? error.missingChannels : [];
    const availableChannels = Array.isArray(error?.availableChannels) ? error.availableChannels : [];
    const availableChannelModels = Array.isArray(error?.availableChannelModels) ? error.availableChannelModels : [];
    const availableChannelAngles = Array.isArray(error?.availableChannelAngles) ? error.availableChannelAngles : [];
    const channelMatchBuild = error?.channelMatchBuild != null ? String(error.channelMatchBuild) : null;
    const stack = error?.stack != null ? String(error.stack) : null;
    const jobPath = error?.jobPath != null ? String(error.jobPath) : null;
    const resultPath = error?.resultPath != null ? String(error.resultPath) : null;
    const scriptBuild = error?.scriptBuild != null ? String(error.scriptBuild) : null;
    const code = error?.code != null ? String(error.code) : null;
    const dupImageGuideMismatch =
      error?.dupImageGuideMismatch && typeof error.dupImageGuideMismatch === 'object'
        ? error.dupImageGuideMismatch
        : null;
    const humanDebug = jobPath ? await analyzeExportJobForHumans(jobPath) : null;
    const mapped = {
      error: '模板导出失败',
      message: error?.message || '未知错误',
      requestId,
      code,
      dupImageGuideMismatch,
      missingChannels,
      availableChannels,
      availableChannelModels,
      availableChannelAngles,
      channelMatchBuild,
      scriptBuild,
      jobPath,
      resultPath,
      humanDebug,
      ...(process.env.NODE_ENV === 'production' ? {} : { stack }),
    };
    if (status === 400) return res.status(400).json(mapped);
    res.status(500).json(mapped);
  }
});

app.post('/api/render/image', upload.single('image'), async (req, res) => {
  try {
    const { html, width, height, format, quality } = req.body;

    const options = {
      width: parseInt(width) || 790,
      height: parseInt(height) || 1200,
      format: format || 'png',
      quality: parseInt(quality) || 100,
    };

    const result = await puppeteerService.renderToImage(html, options);

    res.setHeader('Content-Type', `image/${options.format}`);
    res.setHeader('Content-Length', result.data.length);
    res.setHeader('X-Width', result.width);
    res.setHeader('X-Height', result.height);
    res.send(result.data);
  } catch (error) {
    console.error('渲染失败:', error);
    res.status(500).json({
      error: '渲染失败',
      message: error.message,
    });
  }
});

app.post('/api/render/pdf', async (req, res) => {
  try {
    const { html, width, height, scale, margin } = req.body;

    const options = {
      width: parseInt(width) || 790,
      height: parseInt(height) || 1200,
      scale: parseFloat(scale) || 1,
      margin: margin || { top: 0, right: 0, bottom: 0, left: 0 },
    };

    const result = await puppeteerService.renderToPDF(html, options);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.data.length);
    res.send(result.data);
  } catch (error) {
    console.error('PDF生成失败:', error);
    res.status(500).json({
      error: 'PDF生成失败',
      message: error.message,
    });
  }
});

app.post('/api/render/batch', async (req, res) => {
  try {
    const { layers, options } = req.body;

    if (!layers || !Array.isArray(layers)) {
      return res.status(400).json({
        error: '无效的图层数据',
      });
    }

    const outputDir = path.join(outputRoot, `batch_${Date.now()}`);
    fs.mkdirSync(outputDir, { recursive: true });

    const results = await puppeteerService.renderMultiple(layers, {
      ...options,
      outputDir,
    });

    res.json({
      success: true,
      outputDir,
      files: results,
    });
  } catch (error) {
    console.error('批量渲染失败:', error);
    res.status(500).json({
      error: '批量渲染失败',
      message: error.message,
    });
  }
});

app.post('/api/image/process', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' });
    }

    const imageBuffer = req.file.buffer;
    const options = JSON.parse(req.body.options || '{}');

    const result = await sharpProcessor.processImage(imageBuffer, options);

    res.setHeader('Content-Type', `image/${options.format || 'png'}`);
    res.setHeader('Content-Length', result.data.length);
    res.send(result.data);
  } catch (error) {
    console.error('图片处理失败:', error);
    res.status(500).json({
      error: '图片处理失败',
      message: error.message,
    });
  }
});

app.post('/api/image/crop', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' });
    }

    const { left, top, width, height } = req.body;
    const cropOptions = {
      left: parseInt(left),
      top: parseInt(top),
      width: parseInt(width),
      height: parseInt(height),
    };

    const result = await sharpProcessor.cropImage(req.file.buffer, cropOptions);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', result.length);
    res.send(result);
  } catch (error) {
    console.error('图片裁剪失败:', error);
    res.status(500).json({
      error: '图片裁剪失败',
      message: error.message,
    });
  }
});

app.post('/api/image/slice', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' });
    }

    const slices = JSON.parse(req.body.slices || '[]');
    const options = JSON.parse(req.body.options || '{}');

    const results = await sharpProcessor.sliceImage(req.file.buffer, slices, {
      ...options,
      outputDir: path.join(outputRoot, 'slices'),
    });

    res.json({
      success: true,
      slices: results,
    });
  } catch (error) {
    console.error('图片切片失败:', error);
    res.status(500).json({
      error: '图片切片失败',
      message: error.message,
    });
  }
});

app.post('/api/image/optimize', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' });
    }

    const options = JSON.parse(req.body.options || '{}');

    const result = await sharpProcessor.optimizeImage(req.file.buffer, options);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', result.length);
    res.send(result);
  } catch (error) {
    console.error('图片优化失败:', error);
    res.status(500).json({
      error: '图片优化失败',
      message: error.message,
    });
  }
});

app.post('/api/image/responsive', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片' });
    }

    const breakpoints = JSON.parse(req.body.breakpoints || '[]');
    const options = JSON.parse(req.body.options || '{}');

    const results = await sharpProcessor.createResponsiveImages(req.file.buffer, breakpoints, options);

    res.json({
      success: true,
      images: results,
    });
  } catch (error) {
    console.error('响应式图片生成失败:', error);
    res.status(500).json({
      error: '响应式图片生成失败',
      message: error.message,
    });
  }
});

app.post('/api/image/watermark', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'watermark', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.files.image || !req.files.watermark) {
      return res.status(400).json({ error: '请上传图片和水印' });
    }

    const options = JSON.parse(req.body.options || '{}');

    const result = await sharpProcessor.addWatermark(
      req.files.image[0].buffer,
      req.files.watermark[0].buffer,
      options
    );

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', result.length);
    res.send(result);
  } catch (error) {
    console.error('添加水印失败:', error);
    res.status(500).json({
      error: '添加水印失败',
      message: error.message,
    });
  }
});

app.get('/api/image/info', async (req, res) => {
  try {
    const imageUrl = req.query.url;

    if (!imageUrl) {
      return res.status(400).json({ error: '请提供图片URL' });
    }

    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();

    const info = await sharpProcessor.getImageInfo(Buffer.from(imageBuffer));

    res.json(info);
  } catch (error) {
    console.error('获取图片信息失败:', error);
    res.status(500).json({
      error: '获取图片信息失败',
      message: error.message,
    });
  }
});

app.post('/api/image/compare', upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.files.image1 || !req.files.image2) {
      return res.status(400).json({ error: '请上传两张图片进行比较' });
    }

    const options = JSON.parse(req.body.options || '{}');

    const result = await sharpProcessor.compareImages(
      req.files.image1[0].buffer,
      req.files.image2[0].buffer,
      options
    );

    res.json(result);
  } catch (error) {
    console.error('图片比较失败:', error);
    res.status(500).json({
      error: '图片比较失败',
      message: error.message,
    });
  }
});

app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await puppeteerService.getPerformanceMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: '获取性能指标失败',
      message: error.message,
    });
  }
});

app.use('/output', express.static(outputRoot));

const distDir = path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  console.log('Serving frontend from:', distDir);
  app.use(express.static(distDir));
  
  // SPA fallback
  app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/output/') || req.path.startsWith('/templates/') || req.path.startsWith('/3-')) {
      return next();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.warn('Frontend dist not found at:', distDir);
}

app.use((err, req, res, next) => {
  // 专门处理 Multer 错误
  if (err instanceof multer.MulterError) {
    console.error('文件上传错误:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: '文件上传失败', 
        message: '文件大小超过限制 (最大 2GB)' 
      });
    }
    return res.status(400).json({ 
      error: '文件上传失败', 
      message: err.message 
    });
  }
  next(err);
});

app.use((err, req, res, _next) => {
  console.error('服务器错误:', err);
  // 确保 message 有值，避免前端只显示 generic 的 error
  const message = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
  res.status(500).json({
    error: '服务器内部错误',
    message: message || '未知错误',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

const gracefulShutdown = async () => {
  console.log('正在关闭服务...');
  await puppeteerService.close();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('uncaughtException', (err) => {
  const msg = `[fatal][uncaughtException] ${err?.stack || err?.message || String(err)}`;
  console.error(msg);
  fs.appendFileSync(path.join(__dirname, '../logs/dev_server.log'), `\n${new Date().toISOString()} ${msg}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = `[fatal][unhandledRejection] ${reason?.stack || reason?.message || String(reason)}`;
  console.error(msg);
  fs.appendFileSync(path.join(__dirname, '../logs/dev_server.log'), `\n${new Date().toISOString()} ${msg}\n`);
});

const server = app.listen(PORT, () => {
  console.log(`🚀 PSD渲染服务已启动: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
});

export { server };
export default app;
