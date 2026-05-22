import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { isSafeTemplateId } from './slotConfigService.js';

function safeMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(name) {
  const s = String(name || '').trim();
  if (!s) throw new Error('任务模板名称不能为空');
  if (s.length > 60) throw new Error('任务模板名称过长（最多 60 字）');
  return s;
}

function ensureTemplateOnDisk(outputRoot, templateId) {
  const psdPath = path.join(outputRoot, 'templates', templateId, 'source.psd');
  if (!fs.existsSync(psdPath)) {
    throw new Error(`任务模板引用的 PSD 不存在或已被清理（templateId=${templateId}）`);
  }
}

function templateExistsOnDisk(outputRoot, templateId) {
  const psdPath = path.join(outputRoot, 'templates', templateId, 'source.psd');
  return fs.existsSync(psdPath);
}

function readTemplateOriginalPsdName(outputRoot, templateId) {
  const manifestPath = path.join(outputRoot, 'templates', templateId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return '';
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = raw ? JSON.parse(raw) : null;
    const normalizeUploadOriginalName = (input) => {
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
    };
    const original = typeof manifest?.originalPsdName === 'string' ? normalizeUploadOriginalName(manifest.originalPsdName).trim() : '';
    if (original) return original;
    const legacyName = typeof manifest?.name === 'string' ? normalizeUploadOriginalName(manifest.name).trim() : '';
    if (legacyName && /\.psd$/i.test(legacyName)) return legacyName;
    return '';
  } catch {
    return '';
  }
}

function readTemplateVariables(outputRoot, templateId) {
  const manifestPath = path.join(outputRoot, 'templates', templateId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = raw ? JSON.parse(raw) : null;
    const vars = Array.isArray(manifest?.variables) ? manifest.variables : [];
    return vars;
  } catch {
    return [];
  }
}

function buildImageVariableMaps(vars) {
  const list = Array.isArray(vars) ? vars : [];
  const psIdToVarId = new Map();
  const varIdToPsId = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const v = list[i];
    if (!v) continue;
    const t = String(v?.varType || v?.type || '').toLowerCase();
    if (t !== 'img' && t !== 'image') continue;
    const id = v?.id != null ? String(v.id).trim() : '';
    const psId = Math.trunc(Number(v?.psId));
    if (!id) continue;
    if (!Number.isFinite(psId)) continue;
    psIdToVarId.set(psId, id);
    varIdToPsId.set(id, psId);
  }
  return { psIdToVarId, varIdToPsId };
}

function normalizeSelectedVarIds(raw) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const s = String(list[i] || '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normalizeGuidePicks(rawGuidePicks, selectedPsIds) {
  const psIdSet = new Set(Array.isArray(selectedPsIds) ? selectedPsIds : []);
  if (psIdSet.size === 0) return [];

  const out = [];
  const pushPick = (psIdRaw, pick) => {
    const psId = Math.trunc(Number(psIdRaw));
    if (!Number.isFinite(psId) || psId <= 0) return;
    if (!psIdSet.has(psId)) return;
    const leftX = Number(pick?.leftX);
    const rightX = Number(pick?.rightX);
    if (!Number.isFinite(leftX) || !Number.isFinite(rightX)) return;
    if (rightX <= leftX) return;
    out.push({ psId, leftX, rightX });
  };

  if (Array.isArray(rawGuidePicks)) {
    for (let i = 0; i < rawGuidePicks.length; i += 1) {
      const row = rawGuidePicks[i];
      if (!row || typeof row !== 'object') continue;
      pushPick(row.psId, row);
    }
    return out;
  }

  if (rawGuidePicks && typeof rawGuidePicks === 'object') {
    const keys = Object.keys(rawGuidePicks);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      pushPick(k, rawGuidePicks[k]);
    }
    return out;
  }

  return [];
}

function normalizeExportFormats(rawExportFormats) {
  if (rawExportFormats == null) return null;
  const list = Array.isArray(rawExportFormats) ? rawExportFormats : [rawExportFormats];
  const allowed = new Set(['png', 'jpeg', 'psd']);
  const outSet = new Set();
  for (let i = 0; i < list.length; i += 1) {
    let fmt = String(list[i] || '')
      .trim()
      .toLowerCase();
    if (!fmt) continue;
    if (fmt === 'jpg') fmt = 'jpeg';
    if (!allowed.has(fmt)) continue;
    outSet.add(fmt);
  }
  const out = Array.from(outSet.values());
  if (out.length === 0) throw new Error('任务模板导出格式不能为空');
  const order = ['png', 'jpeg', 'psd'];
  out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return out;
}

function normalizeItems(items, outputRoot) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) throw new Error('任务模板至少需要包含 1 个 PSD');
  if (list.length > 50) throw new Error('任务模板包含的 PSD 过多（最多 50 个）');
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const it = list[i] || {};
    const templateId = String(it.templateId || '').trim();
    if (!isSafeTemplateId(templateId)) throw new Error('任务模板包含无效的 templateId');
    if (seen.has(templateId)) throw new Error(`任务模板包含重复的 PSD（templateId=${templateId}）`);
    seen.add(templateId);
    ensureTemplateOnDisk(outputRoot, templateId);
    const originalPsdName = readTemplateOriginalPsdName(outputRoot, templateId);
    const vars = readTemplateVariables(outputRoot, templateId);
    const { psIdToVarId, varIdToPsId } = buildImageVariableMaps(vars);
    const rawPsIds = Array.isArray(it.selectedPsIds) ? it.selectedPsIds : [];
    const psIdSet = new Set();
    for (let j = 0; j < rawPsIds.length; j += 1) {
      const n = Number(rawPsIds[j]);
      if (!Number.isFinite(n)) continue;
      const v = Math.trunc(n);
      if (v <= 0) continue;
      psIdSet.add(v);
    }
    const rawVarIds = normalizeSelectedVarIds(it.selectedVarIds);
    for (let j = 0; j < rawVarIds.length; j += 1) {
      const psId = varIdToPsId.get(rawVarIds[j]);
      if (!Number.isFinite(psId) || psId <= 0) continue;
      psIdSet.add(psId);
    }
    const selectedPsIds = Array.from(psIdSet.values()).sort((a, b) => a - b);
    let selectedVarIds = rawVarIds;
    if (selectedVarIds.length === 0 && selectedPsIds.length > 0 && psIdToVarId.size > 0) {
      const inferred = [];
      const inferredSeen = new Set();
      for (let j = 0; j < selectedPsIds.length; j += 1) {
        const varId = psIdToVarId.get(selectedPsIds[j]) || '';
        if (!varId || inferredSeen.has(varId)) continue;
        inferredSeen.add(varId);
        inferred.push(varId);
      }
      selectedVarIds = inferred;
    }
    if (selectedPsIds.length === 0 && selectedVarIds.length === 0) throw new Error('任务模板中存在未选择变量的 PSD');
    const guidePicks = normalizeGuidePicks(it.guidePicks, selectedPsIds);
    const guidePicksVarIds = Array.isArray(guidePicks)
      ? Object.fromEntries(
          guidePicks
            .map((p) => {
              const vid = psIdToVarId.get(p.psId) || '';
              if (!vid) return null;
              return [vid, { leftX: p.leftX, rightX: p.rightX }];
            })
            .filter(Boolean),
        )
      : {};
    const exportFormats = normalizeExportFormats(it.exportFormats);
    out.push({
      templateId,
      selectedPsIds,
      selectedVarIds,
      guidePicks,
      guidePicksVarIds,
      exportFormats,
      originalPsdName,
      sortOrder: out.length,
    });
  }
  if (out.length === 0) throw new Error('任务模板至少需要包含 1 个 PSD');
  return out;
}

function normalizeDbShape(parsed) {
  const nextId = Number(parsed?.nextId);
  const templates = Array.isArray(parsed?.templates) ? parsed.templates : [];
  return {
    nextId: Number.isInteger(nextId) && nextId > 0 ? nextId : 1,
    templates,
  };
}

function migrateFromSqliteWithBetterSqlite3(sqlitePath) {
  const require = createRequire(import.meta.url);
  let Database = null;
  try {
    Database = require('better-sqlite3');
  } catch {
    return null;
  }
  if (!Database) return null;
  let db = null;
  try {
    db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
  try {
    const templates = db
      .prepare('SELECT id, name, created_at, updated_at FROM task_templates ORDER BY updated_at DESC, id DESC')
      .all();
    if (!Array.isArray(templates) || templates.length === 0) return [];

    const items = db
      .prepare('SELECT task_template_id, template_id, sort_order FROM task_template_items ORDER BY sort_order ASC, id ASC')
      .all();
    const psRows = db
      .prepare('SELECT task_template_id, template_id, ps_id FROM task_template_selected_psids ORDER BY template_id ASC, ps_id ASC')
      .all();
    const pickRows = db
      .prepare('SELECT task_template_id, template_id, ps_id, left_x, right_x FROM task_template_guide_picks ORDER BY template_id ASC, ps_id ASC')
      .all();

    const itemsByTpl = new Map();
    items.forEach((row) => {
      const tid = Number(row?.task_template_id);
      if (!Number.isFinite(tid)) return;
      const list = itemsByTpl.get(tid) || [];
      list.push({
        templateId: String(row?.template_id || '').trim(),
        sortOrder: Number(row?.sort_order) || 0,
      });
      itemsByTpl.set(tid, list);
    });

    const selectedByTpl = new Map();
    psRows.forEach((row) => {
      const tid = Number(row?.task_template_id);
      if (!Number.isFinite(tid)) return;
      const templateId = String(row?.template_id || '').trim();
      if (!templateId) return;
      const map = selectedByTpl.get(tid) || new Map();
      const set = map.get(templateId) || new Set();
      const psId = Math.trunc(Number(row?.ps_id));
      if (Number.isFinite(psId) && psId > 0) set.add(psId);
      map.set(templateId, set);
      selectedByTpl.set(tid, map);
    });

    const guideByTpl = new Map();
    pickRows.forEach((row) => {
      const tid = Number(row?.task_template_id);
      if (!Number.isFinite(tid)) return;
      const templateId = String(row?.template_id || '').trim();
      if (!templateId) return;
      const map = guideByTpl.get(tid) || new Map();
      const picks = map.get(templateId) || {};
      const psId = Math.trunc(Number(row?.ps_id));
      const leftX = Number(row?.left_x);
      const rightX = Number(row?.right_x);
      if (Number.isFinite(psId) && psId > 0 && Number.isFinite(leftX) && Number.isFinite(rightX) && rightX > leftX) {
        picks[String(psId)] = { leftX: Number(leftX), rightX: Number(rightX) };
      }
      map.set(templateId, picks);
      guideByTpl.set(tid, map);
    });

    const out = templates.map((t) => {
      const tid = Number(t?.id);
      const list = (itemsByTpl.get(tid) || [])
        .slice()
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const selectedMap = selectedByTpl.get(tid) || new Map();
      const guideMap = guideByTpl.get(tid) || new Map();
      const finalItems = list
        .map((it) => {
          const templateId = String(it.templateId || '').trim();
          if (!templateId) return null;
          const psSet = selectedMap.get(templateId) || new Set();
          const selectedPsIds = Array.from(psSet.values()).sort((a, b) => a - b);
          const guidePicks = guideMap.get(templateId) || {};
          return { templateId, selectedPsIds, guidePicks };
        })
        .filter(Boolean);
      return {
        id: Number(t?.id || 0),
        name: String(t?.name || ''),
        createdAt: String(t?.created_at || ''),
        updatedAt: String(t?.updated_at || ''),
        items: finalItems,
      };
    });
    return out;
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      void 0;
    }
  }
}

export default class TaskTemplateService {
  constructor({ outputRoot }) {
    this.outputRoot = outputRoot;
    const dbDir = path.join(outputRoot, 'db');
    safeMkdir(dbDir);
    this.dbPath = path.join(dbDir, 'task_templates.json');
    this.sqlitePath = path.join(dbDir, 'task_templates.sqlite');
    this.migrateMarkerPath = path.join(dbDir, 'task_templates.sqlite.migrated');
    this.dbCreatedAtStartup = false;
    this.ensureSchema();
    this.maybeMigrateFromSqlite();
  }

  ensureSchema() {
    if (fs.existsSync(this.dbPath)) return;
    const initial = { nextId: 1, templates: [] };
    fs.writeFileSync(this.dbPath, JSON.stringify(initial, null, 2), 'utf8');
    this.dbCreatedAtStartup = true;
  }

  maybeMigrateFromSqlite() {
    try {
      if (fs.existsSync(this.migrateMarkerPath)) return;
      if (!fs.existsSync(this.sqlitePath)) return;
      const db = this.readDb();
      const hasData = Array.isArray(db.templates) && db.templates.length > 0;
      const hasMojibake = hasData && db.templates.some((t) => String(t?.name || '').includes('�'));
      if (hasData && !hasMojibake) return;
      if (!hasData && this.dbCreatedAtStartup !== true) return;
      const py = `
import sqlite3, json, sys
try:
  sys.stdout.reconfigure(encoding="utf-8")
except Exception:
  pass
db_path = sys.argv[1]
con = sqlite3.connect(db_path)
cur = con.cursor()
cur.execute("SELECT id, name, created_at, updated_at FROM task_templates ORDER BY updated_at DESC, id DESC")
tpl_rows = cur.fetchall()
out = []
for (tid, name, created_at, updated_at) in tpl_rows:
  cur.execute("SELECT template_id, sort_order FROM task_template_items WHERE task_template_id = ? ORDER BY sort_order ASC, id ASC", (tid,))
  items = cur.fetchall()
  cur.execute("SELECT template_id, ps_id FROM task_template_selected_psids WHERE task_template_id = ? ORDER BY template_id ASC, ps_id ASC", (tid,))
  ps_rows = cur.fetchall()
  cur.execute("SELECT template_id, ps_id, left_x, right_x FROM task_template_guide_picks WHERE task_template_id = ? ORDER BY template_id ASC, ps_id ASC", (tid,))
  pick_rows = cur.fetchall()
  by_tid = {}
  for (template_id, sort_order) in items:
    by_tid[template_id] = {"templateId": template_id, "selectedPsIds": [], "guidePicks": {}}
  for (template_id, ps_id) in ps_rows:
    if template_id in by_tid:
      by_tid[template_id]["selectedPsIds"].append(int(ps_id))
  for (template_id, ps_id, left_x, right_x) in pick_rows:
    if template_id in by_tid and ps_id is not None and left_x is not None and right_x is not None:
      by_tid[template_id]["guidePicks"][str(int(ps_id))] = {"leftX": float(left_x), "rightX": float(right_x)}
  final_items = []
  for (template_id, sort_order) in items:
    it = by_tid.get(template_id)
    if not it:
      continue
    it["selectedPsIds"] = sorted(list(set(it["selectedPsIds"])))
    final_items.append(it)
  out.append({"id": int(tid), "name": name or "", "createdAt": created_at or "", "updatedAt": updated_at or "", "items": final_items})
print(json.dumps(out, ensure_ascii=False))
`;
      let migrated = [];
      try {
        const stdout = execFileSync('python', ['-X', 'utf8', '-c', py, this.sqlitePath], {
          encoding: 'utf8',
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        migrated = stdout ? JSON.parse(stdout) : [];
      } catch {
        const fallback = migrateFromSqliteWithBetterSqlite3(this.sqlitePath);
        migrated = Array.isArray(fallback) ? fallback : [];
      }
      if (!Array.isArray(migrated) || migrated.length === 0) return;
      const maxId = Math.max(...migrated.map((t) => Number(t?.id || 0)));
      db.templates = migrated;
      db.nextId = Number.isFinite(maxId) && maxId > 0 ? maxId + 1 : 1;
      this.writeDb(db);
      fs.writeFileSync(this.migrateMarkerPath, nowIso(), 'utf8');
    } catch (e) {
      void e;
    }
  }

  readDb() {
    this.ensureSchema();
    const parseText = (text) => {
      let cleaned = String(text || '');
      if (cleaned.charCodeAt(0) === 0xfeff) cleaned = cleaned.slice(1);
      if (cleaned.includes('\u0000')) cleaned = cleaned.split('\u0000').join('');
      if (!cleaned.trim()) return null;
      return JSON.parse(cleaned);
    };
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      const parsed = parseText(raw);
      if (parsed && typeof parsed === 'object') return normalizeDbShape(parsed);
    } catch {
      void 0;
    }
    try {
      const bakPath = `${this.dbPath}.bak`;
      if (fs.existsSync(bakPath)) {
        const rawBak = fs.readFileSync(bakPath, 'utf8');
        const parsedBak = parseText(rawBak);
        if (parsedBak && typeof parsedBak === 'object') {
          const normalized = normalizeDbShape(parsedBak);
          this.writeDb(normalized);
          return normalized;
        }
      }
    } catch {
      void 0;
    }
    try {
      if (fs.existsSync(this.dbPath)) {
        const brokenPath = `${this.dbPath}.broken_${Date.now()}`;
        fs.renameSync(this.dbPath, brokenPath);
      }
    } catch {
      void 0;
    }
    const fallback = { nextId: 1, templates: [] };
    fs.writeFileSync(this.dbPath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }

  writeDb(db) {
    const normalized = normalizeDbShape(db);
    const payload = JSON.stringify(normalized, null, 2);
    fs.writeFileSync(this.dbPath, payload, 'utf8');
    try {
      fs.writeFileSync(`${this.dbPath}.bak`, payload, 'utf8');
    } catch {
      void 0;
    }
  }

  pruneMissingTemplateRefs(db) {
    const templates = Array.isArray(db?.templates) ? db.templates : [];
    let changed = false;
    const nextTemplates = [];
    for (let i = 0; i < templates.length; i += 1) {
      const t = templates[i] || {};
      const items = Array.isArray(t?.items) ? t.items : [];
      const nextItems = [];
      for (let j = 0; j < items.length; j += 1) {
        const it = items[j] || {};
        const templateId = String(it?.templateId || '').trim();
        const validId = isSafeTemplateId(templateId);
        const exists = validId ? templateExistsOnDisk(this.outputRoot, templateId) : false;
        const missingOnDisk = !(validId && exists);
        const missingReason = !validId ? 'invalid_template_id' : !exists ? 'missing_source_psd' : null;
        if (missingOnDisk !== Boolean(it?.missingOnDisk) || missingReason !== (it?.missingReason || null) || templateId !== String(it?.templateId || '')) {
          changed = true;
        }
        nextItems.push({
          ...it,
          templateId,
          missingOnDisk,
          missingReason,
        });
      }
      if (nextItems.length !== items.length) changed = true;
      nextTemplates.push({
        ...t,
        items: nextItems,
      });
    }
    if (changed) {
      db.templates = nextTemplates;
    }
    return db;
  }

  list() {
    const db = this.pruneMissingTemplateRefs(this.readDb());
    const rows = Array.isArray(db.templates) ? db.templates : [];
    return rows
      .slice()
      .sort((a, b) => {
        const ta = String(a?.updatedAt || '');
        const tb = String(b?.updatedAt || '');
        if (ta !== tb) return tb.localeCompare(ta);
        return Number(b?.id || 0) - Number(a?.id || 0);
      })
      .map((r) => ({
        id: Number(r?.id || 0),
        name: String(r?.name || ''),
        createdAt: String(r?.createdAt || ''),
        updatedAt: String(r?.updatedAt || ''),
        psdCount: Array.isArray(r?.items) ? r.items.length : 0,
        missingPsdCount: Array.isArray(r?.items) ? r.items.filter((it) => it && it.missingOnDisk === true).length : 0,
      }));
  }

  listReferencedTemplateIds() {
    const db = this.pruneMissingTemplateRefs(this.readDb());
    const out = new Set();
    const templates = Array.isArray(db.templates) ? db.templates : [];
    for (const t of templates) {
      const items = Array.isArray(t?.items) ? t.items : [];
      for (const it of items) {
        const templateId = String(it?.templateId || '').trim();
        if (!isSafeTemplateId(templateId)) continue;
        out.add(templateId);
      }
    }
    return Array.from(out.values());
  }

  isTemplateReferenced(templateId) {
    const tId = String(templateId || '').trim();
    if (!isSafeTemplateId(tId)) return false;
    const db = this.pruneMissingTemplateRefs(this.readDb());
    const templates = Array.isArray(db.templates) ? db.templates : [];
    for (const t of templates) {
      const items = Array.isArray(t?.items) ? t.items : [];
      if (items.some((it) => String(it?.templateId || '').trim() === tId)) return true;
    }
    return false;
  }

  /**
   * 导出全部任务模版为完整JSON数据
   */
  exportAll() {
    const db = this.readDb();
    const templates = Array.isArray(db.templates) ? db.templates : [];
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      nextId: db.nextId || 1,
      templates: templates.map((t) => ({
        id: Number(t?.id || 0),
        name: String(t?.name || ''),
        createdAt: String(t?.createdAt || ''),
        updatedAt: String(t?.updatedAt || ''),
        items: Array.isArray(t?.items) ? t.items : [],
      })),
    };
  }

  /**
   * 导入备份数据,覆盖全部已有任务模版
   * @param {Object} data - 导出的JSON数据
   * @returns {Object} { success: boolean, imported: number }
   */
  importAll(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('导入数据格式无效');
    }
    const templates = data.templates;
    if (!Array.isArray(templates)) {
      throw new Error('缺少 templates 数组');
    }

    // 校验每个模版数据
    for (let i = 0; i < templates.length; i += 1) {
      const t = templates[i];
      const tid = Number(t?.id);
      if (!Number.isInteger(tid) || tid < 0) {
        throw new Error(`模版 #${i} 的 id 无效: ${tid}`);
      }
      const name = String(t?.name || '').trim();
      if (!name) {
        throw new Error(`模版 #${i} 的 name 不能为空`);
      }
      const items = Array.isArray(t?.items) ? t.items : [];
      if (items.length > 50) {
        throw new Error(`模版 "${name}" 的 PSD 数量超过上限(50)`);
      }
      for (let j = 0; j < items.length; j += 1) {
        const it = items[j];
        const templateId = String(it?.templateId || '').trim();
        if (!templateId) {
          throw new Error(`模版 "${name}" 的第 ${j + 1} 个 item 缺少 templateId`);
        }
        if (!isSafeTemplateId(templateId)) {
          throw new Error(`模版 "${name}" 的 templateId 格式无效: ${templateId}`);
        }
      }
    }

    // 校验通过后,规范化数据并覆盖
    const normalizedTemplates = templates.map((t) => {
      const items = Array.isArray(t?.items) ? t.items : [];
      return {
        id: Number(t.id),
        name: String(t.name),
        createdAt: String(t.createdAt || new Date().toISOString()),
        updatedAt: String(t.updatedAt || new Date().toISOString()),
        items,
      };
    });

    const nextId = Number.isInteger(Number(data.nextId)) && data.nextId > 0
      ? data.nextId
      : Math.max(0, ...normalizedTemplates.map((t) => t.id)) + 1;

    this.writeDb({ nextId, templates: normalizedTemplates });
    return { success: true, imported: normalizedTemplates.length };
  }

  get(id) {
    const tid = Number(id);
    if (!Number.isInteger(tid) || tid <= 0) throw new Error('无效的任务模板编号');
    const db = this.pruneMissingTemplateRefs(this.readDb());
    const tpl = (Array.isArray(db.templates) ? db.templates : []).find((t) => Number(t?.id) === tid) || null;
    if (!tpl) {
      const e = new Error('任务模板不存在');
      e.code = 'TASK_TEMPLATE_NOT_FOUND';
      throw e;
    }
    const normalizeUploadOriginalName = (input) => {
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
    };

    const items = Array.isArray(tpl.items) ? tpl.items : [];
    return {
      id: Number(tpl.id),
      name: String(tpl.name || ''),
      createdAt: String(tpl.createdAt || ''),
      updatedAt: String(tpl.updatedAt || ''),
      items: items.map((it) => ({
        templateId: String(it?.templateId || '').trim(),
        originalPsdName:
          typeof it?.originalPsdName === 'string' && normalizeUploadOriginalName(it.originalPsdName).trim()
            ? normalizeUploadOriginalName(it.originalPsdName).trim()
            : (() => {
                const fallback = readTemplateOriginalPsdName(this.outputRoot, String(it?.templateId || '').trim());
                return fallback ? fallback : null;
              })(),
        selectedVarIds: Array.isArray(it?.selectedVarIds) ? it.selectedVarIds : undefined,
        selectedPsIds: (() => {
          const templateId = String(it?.templateId || '').trim();
          const vars = readTemplateVariables(this.outputRoot, templateId);
          const { varIdToPsId } = buildImageVariableMaps(vars);
          const rawVarIds = Array.isArray(it?.selectedVarIds) ? it.selectedVarIds : [];
          const rawPsIds = Array.isArray(it?.selectedPsIds) ? it.selectedPsIds : [];
          if (rawVarIds.length > 0 && varIdToPsId.size > 0) {
            const out = [];
            const seen = new Set();
            for (let i = 0; i < rawVarIds.length; i += 1) {
              const psId = varIdToPsId.get(String(rawVarIds[i] || '').trim());
              if (!Number.isFinite(psId) || psId <= 0) continue;
              const key = String(psId);
              if (seen.has(key)) continue;
              seen.add(key);
              out.push(psId);
            }
            if (out.length > 0) return out;
          }
          if (rawPsIds.length > 0) return rawPsIds;
          return [];
        })(),
        guidePicks: (() => {
          const templateId = String(it?.templateId || '').trim();
          const vars = readTemplateVariables(this.outputRoot, templateId);
          const { varIdToPsId } = buildImageVariableMaps(vars);
          const raw = it?.guidePicksVarIds && typeof it.guidePicksVarIds === 'object' ? it.guidePicksVarIds : null;
          if (raw && varIdToPsId.size > 0) {
            const keys = Object.keys(raw);
            const out = {};
            for (let i = 0; i < keys.length; i += 1) {
              const varId = String(keys[i] || '').trim();
              const psId = varIdToPsId.get(varId);
              if (!Number.isFinite(psId) || psId <= 0) continue;
              const pick = raw[keys[i]] || null;
              const leftX = Number(pick?.leftX);
              const rightX = Number(pick?.rightX);
              if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX <= leftX) continue;
              out[String(psId)] = { leftX, rightX };
            }
            return out;
          }
          return it?.guidePicks && typeof it.guidePicks === 'object' ? it.guidePicks : {};
        })(),
        exportFormats: Array.isArray(it?.exportFormats) ? it.exportFormats : null,
        missingOnDisk: it?.missingOnDisk === true,
        missingReason: typeof it?.missingReason === 'string' ? it.missingReason : null,
      })),
    };
  }

  create({ name, items }) {
    const safeName = normalizeName(name);
    const safeItems = normalizeItems(items, this.outputRoot);
    const db = this.readDb();
    const id = Number(db.nextId) || 1;
    db.nextId = id + 1;
    const createdAt = nowIso();
    const updatedAt = createdAt;
    db.templates = Array.isArray(db.templates) ? db.templates : [];
    db.templates.push({
      id,
      name: safeName,
      createdAt,
      updatedAt,
      items: safeItems.map((it) => ({
        templateId: it.templateId,
        originalPsdName: it.originalPsdName || '',
        selectedPsIds: it.selectedPsIds,
        ...(Array.isArray(it.selectedVarIds) && it.selectedVarIds.length > 0 ? { selectedVarIds: it.selectedVarIds } : {}),
        guidePicks: Array.isArray(it.guidePicks)
          ? Object.fromEntries(it.guidePicks.map((p) => [String(p.psId), { leftX: p.leftX, rightX: p.rightX }]))
          : {},
        ...(it.guidePicksVarIds && typeof it.guidePicksVarIds === 'object' && Object.keys(it.guidePicksVarIds).length > 0
          ? { guidePicksVarIds: it.guidePicksVarIds }
          : {}),
        ...(Array.isArray(it.exportFormats) ? { exportFormats: it.exportFormats } : {}),
      })),
    });
    this.writeDb(db);
    return this.get(id);
  }

  update(id, { name, items }) {
    const tid = Number(id);
    if (!Number.isInteger(tid) || tid <= 0) throw new Error('无效的任务模板编号');
    const db = this.readDb();
    const idx = (Array.isArray(db.templates) ? db.templates : []).findIndex((t) => Number(t?.id) === tid);
    if (idx < 0) {
      const e = new Error('任务模板不存在');
      e.code = 'TASK_TEMPLATE_NOT_FOUND';
      throw e;
    }
    const safeName = name != null ? normalizeName(name) : null;
    const safeItems = items != null ? normalizeItems(items, this.outputRoot) : null;
    const updatedAt = nowIso();
    const next = { ...(db.templates[idx] || {}) };
    next.updatedAt = updatedAt;
    if (safeName !== null) next.name = safeName;
    if (safeItems !== null) {
      next.items = safeItems.map((it) => ({
        templateId: it.templateId,
        originalPsdName: it.originalPsdName || '',
        selectedPsIds: it.selectedPsIds,
        ...(Array.isArray(it.selectedVarIds) && it.selectedVarIds.length > 0 ? { selectedVarIds: it.selectedVarIds } : {}),
        guidePicks: Array.isArray(it.guidePicks)
          ? Object.fromEntries(it.guidePicks.map((p) => [String(p.psId), { leftX: p.leftX, rightX: p.rightX }]))
          : {},
        ...(it.guidePicksVarIds && typeof it.guidePicksVarIds === 'object' && Object.keys(it.guidePicksVarIds).length > 0
          ? { guidePicksVarIds: it.guidePicksVarIds }
          : {}),
        ...(Array.isArray(it.exportFormats) ? { exportFormats: it.exportFormats } : {}),
      }));
    }
    db.templates[idx] = next;
    this.writeDb(db);
    return this.get(tid);
  }

  delete(id) {
    const tid = Number(id);
    if (!Number.isInteger(tid) || tid <= 0) throw new Error('无效的任务模板编号');
    const db = this.readDb();
    const before = Array.isArray(db.templates) ? db.templates : [];
    const after = before.filter((t) => Number(t?.id) !== tid);
    if (after.length === before.length) {
      const e = new Error('任务模板不存在');
      e.code = 'TASK_TEMPLATE_NOT_FOUND';
      throw e;
    }
    db.templates = after;
    this.writeDb(db);
    return { success: true };
  }

  isTemplateIdPinned(templateId) {
    return this.isTemplateReferenced(templateId);
  }
}
