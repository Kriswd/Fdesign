# Batch PNG Transparent Compose Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在“批量生成”导出 PNG 时，先无PSD抠图得到 RGBA，再按每个 PSD 的左右参考线对齐并合成到与 PSD 同尺寸的透明画布中输出。

**Architecture:** 前端解析 PSD（含原生参考线/参考线图层）并支持用户绑定 `{leftX,rightX}`；服务端新增 `POST /api/cutout/batch-no-psd-compose`，复用现有无PSD抠图生成中间透明 PNG，再用 `sharp` 基于 alpha bbox 做缩放与平移合成到模板画布尺寸。

**Tech Stack:** React/Vite 前端；Node/Express 后端；Photoshop（VBS + JSX）抠图；sharp 做图像分析与合成；node:test 做单测。

---

### Task 1: Add alpha bbox and compose math utilities (server)

**Files:**
- Create: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\composeCutout.js`
- Test: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\composeCutout.test.mjs`

**Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAlphaBBox, computePlacement } from './composeCutout.js'

test('computeAlphaBBox finds bbox of non-transparent pixels', async () => {
  // build a small RGBA buffer with a 2x3 opaque block, verify bbox
})

test('computePlacement aligns bbox left/right to guides and centers vertically', () => {
  // bbox width -> guide span scale; verify x/y offsets
})
```

**Step 2: Run test to verify it fails**

Run: `node --test server/services/composeCutout.test.mjs`  
Expected: FAIL with module/function missing

**Step 3: Write minimal implementation**

```js
export function computeAlphaBBox({ data, width, height, alphaThreshold = 1 }) {}
export function computePlacement({ bbox, canvasWidth, canvasHeight, guideLeftX, guideRightX }) {}
export async function composeToCanvasPng({ cutoutPngPath, canvasWidth, canvasHeight, guideLeftX, guideRightX, outputPngPath }) {}
```

**Step 4: Run test to verify it passes**

Run: `node --test server/services/composeCutout.test.mjs`  
Expected: PASS

---

### Task 2: Add compose endpoint for batch cutout (server)

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\index.js`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\photoshopIngest.js` (only if needed to expose reusable cutout call)
- Test: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\scripts\verify_cutout_compose_dryrun.mjs`

**Step 1: Write the failing test/script**

```js
// verify_cutout_compose_dryrun.mjs
// - create fake uploads + fake channels
// - call endpoint with dryRun: true and assert tasksCount / outputs shape
```

**Step 2: Run to verify it fails**

Run: `node scripts/verify_cutout_compose_dryrun.mjs`  
Expected: FAIL with 404 or missing endpoint

**Step 3: Implement endpoint**

Endpoint: `POST /api/cutout/batch-no-psd-compose`

Request shape:
- `images[]`: `{ imagePath, sourceName }`
- `channels[]`: `{ storedName, sourceName }`
- `resizeMode`: `exact|none`
- `compositions[]`: `{ templateKey, canvasWidth, canvasHeight, guideLeftX, guideRightX, imageIndex }`
- `dryRun` (optional): boolean

Behavior:
- Run cutout once per `images[]` into a batch dir
- For each composition, load corresponding cutout result, compute alpha bbox, scale+translate, composite into a transparent canvas of `{canvasWidth, canvasHeight}`, write output file
- Return `{ batchDir, results: [{ templateKey, imageIndex, ok, url, errors }] }`
- If missing channel masks, return `400` with `missingChannels`

**Step 4: Verify dryRun**

Run: `node scripts/verify_cutout_compose_dryrun.mjs`  
Expected: PASS

---

### Task 3: Restore canvas guide binding UX and PSD parsing fallback (frontend)

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\utils\psdParser.js` (only if new helper needed)

**Step 1: Write a minimal behavioral check**
- Add a small node/test that validates guide extraction helper returns vertical guides from a crafted psd meta object (no browser required), or keep as manual QA if too coupled to ag-psd structures.

**Step 2: Implement**
- Fresh 模式：
  - 用现有 PSD 解析结果渲染画布，显示原生 guides + guideLayers
  - 支持用户绑定 `leftX/rightX`（每个 PSD 的每个图片变量）
- Task 模式：
  - 加载模板 meta 时，如果后端 manifest 缺失 `variables/guides`，前端自动拉取 `/templates/:id/source.psd` 解析补全

---

### Task 4: Wire batch PNG export to compose endpoint (frontend)

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\utils\cutoutNoPsdPayload.mjs` (if needed)

**Step 1: Write failing test for payload builder**
- Extend existing `src/utils/cutoutNoPsdPayload.test.mjs` to cover `compositions` building rules (one bound variable per PSD; multiple PSD supported).

**Step 2: Implement**
- PNG-only：
  - 对每个 PSD（fresh：psdFiles；template：taskTemplateItems 的 templateId）构建 compositions：
    - `canvasWidth/canvasHeight` 来自 PSD/template 尺寸
    - `guideLeftX/guideRightX` 来自用户绑定
    - `imageIndex` 指向当前产品图
  - 调用 `/api/cutout/batch-no-psd-compose`
  - 将返回 url 列表映射到 UI 结果列表并支持打包下载

---

### Task 5: Verify quality gates

**Files:**
- None

**Step 1: Run unit tests**

Run:
- `node --test src/utils/cutoutNoPsdPayload.test.mjs`
- `node --test server/services/composeCutout.test.mjs`

**Step 2: Run lint/build**

Run:
- `npm run lint`
- `npm run build`

