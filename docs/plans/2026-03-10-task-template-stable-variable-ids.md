# 任务模板改用稳定变量ID（根治 selectedPsIds 漂移）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 任务模板不再依赖不稳定的图片变量 psId，改为持久化稳定的变量 `id`，从而彻底避免“保存后加载失效/自动修复反复出现/导出任务异常”。

**Architecture:** 在任务模板 item 中新增 `selectedVarIds`（数组）作为主键；服务端 `/api/template/:id` 的 `manifest.variables` 已提供稳定 `id`（sha1(path:varType:key)），导出时以 `selectedVarIds -> 当前变量 psId` 动态映射，兼容老数据：若只有 `selectedPsIds` 则在读取时尝试反推并写回 `selectedVarIds`。

**Tech Stack:** Node/Express（server），React（Vite），Node test runner（`node --test`）

---

### Task 1: 后端任务模板存储升级（新增 selectedVarIds）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\taskTemplateService.js`
- Test: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\taskTemplateService.test.js`

**Step 1: 写 failing test**

在现有测试基础上新增用例：
- 创建任务模板时 items 可携带 `selectedVarIds`
- `get()` 返回时保留 `selectedVarIds`
- 若 items 只有 `selectedPsIds`，在模板 manifest.variables 存在时可反推 `selectedVarIds`（至少同数量/可匹配）

伪代码示例：

```js
const tpl = svc.create({ name, items: [{ templateId, selectedPsIds:[11], selectedVarIds:['aaaaaaaaaaaaaaaa'], guidePicks:{}, exportFormats:['psd'] }] });
assert.deepEqual(tpl.items[0].selectedVarIds, ['aaaaaaaaaaaaaaaa']);
```

**Step 2: 运行测试确认失败**

Run:
- `node --test server/services/taskTemplateService.test.js`

Expected:
- FAIL：`selectedVarIds` 未被持久化/返回

**Step 3: 最小实现**

在 `taskTemplateService.js`：
- `normalizeItems()`：允许 `selectedVarIds`（string[]），做去重/排序（按输入顺序即可）
- `create/update` 写库：把 `selectedVarIds` 写入 item（与 selectedPsIds 并存）
- `get()`：返回时包含 `selectedVarIds` 字段（数组或 null）

**Step 4: 运行测试确认通过**

Run:
- `node --test server/services/taskTemplateService.test.js`

Expected:
- PASS

---

### Task 2: 服务端提供 varId->psId 映射（用于导出与兼容旧数据）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\slotConfigService.js`（若需要扩展 /api/template/:id 返回字段）
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\index.js`（/api/template/:id 可选增强）
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\taskTemplateService.js`

**Step 1: 写 failing test**

在 `taskTemplateService.test.js` 增加场景：
- manifest.variables 中存在 `{ id, psId, varType }`
- 旧任务模板只存 `selectedPsIds`
- `get()` 能根据 `psId` 找到对应 `id`，填充 `selectedVarIds`（返回里可见）

**Step 2: 实现映射逻辑**

在 `taskTemplateService.get()` 内：
- 读取 `output/templates/<templateId>/manifest.json` 的 `variables`
- 构建 `psId -> varId` 映射（只取图片变量 varType=img/image）
- 若 item.selectedVarIds 为空且 selectedPsIds 存在：反推 `selectedVarIds`
- （可选）若反推成功且与原不同，在内存对象里更新并在下一次 `update` 时写回（由前端触发自动保存）

**Step 3: 跑测试**

Run:
- `node --test server/services/taskTemplateService.test.js`

Expected:
- PASS

---

### Task 3: 前端任务模板导出使用 selectedVarIds（根治漂移）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`
- Test: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\tests\guide_pick_ui_behavior.test.mjs`

**Step 1: 写 failing test（轻量文本断言）**

在 `tests/guide_pick_ui_behavior.test.mjs` 加一条断言：
- 代码中存在对 `selectedVarIds` 的处理（字符串包含检查）

**Step 2: 最小实现**

在 `handleBatchGenerateFromTaskTemplate`：
- 拉取 `/api/template/:id` 得到 `variables`（已做）
- 构建 `varId -> psId` 映射（只取图片变量）
- 对每个 task item：
  - 若 item.selectedVarIds 有值：映射为 `selectedPsIds`（数组）
  - 否则回退到现有 selectedPsIds（兼容）
- 后续导出、合并PSD逻辑只使用映射后的 `selectedPsIds`

**Step 3: 跑测试**

Run:
- `node --test tests/guide_pick_ui_behavior.test.mjs`

Expected:
- PASS

---

### Task 4: 自动修复后自动写回 selectedVarIds（一次性结束）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\Workbench\BatchProductImageTab.jsx`

**Step 1: 行为约束**

当检测到“绑定已变化”并触发自动修复：
- 自动保存时同时把修复结果写回：
  - `selectedPsIds`（当前有效）
  - `selectedVarIds`（若可从 `/api/template/:id` variables 推出）
- 成功：显示轻提示（B）

**Step 2: 手工验证**

用一个会触发修复的任务模板：
- 第一次：出现“自动修复并自动保存”
- 第二次重新加载再导出：不再触发修复提示

---

### Task 5: 全链路回归

**Files:**
- None

**Step 1: Run server tests**

Run:
- `node --test server/services/taskTemplateService.test.js`

Expected:
- PASS

**Step 2: Run frontend tests**

Run:
- `node --test tests/guide_pick_ui_behavior.test.mjs`

Expected:
- PASS

**Step 3: Run lint/build**

Run:
- `npm run lint`
- `npm run build`

Expected:
- Exit code 0

