# Admin Upload Auto-Navigate & Newest-First Sorting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理后台上传新的 PSD 后，模板列表中新模板置顶，并自动进入该模板的配置界面。

**Architecture:** 仅做前端行为调整：`fetchTemplates()` 在客户端对 `/api/templates` 返回结果按 `savedAt` 倒序排序；上传成功后用返回的 `templateId` 立即 `setEditingTemplateId` 切换渲染到 `AdminSlotEditor`，同时把新模板条目插入本地列表头部以保证“置顶”即时生效。

**Tech Stack:** React (Vite), fetch API, react state

---

### Task 1: 写出可复用的模板排序逻辑

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminPage.jsx`

**Step 1: 添加 sortTemplatesBySavedAt helper**

实现一个纯函数：
- 输入：`Template[]`
- 输出：按 `savedAt`（ISO 字符串）倒序；若缺失 `savedAt`，排后面；再用 `id` 倒序做稳定兜底

**Step 2: 在 fetchTemplates 内应用排序**

把 `setTemplates(data)` 改为 `setTemplates(sortTemplatesBySavedAt(data))`。

---

### Task 2: 上传成功后自动进入配置页，并保证新模板置顶

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminPage.jsx`

**Step 1: 上传流程拿到 templateId 后创建本地模板条目**

在 `saveResp.ok` 后，解析响应 JSON 得到 `savedAt/previewUrl`（如存在），构造：
- `id: ingestData.id`
- `name: 上传文件名（去 .psd）`
- `previewUrl: save 返回或 null`
- `savedAt: save 返回或 new Date().toISOString()`

**Step 2: 置顶插入并去重**

`setTemplates(prev => [newOne, ...prev.filter(t => t.id !== newId)])`

**Step 3: 自动切到配置界面**

调用 `setEditingTemplateId(newId)`，让 `AdminPage` 立即渲染 `AdminSlotEditor`。

---

### Task 3: 验证与回归

**Step 1: Lint**

Run: `npm run lint`
Expected: exit code 0

**Step 2: Build**

Run: `npm run build`
Expected: exit code 0

**Step 3: 手工回归**

- 在管理后台上传 PSD
- 期望：上传完成后直接进入配置页（不再停留列表页）
- 返回列表（点返回）后：新模板在列表最前面（按 savedAt 最新优先）

