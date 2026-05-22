import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function isSafeTemplateId(templateId) {
  return typeof templateId === 'string' && /^[0-9a-f]{16}$/i.test(templateId);
}

const TEMPLATE_THUMBNAIL_NAME = 'preview-card.webp';

function normalizeFieldDefinitions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const key = typeof item.key === 'string' ? item.key.trim() : '';
      if (!key) return null;
      const rawLabel = typeof item.label === 'string' ? item.label.trim() : '';
      const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : 'text';
      return {
        key,
        label: rawLabel || key,
        type,
      };
    })
    .filter((item) => item);
}

export default class SlotConfigService {
  constructor({ outputRoot }) {
    this.outputRoot = outputRoot;
    this.templatesDir = path.join(outputRoot, 'templates');
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  getTemplateDir(templateId) {
    if (!isSafeTemplateId(templateId)) {
      const err = new Error('无效的 templateId');
      err.code = 'INVALID_TEMPLATE_ID';
      throw err;
    }
    return path.join(this.templatesDir, templateId);
  }

  async readManifest(templateId) {
    const templateDir = this.getTemplateDir(templateId);
    const manifestPath = path.join(templateDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      const err = new Error('模版不存在');
      err.code = 'TEMPLATE_NOT_FOUND';
      throw err;
    }

    const data = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(data);
    return { templateDir, manifest };
  }

  buildThumbnailUrl(templateId, templateDir) {
    const thumbPath = path.join(templateDir, TEMPLATE_THUMBNAIL_NAME);
    if (!fs.existsSync(thumbPath)) return null;
    return `/templates/${templateId}/${TEMPLATE_THUMBNAIL_NAME}`;
  }

  async ensureThumbnailUrl(templateId, templateDir) {
    const existing = this.buildThumbnailUrl(templateId, templateDir);
    if (existing) return existing;

    const sourceUrl = this.buildImageUrl(templateId, templateDir);
    if (!sourceUrl) return null;

    const sourceName = String(sourceUrl.split('/').pop() || '').trim();
    if (!sourceName) return null;
    const sourcePath = path.join(templateDir, sourceName);
    if (!fs.existsSync(sourcePath)) return null;

    const thumbPath = path.join(templateDir, TEMPLATE_THUMBNAIL_NAME);
    await sharp(sourcePath)
      .rotate()
      .resize({ width: 480, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbPath);

    return this.buildThumbnailUrl(templateId, templateDir);
  }

  buildImageUrl(templateId, templateDir) {
    const refPath = path.join(templateDir, 'reference.png');
    const bgPath = path.join(templateDir, 'backdrop.png');
    if (fs.existsSync(refPath)) {
      return `/templates/${templateId}/reference.png`;
    }
    if (fs.existsSync(bgPath)) {
      return `/templates/${templateId}/backdrop.png`;
    }

    const imagesDir = path.join(templateDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      return null;
    }

    const files = fs.readdirSync(imagesDir).filter((name) => {
      const lower = String(name || '').toLowerCase();
      return (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp')
      );
    });

    if (files.length === 0) {
      return null;
    }

    const preferred = files.find((name) => /^reference(\.|_)/i.test(name));
    const chosen = preferred || files.sort()[0];
    return `/templates/${templateId}/images/${chosen}`;
  }

  getSlotConfigPath(templateDir) {
    return path.join(templateDir, 'slot-config.json');
  }

  async readSlotConfig(templateId) {
    const { templateDir } = await this.readManifest(templateId);
    const slotConfigPath = this.getSlotConfigPath(templateDir);

    if (!fs.existsSync(slotConfigPath)) {
      return {
        templateId,
        version: 1,
        slots: [],
        fieldDefinitions: [],
        ignoredVariableIds: [],
        ignoredFieldKeys: [],
      };
    }

    const raw = await fs.promises.readFile(slotConfigPath, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      const slots = Array.isArray(parsed.slots) ? parsed.slots : [];
      const fieldDefinitions = normalizeFieldDefinitions(parsed.fieldDefinitions);
      const version = typeof parsed.version === 'number' ? parsed.version : 1;
      const ignoredVariableIdsRaw = Array.isArray(parsed.ignoredVariableIds) ? parsed.ignoredVariableIds : [];
      const ignoredVariableIds = ignoredVariableIdsRaw
        .map((id) => (typeof id === 'string' ? id : null))
        .filter((id) => id);
      const ignoredFieldKeysRaw = Array.isArray(parsed.ignoredFieldKeys) ? parsed.ignoredFieldKeys : [];
      const ignoredFieldKeys = ignoredFieldKeysRaw
        .map((key) => (typeof key === 'string' ? key : null))
        .filter((key) => key);
      return {
        templateId,
        version,
        slots,
        fieldDefinitions,
        ignoredVariableIds,
        ignoredFieldKeys,
      };
    } catch (e) {
      console.error('解析 slot-config.json 失败:', e);
      const err = new Error('模版配置损坏');
      err.code = 'SLOT_CONFIG_BROKEN';
      throw err;
    }
  }

  async getTemplateConfig(templateId) {
    const { templateDir, manifest } = await this.readManifest(templateId);
    const slotConfig = await this.readSlotConfig(templateId);
    const imageUrl = this.buildImageUrl(templateId, templateDir);
    const thumbnailUrl = await this.ensureThumbnailUrl(templateId, templateDir);
    const originalPsdName =
      typeof manifest?.originalPsdName === 'string' && manifest.originalPsdName.trim()
        ? manifest.originalPsdName.trim()
        : typeof manifest?.name === 'string' && /\.psd$/i.test(manifest.name.trim())
          ? manifest.name.trim()
          : null;

    return {
      id: templateId,
      name: manifest.name || `未命名模版 (${templateId.slice(0, 6)})`,
      originalPsdName,
      width: manifest.width,
      height: manifest.height,
      imageUrl,
      thumbnailUrl,
      frontendConfig: manifest.frontendConfig || null,
      slots: slotConfig.slots,
      fieldDefinitions: slotConfig.fieldDefinitions,
      ignoredVariableIds: slotConfig.ignoredVariableIds || [],
      ignoredFieldKeys: slotConfig.ignoredFieldKeys || [],
    };
  }

  buildSlotConfigDebugSummary(config) {
    const slots = Array.isArray(config?.slots) ? config.slots : [];
    const fieldDefinitions = Array.isArray(config?.fieldDefinitions) ? config.fieldDefinitions : [];
    const ignoredVariableIds = Array.isArray(config?.ignoredVariableIds) ? config.ignoredVariableIds : [];
    const ignoredFieldKeys = Array.isArray(config?.ignoredFieldKeys) ? config.ignoredFieldKeys : [];
    const ruleChainLengths = [];
    let variableCount = 0;

    slots.forEach((slot) => {
      const slotId = slot?.id != null ? String(slot.id) : '';
      const variables = Array.isArray(slot?.variables) ? slot.variables : [];
      variableCount += variables.length;
      variables.forEach((variable) => {
        const chain = Array.isArray(variable?.computedRules) ? variable.computedRules : [];
        if (chain.length <= 0) return;
        const psId = Number(variable?.psId);
        ruleChainLengths.push({
          slotId,
          variableId: variable?.id != null ? String(variable.id) : '',
          psId: Number.isFinite(psId) ? psId : null,
          length: chain.length,
        });
      });
    });

    return {
      slotCount: slots.length,
      variableCount,
      fieldDefinitionKeys: fieldDefinitions
        .map((item) => (item?.key != null ? String(item.key) : ''))
        .filter((key) => key),
      ignoredVariableIds: ignoredVariableIds
        .map((id) => (id != null ? String(id) : ''))
        .filter((id) => id),
      ignoredFieldKeys: ignoredFieldKeys
        .map((key) => (key != null ? String(key) : ''))
        .filter((key) => key),
      ruleChainLengths,
    };
  }

  validateAndNormalizeSlotConfig(payload) {
    const data = payload || {};
    const slots = Array.isArray(data.slots) ? data.slots : [];
    const fieldDefinitions = normalizeFieldDefinitions(data.fieldDefinitions);
    const ignoredVariableIdsRaw = Array.isArray(data.ignoredVariableIds) ? data.ignoredVariableIds : [];
    const ignoredVariableIds = ignoredVariableIdsRaw
      .map((id) => (typeof id === 'string' ? id : null))
      .filter((id) => id);
    const ignoredFieldKeysRaw = Array.isArray(data.ignoredFieldKeys) ? data.ignoredFieldKeys : [];
    const ignoredFieldKeys = ignoredFieldKeysRaw
      .map((key) => (typeof key === 'string' ? key : null))
      .filter((key) => key);

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      if (!slot || typeof slot !== 'object') {
        const err = new Error(`第 ${i + 1} 个商品位配置非法`);
        err.code = 'INVALID_SLOT_CONFIG';
        throw err;
      }
      if (!slot.id || typeof slot.id !== 'string') {
        const err = new Error(`第 ${i + 1} 个商品位缺少有效 id`);
        err.code = 'INVALID_SLOT_CONFIG';
        throw err;
      }
      if (slot.variables && !Array.isArray(slot.variables)) {
        const err = new Error(`商品位 ${slot.id} 的变量列表必须是数组`);
        err.code = 'INVALID_SLOT_CONFIG';
        throw err;
      }

      if (Array.isArray(slot.variables)) {
        for (let j = 0; j < slot.variables.length; j += 1) {
          const v = slot.variables[j];
          if (!v || typeof v !== 'object') {
            const err = new Error(`商品位 ${slot.id} 的第 ${j + 1} 个变量配置非法`);
            err.code = 'INVALID_SLOT_CONFIG';
            throw err;
          }
          const psId = Number(v.psId);
          if (!Number.isFinite(psId)) {
            const err = new Error(`商品位 ${slot.id} 的变量 psId 必须为数字`);
            err.code = 'INVALID_SLOT_CONFIG';
            throw err;
          }
          v.psId = psId;
          if (v.align !== undefined && v.align !== null) {
            const rawAlign = String(v.align);
            if (rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right') {
              v.align = rawAlign;
            } else {
              v.align = null;
            }
          }
        }
      }
    }

    return {
      version: typeof data.version === 'number' ? data.version : 1,
      slots,
      fieldDefinitions,
      ignoredVariableIds,
      ignoredFieldKeys,
    };
  }

  async saveSlotConfig(templateId, payload) {
    const { templateDir } = await this.readManifest(templateId);
    const normalized = this.validateAndNormalizeSlotConfig(payload);
    const slotConfigPath = this.getSlotConfigPath(templateDir);

    const toWrite = {
      templateId,
      version: normalized.version,
      slots: normalized.slots,
      fieldDefinitions: normalized.fieldDefinitions,
      ignoredVariableIds: normalized.ignoredVariableIds || [],
      ignoredFieldKeys: normalized.ignoredFieldKeys || [],
    };

    await fs.promises.writeFile(slotConfigPath, JSON.stringify(toWrite, null, 2), 'utf-8');

    return toWrite;
  }
}

