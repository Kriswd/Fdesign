# Batch Export Count & PSD Bundle Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the pre-export “预计导出” statistics and make bundle PSD output non-overlapping (one product image per layer, visible by default).

**Architecture:** Compute export counts by iterating per-template chosen formats and the global bundle-PSD toggle. For bundle PSD, modify Photoshop JSX to vertically tile each variant layer set so outputs are readable at a glance.

**Tech Stack:** React (Vite), Node/Express server, Photoshop JSX automation.

---

### Task 1: Fix pre-export output count (with format breakdown)

**Files:**
- Modify: `src/pages/Workbench/BatchProductImageTab.jsx`
- Test: `tests/guide_pick_ui_behavior.test.mjs`

**Step 1: Add a pure calculation in UI layer**
- Compute `png/jpg/psd` counts based on:
  - selected formats per PSD template (fresh or task-template mode)
  - `productImages.length`
  - bundle PSD: count PSD as 1 per template when enabled

**Step 2: Replace “预计生成” with “预计导出”**
- Display total count and a breakdown line: `PNG a / JPG b / PSD c`

**Step 3: Run tests**
- Run: `npm test`
- Expected: PASS

---

### Task 2: Bundle PSD should tile variants vertically (no overlap)

**Files:**
- Modify: `server/photoshop/render_export.jsx`
- Modify: `server/services/photoshopIngest.js`

**Step 1: Add variant tiling option in JSX**
- In `runPsdBundle`, for each task index `i`, compute `variantOffsetY = i * (baseHeight + gap)`
- Apply `translate(0, variantOffsetY)` to the duplicated layer(s) after `fitLayerToRect`

**Step 2: Set bundle options from Node**
- Enable `hideOriginalReplacedLayers`
- Disable `showOnlyFirstVariant`
- Add tiling config: `{ layout: 'stackY', gapY: 20 }`

**Step 3: Run server-side tests and build**
- Run: `npm test`, `npm run lint`, `npm run build`
- Expected: PASS

---

### Task 3: Update user-facing copy for bundle PSD

**Files:**
- Modify: `src/pages/Workbench/BatchProductImageTab.jsx`
- Test: `tests/guide_pick_ui_behavior.test.mjs`

**Step 1: Update hint copy**
- Describe “合并 PSD 会按产品图生成图层组并纵向平铺”

**Step 2: Run tests**
- Run: `npm test`
- Expected: PASS

