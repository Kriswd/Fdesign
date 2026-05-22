# PNG 模板导出透明 PSD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 当用户上传的 PSD 文件名包含 `PNG` 时，导出的 PSD 在图片变量处使用“通道抠图后的透明 PNG”，从而导出 PSD 也能保持透明底（至少产品图层为透明边缘，且不被白底对齐流程污染）。

**Architecture:** 在服务端导出 PSD 前，复用现有 “产品图 + 通道 TGA → 透明 PNG” 的 Photoshop 抠图脚本生成 cutout PNG；随后用 Node/sharp 做“参考线对齐 + 透明保留”的二次对齐生成 aligned PNG；最后在 Photoshop 中把 aligned PNG 替换到目标图片变量（智能对象）并保存 PSD。该流程只在模板被标记为 PNG 模板时启用。

**Tech Stack:** Node.js (Express), Photoshop JSX/VBS automation, sharp, existing channelMatch + cutout_batch.jsx + render_export.jsx.

---

## 背景与约束

### 为什么不能复用当前的“白底对齐”
当前对齐实现以“白底识别主体”为核心（`alignWhiteBackgroundImage`），输出会 `flatten` 到白色背景并产生 3 通道 PNG。这会破坏透明信息，导致“导出 PSD 仍是白底/不透明”。

### 目标行为（最小可用）
- 当模板 PSD 名字命中 PNG 模板规则时：
  - 导出 PSD 时，对每个图片变量：先用通道抠出透明 PNG，再按参考线规则对齐，最后替换进 PSD 图层。
  - 导出 PSD 不应在 Node 侧强制加白底/flatten。
- 当未提供通道图时：
  - 返回可读错误（提示需要上传通道图）。

---

## 规则定义

### PNG 模板识别规则（server）
- 模板 ingest 时记录 `manifest.name`（已存在）。
- 在导出时判定：`/png/i.test(manifest.name)` 或 `/png/i.test(originalPsdName)` 即视为 PNG 模板。
- 该规则仅影响 PSD 导出（format=`psd` 或 bundlePsd=true）。

### 透明对齐规则（server）
输入：透明 cutout PNG（Alpha 已抠好） + 目标图片变量矩形 rect + 手动参考线 leftX/rightX  
输出：尺寸为 rect.width x rect.height 的 RGBA PNG，主体按如下规则放置：
- 主体宽度缩放到刚好覆盖参考线区间宽度（`span = rightX-leftX`，相对 rect.left）
- 主体上下居中
- 保留 alpha，背景透明

---

## 实现路径（推荐方案）

### 方案 A（推荐）：PS 抠图 + Node 透明对齐 + PS 替换保存 PSD

**优点**
- 不改 Photoshop 对齐逻辑（只改 Node 的对齐函数）。
- 通道 TGA 解析仍由 Photoshop 负责（sharp 不支持 TGA）。
- 对齐逻辑可单测（用 synthetic RGBA PNG 做测试）。

**缺点**
- 需要新增一套 “透明对齐” 的 sharp 流水线函数。

### 方案 B：全部在 Photoshop 内完成（不推荐）
在 render_export.jsx 中直接打开产品图、打开通道、抠图、对齐、替换、保存 PSD。  
缺点是脚本复杂、难测、性能差、失败定位困难。

---

## 任务拆解（TDD）

### Task 1: 新增“透明对齐”图像处理函数（sharp）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\sharpProcessor.js`
- Test: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\sharpProcessor.alignCutout.test.js`

**Step 1: 写失败测试（synthetic RGBA）**

用 sharp 生成一个透明画布 + 不透明矩形（模拟主体），并生成一个“已抠图 PNG”（透明背景 + 主体）。  
断言：
- 输出 PNG 有 alpha（metadata.hasAlpha === true）
- 输出尺寸等于 target rect
- 主体被放置到 targetLeft..targetRight 的 span 内（通过扫描 alpha bounds 校验）

**Step 2: 跑测试确认失败**

Run: `node --test server/services/sharpProcessor.alignCutout.test.js`  
Expected: FAIL（函数不存在/行为不符）

**Step 3: 实现最小函数**

在 `SharpImageProcessor` 增加函数（示例命名）：
- `alignCutoutAlphaImage({ imageBuffer, targetWidth, targetHeight, referenceRect, manualGuides, alphaThreshold })`

核心算法：
1. `ensureAlpha()` → `raw()` 拿 RGBA
2. 扫描 alpha > threshold 得到 bounds
3. `extract(bounds)` 得到主体
4. `resize({ width: span, height: null, fit: 'inside', withoutEnlargement: false })`
5. 创建透明 RGBA 画布（channels: 4，alpha:0），`composite` 到 `(left=targetLeft, top=centered)`
6. `.png()` 输出

**Step 4: 跑测试确认通过**

Run: `node --test server/services/sharpProcessor.alignCutout.test.js`  
Expected: PASS

---

### Task 2: 在 PSD 导出链路启用“先抠图后替换”的透明模式

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\photoshopIngest.js`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\index.js`（如需把模板名透传/记录）
- (Optional) Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\photoshop\render_export.jsx`

**Step 1: 找到导出时的模板名字来源**
- 读取 `templates/{id}/manifest.json` 的 `name`
- 增加 helper：`isPngNamedTemplate(name)`：`/png/i.test(name)`

**Step 2: 在 exportTemplateBatch / exportTemplateBatchBundlePsd 中注入透明模式**

触发条件：
- `format === 'psd'`（或 bundlePsd）
- `isPngNamedTemplate(manifest.name) === true`

行为：
- 强制要求 `channels` 非空，否则抛出 400（缺通道图）
- 强制启用“通道抠图步骤”（复用现有 cutout_batch.jsx 调度），得到 cutout PNG（透明）
- 对每张图片变量，使用 Task 1 新增的 `alignCutoutAlphaImage` 做对齐，得到 aligned PNG（透明）
- 将 aligned PNG 作为最终 `imagePath` 进入 render_export.jsx 的 `replacePlacedContents`
- 确保该模式下不会调用任何 flatten 白底逻辑

**Step 3: 只做最小接口变化**
- 不改变前端请求协议
- 后端自动根据模板名决定是否启用透明模式

**Step 4: 添加导出端到端验证脚本**

Create: `server/scripts/verify_png_named_psd_transparency.mjs`  
行为：
- 选一个模板名含 PNG 的 templateId
- 构造 1 个任务（psd 输出）+ 1 张产品图 + 对应通道
- 调用 `/api/template/batch-export`
- 下载导出的 PSD 或导出的 aligned PNG（如果落盘可读）
- 用简单启发式验证：aligned PNG alpha 存在、透明像素比例 > 0

---

### Task 3: 可观测性与用户提示

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\index.js`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\photoshopIngest.js`

**Step 1: 响应中带上模式标记**
- 返回 `scriptBuild`（已有）
- 新增 `warnings[]`：当启用透明模式，返回 `已启用 PNG 模板透明 PSD 模式（先抠图后替换）`

**Step 2: 缺通道图时返回明确错误**
- `400` + `message: PNG 模板导出 PSD 需要上传通道 TGA`
- 返回 `missingChannels` + `extracted/candidates`（已存在 explainChannelMatch）

---

## 需要确认的行为（默认假设）
- PNG 模板 PSD 本身不强制移除背景层；透明底主要来自“产品图层透明”。
- 若确实存在“背景层必须隐藏”的模板，可后续增加可配置规则（例如 PSD 中存在名为 `__white_bg__` 的层则导出时隐藏）。

---

## 执行与验证

### 本地验证命令
- `node --test server/services/sharpProcessor.alignCutout.test.js`
- `node --test server/utils/channelMatch.test.js`
- `npm run lint`
- `npm run build`

### 风险与回退
- 若透明模式影响旧模板：通过模板名开关限定（仅 name 含 PNG 的模板）。
- 若用户通道缺失：直接提示，不做错误兜底。

