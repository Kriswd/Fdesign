import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import schedule from 'node-schedule';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeMkdir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isSafeTemplateId(templateId) {
  return typeof templateId === 'string' && /^[0-9a-f]{16}$/i.test(templateId);
}

function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function normalizeNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function shouldDeleteExportMetaFile(name) {
  const s = String(name || '');
  if (!s) return false;
  if (/^job_(batch_|bundle_|vars_)?\d+\.json$/i.test(s)) return true;
  if (/^result_(batch_|bundle_|vars_)?\d+\.json$/i.test(s)) return true;
  if (/\.json\.(vbs\.log|log)$/i.test(s)) return true;
  if (/\.json\.task_\d+\.log$/i.test(s)) return true;
  if (/^run_.*\.jsx$/i.test(s)) return true;
  if (/^ps_jsx_.*\.jsx$/i.test(s)) return true;
  if (/^ps_wrap_.*\.jsx$/i.test(s)) return true;
  return false;
}

function isCutoutNoPsdDirName(name) {
  const s = String(name || '');
  if (!s) return false;
  return /^(?:cutout_no_psd|cutout_no_psd_compose)_\d+$/i.test(s);
}

function parseCutoutNoPsdStamp(name) {
  const s = String(name || '');
  const m = s.match(/_(\d+)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export default class CleanupService {
  constructor({ outputRoot, isTemplatePinned }) {
    this.outputRoot = outputRoot;
    this.templatesDir = path.join(outputRoot, 'templates');
    this.cutoutNoPsdDir = path.join(outputRoot, 'cutout_no_psd');
    this.isTemplatePinned = typeof isTemplatePinned === 'function' ? isTemplatePinned : () => false;
    safeMkdir(this.templatesDir);
  }

  isPinned(templateId) {
    try {
      return this.isTemplatePinned(String(templateId || '').trim()) === true;
    } catch {
      return false;
    }
  }

  /**
   * Cleans up templates that are older than expiryHours and are NOT saved by the user.
   * @param {number} expiryHours - Number of hours to keep temporary templates.
   */
  async cleanupExpiredTemplates(expiryHours = 24) {
    console.log(`[Cleanup] Starting cleanup of temporary templates older than ${expiryHours} hours...`);
    const cutoff = Date.now() - expiryHours * 60 * 60 * 1000;
    
    try {
        const templateIds = await fs.promises.readdir(this.templatesDir);
        let deletedCount = 0;
        let skippedCount = 0;

        for (const templateId of templateIds) {
          if (!isSafeTemplateId(templateId)) continue;
          if (this.isPinned(templateId)) {
            skippedCount++;
            continue;
          }
          
          const templateDir = path.join(this.templatesDir, templateId);
          
          try {
              const stats = await fs.promises.stat(templateDir);
              
              // Only check age if it's older than cutoff
              if (stats.birthtimeMs < cutoff) {
                const manifestPath = path.join(templateDir, 'manifest.json');
                let isUserSaved = false;
                
                if (fs.existsSync(manifestPath)) {
                  try {
                      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                      isUserSaved = manifest.isUserSaved === true || Boolean(manifest.savedAt);
                  } catch (e) {
                      console.warn(`[Cleanup] Failed to read manifest for ${templateId}, skipping deletion for safety.`, e);
                      skippedCount++;
                      continue;
                  }
                } else {
                  skippedCount++;
                  continue;
                }
                
                if (!isUserSaved) {
                  await fs.promises.rm(templateDir, { recursive: true, force: true });
                  console.log(`[Cleanup] Deleted expired temporary template: ${templateId}`);
                  deletedCount++;
                } else {
                    skippedCount++;
                }
              }
          } catch (err) {
              console.error(`[Cleanup] Error processing template ${templateId}:`, err);
          }
        }
        console.log(`[Cleanup] Completed. Deleted: ${deletedCount}, Skipped (Saved/New): ${skippedCount}`);
    } catch (err) {
        console.error('[Cleanup] Failed to read templates directory:', err);
    }
  }

  /**
   * Forcefully cleans up ALL temporary templates regardless of age.
   * Useful for dev/test or manual triggering.
   */
  async cleanupAllTemporaryTemplates() {
    console.log('[Cleanup] Starting cleanup of ALL temporary templates...');
    try {
        const templateIds = await fs.promises.readdir(this.templatesDir);
        let deletedCount = 0;
        let skippedCount = 0;

        for (const templateId of templateIds) {
          if (!isSafeTemplateId(templateId)) continue;
          if (this.isPinned(templateId)) {
            skippedCount++;
            continue;
          }
          
          const templateDir = path.join(this.templatesDir, templateId);
          const manifestPath = path.join(templateDir, 'manifest.json');
          let isUserSaved = false;
          
          if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                isUserSaved = manifest.isUserSaved === true || Boolean(manifest.savedAt);
            } catch (e) {
                console.warn(`[Cleanup] Invalid manifest for ${templateId}, skipping deletion for safety.`, e);
                skippedCount++;
                continue;
            }
          } else {
            skippedCount++;
            continue;
          }
          
          if (!isUserSaved) {
            await fs.promises.rm(templateDir, { recursive: true, force: true });
            console.log(`[Cleanup] Deleted temporary template: ${templateId}`);
            deletedCount++;
          } else {
            skippedCount++;
          }
        }
        console.log(`[Cleanup] Completed. Deleted: ${deletedCount}, Skipped: ${skippedCount}`);
    } catch (err) {
        console.error('[Cleanup] Failed to read templates directory:', err);
        throw err;
    }
  }

  async cleanupExportArtifacts({ inputsExpiryHours = 6, exportsMetaExpiryHours = 72 } = {}) {
    const inputsCutoff = Date.now() - normalizePositiveNumber(inputsExpiryHours, 6) * 60 * 60 * 1000;
    const exportsCutoff = Date.now() - normalizePositiveNumber(exportsMetaExpiryHours, 72) * 60 * 60 * 1000;
    try {
      const templateIds = await fs.promises.readdir(this.templatesDir);
      let inputsDeleted = 0;
      let exportsMetaDeleted = 0;
      for (const templateId of templateIds) {
        if (!isSafeTemplateId(templateId)) continue;
        const templateDir = path.join(this.templatesDir, templateId);
        const inputsDir = path.join(templateDir, 'inputs');
        const exportsDir = path.join(templateDir, 'exports');

        if (fs.existsSync(inputsDir)) {
          try {
            const rows = await fs.promises.readdir(inputsDir, { withFileTypes: true });
            for (const it of rows) {
              const fp = path.join(inputsDir, it.name);
              try {
                const st = await fs.promises.stat(fp);
                if (Number(st.mtimeMs) >= inputsCutoff) continue;
                await fs.promises.rm(fp, { recursive: true, force: true });
                inputsDeleted += 1;
              } catch {
                void 0;
              }
            }
          } catch {
            void 0;
          }
        }

        if (fs.existsSync(exportsDir)) {
          try {
            const rows = await fs.promises.readdir(exportsDir, { withFileTypes: true });
            for (const it of rows) {
              if (!it.isFile()) continue;
              if (!shouldDeleteExportMetaFile(it.name)) continue;
              const fp = path.join(exportsDir, it.name);
              try {
                const st = await fs.promises.stat(fp);
                if (Number(st.mtimeMs) >= exportsCutoff) continue;
                await fs.promises.rm(fp, { recursive: false, force: true });
                exportsMetaDeleted += 1;
              } catch {
                void 0;
              }
            }
          } catch {
            void 0;
          }
        }
      }
      if (inputsDeleted > 0 || exportsMetaDeleted > 0) {
        console.log('[Cleanup] Export artifacts cleanup completed', { inputsDeleted, exportsMetaDeleted });
      }
    } catch (err) {
      console.error('[Cleanup] Export artifacts cleanup failed:', err);
    }
  }

  async cleanupCutoutNoPsdArtifacts({ keepDays = 7, keepLatest = 50 } = {}) {
    const cutoff = Date.now() - normalizePositiveNumber(keepDays, 7) * 24 * 60 * 60 * 1000;
    const keepLatestCount = Math.max(0, Math.floor(Number(keepLatest) || 0));
    if (!fs.existsSync(this.cutoutNoPsdDir)) return;
    try {
      const rows = await fs.promises.readdir(this.cutoutNoPsdDir, { withFileTypes: true });
      const items = [];
      for (const it of rows) {
        if (!it.isDirectory()) continue;
        if (!isCutoutNoPsdDirName(it.name)) continue;
        const fp = path.join(this.cutoutNoPsdDir, it.name);
        let st;
        try {
          st = await fs.promises.stat(fp);
        } catch {
          continue;
        }
        items.push({
          name: it.name,
          path: fp,
          stamp: parseCutoutNoPsdStamp(it.name) || 0,
          mtimeMs: Number(st.mtimeMs) || 0,
        });
      }
      if (items.length === 0) return;
      items.sort((a, b) => {
        const sa = a.stamp || a.mtimeMs;
        const sb = b.stamp || b.mtimeMs;
        return sb - sa;
      });
      const keepSet = new Set(items.slice(0, keepLatestCount).map((x) => x.name));
      let deleted = 0;
      for (const it of items) {
        if (keepSet.has(it.name)) continue;
        const ageMs = it.stamp > 0 ? it.stamp : it.mtimeMs;
        if (Number(ageMs) >= cutoff) continue;
        try {
          await fs.promises.rm(it.path, { recursive: true, force: true });
          deleted += 1;
        } catch {
          void 0;
        }
      }
      if (deleted > 0) {
        console.log('[Cleanup] cutout_no_psd cleanup completed', { deleted, keepDays: normalizePositiveNumber(keepDays, 7), keepLatest: keepLatestCount });
      }
    } catch (err) {
      console.error('[Cleanup] cutout_no_psd cleanup failed:', err);
    }
  }
  
  /**
   * Deletes a specific template by ID.
   * @param {string} templateId 
   * @returns {Promise<boolean>} true if deleted, false if not found or failed
   */
  async deleteTemplate(templateId) {
      if (!isSafeTemplateId(templateId)) {
          throw new Error('Invalid template ID');
      }
      const templateDir = path.join(this.templatesDir, templateId);
      return this.deleteTemplateAtPath(templateId, templateDir);
  }

  async deleteTemplateAtPath(templateId, templateDir) {
      if (!isSafeTemplateId(templateId)) {
          throw new Error('Invalid template ID');
      }
      const dir = String(templateDir || '').trim();
      if (!dir) return false;
      if (fs.existsSync(dir)) {
          await fs.promises.rm(dir, { recursive: true, force: true });
          console.log(`[Cleanup] Manually deleted template: ${templateId}`);
          return true;
      }
      return false;
  }

  /**
   * 清理单个模板 images 文件夹中的旧参考图
   * 保留 reference.png 和 backdrop.png,删除其他修改时间超过 expiryHours 的图片
   * @param {string} templateId - 模板ID
   * @param {string} templateDir - 模板目录路径
   * @param {number} expiryHours - 过期小时数(默认24小时)
   * @returns {Promise<{deleted: number, skipped: number, error: string|null}>}
   */
  async cleanupTemplateImages(templateId, templateDir, expiryHours = 24) {
    const imagesDir = path.join(templateDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      return { deleted: 0, skipped: 0, error: null };
    }

    const cutoff = Date.now() - normalizePositiveNumber(expiryHours, 24) * 60 * 60 * 1000;
    const safeTemplateId = isSafeTemplateId(templateId) ? templateId : null;
    let deleted = 0;
    let skipped = 0;

    try {
      const files = await fs.promises.readdir(imagesDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) continue;

        const fileName = file.name.toLowerCase();
        // 保留 reference.png 和 backdrop.png
        if (fileName === 'reference.png' || fileName === 'backdrop.png') {
          skipped += 1;
          continue;
        }

        // 只清理图片文件(.png, .jpg, .jpeg, .webp)
        const isImageFile =
          fileName.endsWith('.png') ||
          fileName.endsWith('.jpg') ||
          fileName.endsWith('.jpeg') ||
          fileName.endsWith('.webp');

        if (!isImageFile) {
          skipped += 1;
          continue;
        }

        const filePath = path.join(imagesDir, file.name);
        try {
          const stat = await fs.promises.stat(filePath);
          // 只删除修改时间超过 expiryHours 的文件
          if (Number(stat.mtimeMs) >= cutoff) {
            skipped += 1;
            continue;
          }

          await fs.promises.unlink(filePath);
          deleted += 1;
          console.log(`[Cleanup] 已删除旧参考图: ${safeTemplateId || 'unknown'}/images/${file.name}`);
        } catch (statErr) {
          console.warn(`[Cleanup] 读取文件状态失败: ${safeTemplateId || 'unknown'}/images/${file.name}`, statErr);
          skipped += 1;
        }
      }

      if (deleted > 0) {
        console.log(`[Cleanup] 模板 ${safeTemplateId || 'unknown'} images 清理完成: 删除 ${deleted} 个, 保留 ${skipped} 个`);
      }
    } catch (err) {
      console.error(`[Cleanup] 模板 ${safeTemplateId || 'unknown'} images 清理失败:`, err);
      return { deleted, skipped, error: err.message || String(err) };
    }

    return { deleted, skipped, error: null };
  }

  /**
   * 批量清理所有模板的 images 文件夹
   * @param {number} expiryHours - 过期小时数(默认24小时)
   * @returns {Promise<{totalTemplates: number, totalDeleted: number, totalSkipped: number, errors: string[]}>}
   */
  async cleanupAllTemplateImages(expiryHours = 24) {
    console.log(`[Cleanup] 开始批量清理所有模板 images 文件夹(过期: ${expiryHours} 小时)...`);
    let totalTemplates = 0;
    let totalDeleted = 0;
    let totalSkipped = 0;
    const errors = [];

    try {
      const templateIds = await fs.promises.readdir(this.templatesDir);
      for (const templateId of templateIds) {
        if (!isSafeTemplateId(templateId)) continue;
        if (this.isPinned(templateId)) continue;

        totalTemplates += 1;
        const templateDir = path.join(this.templatesDir, templateId);

        try {
          const result = await this.cleanupTemplateImages(templateId, templateDir, expiryHours);
          totalDeleted += result.deleted;
          totalSkipped += result.skipped;
          if (result.error) {
            errors.push(`模板 ${templateId}: ${result.error}`);
          }
        } catch (err) {
          errors.push(`模板 ${templateId}: ${err.message || String(err)}`);
          console.error(`[Cleanup] 清理模板 ${templateId} images 失败:`, err);
        }
      }

      console.log(`[Cleanup] 批量清理模板 images 完成: 处理 ${totalTemplates} 个模板, 删除 ${totalDeleted} 个文件, 保留 ${totalSkipped} 个文件`);
      if (errors.length > 0) {
        console.warn(`[Cleanup] 有 ${errors.length} 个模板清理失败:`, errors.slice(0, 5));
      }
    } catch (err) {
      console.error('[Cleanup] 批量清理模板 images 失败:', err);
      errors.push(err.message || String(err));
    }

    return { totalTemplates, totalDeleted, totalSkipped, errors };
  }

  startScheduledCleanup(expiryHours = 24) {
    // Run at minute 0 of every hour (e.g. 10:00, 11:00, 12:00...)
    schedule.scheduleJob('0 * * * *', async () => {
      console.log('Starting scheduled temporary template cleanup...');
      await this.cleanupExpiredTemplates(expiryHours);
      const inputsKeepHours = normalizePositiveNumber(process.env.FDESIGN_EXPORT_INPUTS_KEEP_HOURS, 6);
      const exportsMetaKeepHours = normalizePositiveNumber(process.env.FDESIGN_EXPORT_META_KEEP_HOURS, 72);
      if (process.env.DISABLE_SCHEDULED_EXPORT_ARTIFACTS_CLEANUP !== 'true') {
        await this.cleanupExportArtifacts({ inputsExpiryHours: inputsKeepHours, exportsMetaExpiryHours: exportsMetaKeepHours });
      }
      const cutoutKeepDays = normalizePositiveNumber(process.env.FDESIGN_CUTOUT_NO_PSD_KEEP_DAYS, 0.1);
      const cutoutKeepLatest = normalizeNonNegativeInt(process.env.FDESIGN_CUTOUT_NO_PSD_KEEP_LATEST, 3);
      if (process.env.DISABLE_SCHEDULED_CUTOUT_NO_PSD_CLEANUP !== 'true') {
        await this.cleanupCutoutNoPsdArtifacts({ keepDays: cutoutKeepDays, keepLatest: cutoutKeepLatest });
      }
      // 定时清理所有模板 images 文件夹中的旧参考图
      const imagesKeepHours = normalizePositiveNumber(process.env.FDESIGN_TEMPLATE_IMAGES_KEEP_HOURS, 24);
      if (process.env.DISABLE_SCHEDULED_TEMPLATE_IMAGES_CLEANUP !== 'true') {
        await this.cleanupAllTemplateImages(imagesKeepHours);
      }
      console.log('Scheduled cleanup completed');
    });
    console.log(`Scheduled cleanup job started (runs hourly, expiry: ${expiryHours} hours)`);
  }
}
