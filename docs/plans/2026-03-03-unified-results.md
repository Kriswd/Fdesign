# 统一结果列表（PNG/JPG/PSD 同行展示）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 批量生成结果中，同一“PSD/模板 + 产品图”的 PNG/JPG/PSD 输出只显示一行并可分别下载。

**Architecture:** 用 `(psdId,imgId)` 作为行键，把 PNG 结果写回已有任务行的 `formatResults.png`，而不是追加新行；在渲染层为多格式行展示格式徽标与错误摘要。

**Tech Stack:** React, Vite, Tailwind, 现有 BatchProductImageTab 状态模型

---

### Task 1: 提供结果合并工具函数

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`

**Step 1: 写一个纯函数 mergeRowsByKey**

- 输入：`prevRows`, `incomingRows`
- 规则：
  - key = `${psdId}__${imgId}`
  - 命中时：合并 `formatResults`，优先保留已有 `psdName/imgName/imgUrl` 等展示信息
  - 未命中：追加新行

**Step 2: 本地快速验证**

- 通过开发环境手动生成一次：先 PSD/JPG，再 PNG
- 预期：列表同一产品图只显示一行，行内 PNG/PSD 徽标均有状态

---

### Task 2: fresh 模式把 PNG 合并回同一行

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`

**Step 1: 替换 PNG 追加逻辑**

- 把 `setGenerationResults(prev => [...prev, ...pngRows])` 改为 `setGenerationResults(prev => mergeRowsByKey(prev, pngRows))`

**Step 2: 校验“下载单张/格式徽标”渲染逻辑**

- 预期：合并后行内有多格式时，不显示“下载单张”，仅显示格式徽标下载按钮

---

### Task 3: template 模式把 PNG 合并回同一行

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`

**Step 1: 替换 template 模式 PNG 追加逻辑**

- 同 Task 2，但发生在 `handleBatchGenerateFromTaskTemplate` 的 PNG 生成结束处

---

### Task 4: 多格式行展示错误摘要（可选但推荐）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`

**Step 1: 在 hasMultipleFormats 为 true 时显示 firstError**

- 规则：优先显示 PSD 的错误，否则显示第一个 error

---

### Task 5: 验证与回归

**Files:**
- None

**Step 1: Run lint**

Run: `npm run lint`
Expected: exit code 0

**Step 2: Run build**

Run: `npm run build`
Expected: exit code 0

