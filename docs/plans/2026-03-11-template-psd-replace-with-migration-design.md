# PSD 模板“替换源文件并继承配置”设计（增强版）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在管理后台允许用新 PSD 替换已有模板的源 PSD，同时最大程度继承旧模板的商品位配置、Excel 字段映射、规则链（computedRule/computedRules）、忽略列表（ignoredVariableIds/ignoredFieldKeys）。

**Architecture:** 以“模板 ID 不变”为前提，对模板进行一次“结构再解析 + 配置迁移”。迁移时对旧配置中的变量条目，按多层级匹配策略在新 PSD 解析出的变量列表中找到“对应变量”，再把 Excel 映射与规则复制过去。保存时仍写回同一 `templateId` 的 `slot-config.json`，并更新 `manifest.json/source.psd` 以反映新 PSD。

**Tech Stack:** Node/Express（server）, React（admin）, ag-psd/Photoshop ingest pipeline（现有）

---

## 现状与问题根因

1. 模板变量来自 PSD 解析（`manifest.json.variables`），变量包含 `id/psId/path/key/varType/geom...`（前端展示、配置基础）。
2. 配置保存在 `output/templates/<templateId>/slot-config.json`，每个变量配置会保存 `psId`（服务端校验要求为数字）、以及 `excelFieldKey/computedRule(s)/align...`。
3. PSD 微小变动（尤其是图层被重建/复制、SmartObject 重新置入）会导致 `psId` 或 `layer.id` 变化，从而旧配置无法再和新变量对应，用户被迫重新配置。

结论：必须在“替换 PSD”时做一次“变量重映射迁移”，降低对单一 `psId` 的脆弱依赖。

---

## 用户流程（管理后台）

在模板配置页（AdminSlotEditor）增加按钮：

1. 选择一个已存在的模板（templateId）
2. 点击“替换源 PSD（继承配置）”
3. 上传新 PSD
4. 系统执行：
   - 解析新 PSD（同 ingest 流程）
   - 迁移 slot-config：映射变量 + 继承规则/字段映射
   - 保存并刷新当前配置页
5. 显示迁移报告：迁移成功/失败统计、需要人工复核的变量列表

---

## 匹配与迁移算法（核心）

### 输入
- 旧变量列表：`oldVars`（来自旧 `manifest.variables`）
- 新变量列表：`newVars`（来自新 PSD 解析后写入的新 `manifest.variables`）
- 旧 slot-config：`oldConfig`（`slot-config.json`，包含 slots/fieldDefinitions/ignored...）

### 输出
- 新 slot-config：`nextConfig`（与新 vars 对齐后的 slots）
- 报告：`migrationReport`

### 匹配策略（从强到弱，逐级尝试）

对每一个旧 slot variable（包含旧 `psId` / 旧 `id` / 旧 `name` / 旧 `type` / 旧 `computedRule(s)` / 旧 `excelFieldKey` 等），在新变量中选择最佳候选：

1. **psId 精确匹配**（同类型优先）  
   - 条件：`Number(old.psId) === Number(new.psId)` 且 `varType/type` 相容
   - 置信度：1.0

2. **key 匹配（推荐）**  
   - 条件：旧变量与新变量的 `key` 相同（`{text:xxx}` / `{img:xxx}` 解析出来的 key 在多数团队中更稳定）
   - 置信度：0.95

3. **path 匹配（图层路径）**  
   - 条件：`old.path === new.path`（结构不变时非常稳定）
   - 置信度：0.9

4. **几何匹配（位置与尺寸）**  
   - 条件：同 `varType`，并且 bbox 的中心点距离与面积差在阈值内
   - 置信度：0.7~0.85（按误差归一化）

5. **name 模糊匹配（最后兜底）**  
   - 条件：同 `varType`，`name/label` 相似度高
   - 置信度：<= 0.6（默认需要人工复核）

**一对一约束：** 新变量一旦被匹配占用，不再被其它旧变量使用（除非旧配置里确实重复引用，这种需要报冲突）。

### 迁移规则

一旦匹配出 `oldVar -> newVar`：
- 继承：`excelFieldKey / computedRule / computedRules / align / label/name(仅展示字段可选)`  
- 更新引用：写入新的 `psId` 与新的 `id`
- 其余 slot/fieldDefinitions/ignoredVariableIds/ignoredFieldKeys 原样保留，但：
  - `ignoredVariableIds` 需要按映射把旧 id 转换为新 id（无法映射的丢弃并记入报告）

### 迁移报告

输出：
- `matchedBy`: psId/key/path/geom/fuzzy 的数量统计
- `unmatched`: 未找到候选的旧变量列表（slotId/oldVar summary）
- `ambiguous`: 候选分数接近、需要人工确认的列表
- `conflicts`: 多个旧变量想匹配同一个新变量的冲突列表

---

## 服务端 API 设计

新增接口（管理员权限）：

`POST /api/template/:id/replace-psd`

**FormData:**
- `psd`: File
- `mode`: `"migrate"`（固定）

**Response:**
- `success: true`
- `templateId`
- `migrationReport`
- `updatedConfig`（可选：直接回传新 config，或前端二次 GET 拉取）

服务端做的事：
- 校验 templateId
- 走 ingest 解析新 PSD，但写入到同一个 `output/templates/<id>/`（覆盖 source.psd/manifest.json/预览图等）
- 读取旧 `slot-config.json` 与旧 manifest.variables
- 运行迁移算法生成 `nextConfig`
- 写回 `slot-config.json`
- 返回报告

---

## 前端（AdminSlotEditor）改动点

- 增加“替换源 PSD（继承配置）”按钮 + file input
- 上传后调用 replace API
- 成功后刷新：重新拉取 `/api/template/:id/config` 与模板详情，更新画布与 slots
- 用一个面板展示 `migrationReport`（至少显示成功/失败数量和待复核清单）

---

## 测试策略

1. 服务端迁移算法单测：
   - 构造 old/new variables（psId 改变、key 相同）
   - old slot-config 里绑定 excelFieldKey 与 computedRules
   - 期望迁移后新 config 的变量条目继承字段与规则且 psId 更新

2. API 集成测试（可选）：
   - 使用临时 outputRoot
   - 写入旧模板目录、旧 manifest/slot-config
   - 调用迁移函数并断言文件落盘

3. 手工回归：
   - 用真实 PSD 版本 v1 配置复杂规则
   - 替换为 v2（只改文案/轻微结构）
   - 验证无需重新配置即可回填

