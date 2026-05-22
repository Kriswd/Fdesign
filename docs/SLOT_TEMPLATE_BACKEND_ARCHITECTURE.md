# psd-to-ecommerce-new 后端架构与设计方案（模版 / Slot / 批量导出）

> 目标：在沿用现有 Fdesign 引擎的前提下，为「模版管理端 + 普通使用端」提供匹配的后端架构与接口设计，支撑前端的 Slot 配置、字段映射与多行 Excel 数据批量回填。

---

## 1. 总体架构与原则

### 1.1 分层结构回顾

- **前端 (React)**：
  - 管理端：模版创建、Slot 圈选、字段映射配置
  - 普通端：选择模版、上传 Excel、多行绑定 Slot、一键同步
- **Node.js 服务层**：
  - 模版生命周期管理：ingest / save / list / delete
  - 模版配置管理：Slot 定义 + 字段定义的持久化与读取
  - 导出任务接收：接收前端构造好的 `updates` 列表并调用 Photoshop 引擎
- **Photoshop 渲染层**：
  - 执行 `render_export.jsx`，根据 `job.json` 对 PSD 副本进行文本 / 图片替换并导出

### 1.2 设计原则

- **前端是业务意图的唯一真理源**：
  - Slot 分组、Excel 字段映射、Slot-Record 映射逻辑全部在前端计算
  - 后端不做「猜测」，只负责持久化配置与执行导出
- **后端保持无状态 / 轻业务**：
  - 不引入复杂的会话状态，依赖 `templateId` + 文件系统目录定位资源
  - 模版配置以 JSON 文件形式存放在模板目录中，便于备份迁移
- **导出协议统一使用 `updates`**：
  - 遵守 `ARCHITECTURE.md` 中的铁律：首选 `updates[{ psId, varType, value }]`
  - 兼容旧的 `values + variables` 但不再扩展
- **安全与隔离**：
  - 所有模板 ID 必须通过 `isSafeTemplateId` 校验
  - 禁止任何路径穿越行为
  - 每次导出基于 `output/templates/{templateId}/source.psd` 的副本

---

## 2. 模版与 Slot 配置的存储设计

### 2.1 文件系统结构

沿用现有 `output/templates/{templateId}` 目录结构，在每个模版目录下增加配置文件：

```text
output/
  templates/
    {templateId}/
      source.psd
      reference.png
      backdrop.png
      manifest.json          # 模版元数据（已有）
      slot-config.json       # 新增：Slot + 字段映射配置
      exports/
        job_*.json
        export_*.png
```

### 2.2 manifest.json（保持兼容）

现有 `manifest.json` 继续承担：

- 模版基本元数据：
  - `name`: 模版名称
  - `originalPsdName`: 入库时的 PSD 文件名（用于批量导出按平台规则识别）
  - `isUserSaved`: 是否为用户保存
  - `savedAt`: 保存时间
- 前端画布配置：
  - `frontendConfig`: 画布层级、切片线、默认变量值等

本次方案中，**Slot 与字段映射不写入 manifest，而是独立到 `slot-config.json`**，避免 manifest 过于膨胀，也便于未来对 Slot 逻辑单独版本化。

### 2.3 slot-config.json 结构

```jsonc
{
  "templateId": "6accd848595bdd26",
  "version": 1,
  "slots": [
    {
      "id": "slot_main_1",
      "name": "左侧主推商品",
      "rect": { "x": 120, "y": 300, "width": 520, "height": 640 },
      "layerIds": ["layer_101", "layer_102", "layer_103"],
      "variables": [
        {
          "id": "var_price",
          "psId": 123456,
          "type": "text",
          "label": "活动价",
          "excelFieldKey": "price_promo"
        },
        {
          "id": "var_title",
          "psId": 123457,
          "type": "text",
          "label": "商品标题",
          "excelFieldKey": "title"
        },
        {
          "id": "var_img_main",
          "psId": 123458,
          "type": "image",
          "label": "主图",
          "excelFieldKey": "img_main_url"
        }
      ]
    }
  ],
  "fieldDefinitions": [
    {
      "key": "sku",
      "name": "商品编号",
      "type": "string"
    },
    {
      "key": "title",
      "name": "商品标题",
      "type": "string"
    },
    {
      "key": "price_promo",
      "name": "活动价",
      "type": "number"
    }
  ]
}
```

说明：

- `slots`：完整的商品位（原 Slot 概念）列表，与前端文档中的结构保持一致
- `variables`：每个商品位内的变量绑定：
  - `psId` 必须从 PSD 解析中取得，确保导出时可直接生成 `updates`
  - `excelFieldKey` 与前端的 `FieldDefinition.key` 对齐
- `fieldDefinitions`：模版预期的 Excel 字段集合，供前端对普通用户上传的表结构做校验与自动匹配
- `ignoredVariableIds`：在管理端被标记为「不参与商品位映射」的变量 ID 列表（仍存在于 PSD 中，但在本模版配置中视为已移除）
- `ignoredFieldKeys`：在管理端被标记为「不参与当前模版商品位配置」的 Excel 字段键列表（仍可在 Excel 中存在，仅在本模版配置中视为已移除）

> 注意：普通用户「Slot ↔ Excel 记录」的映射不在服务端持久化，只在前端会话内计算，用于构造本次导出的 `updates`。

---

## 3. 模版管理相关后端接口设计

### 3.1 模版配置保存（管理端）

**Endpoint**：`POST /api/template/:id/slot-config`

**用途**：

- 管理员在模版编辑页完成：
  - Slot 圈选
  - 字段定义确认
  - 变量 ↔ 字段映射
 之后，将配置写入 `slot-config.json`。

**请求体**：

```json
{
  "slots": [/* Slot[] */],
  "fieldDefinitions": [/* FieldDefinition[] */],
  "ignoredVariableIds": [/* string[] 被标记为不参与商品位映射的变量 ID 列表 */],
  "ignoredFieldKeys": [/* string[] 被标记为不参与当前模版配置的 Excel 字段 key 列表 */]
}
```

**返回值**：

```json
{
  "success": true,
  "templateId": "...",
  "savedAt": "2026-01-20T...Z"
}
```

**后端逻辑要点**：

- 校验：
  - 路径参数 `id` 必须通过 `isSafeTemplateId`
  - 校验模板目录与 `manifest.json` 存在
- 写入：
  - 将 `slots` 与 `fieldDefinitions` 写入 `slot-config.json`
  - 添加服务器端 `savedAt` 时间戳
- 幂等：
  - 多次调用会覆盖旧配置（前端应在编辑时先拉取现有配置再修改）

### 3.2 模版配置读取（管理端 + 普通端共用）

**Endpoint**：`GET /api/template/:id/config`

**用途**：

- 管理端编辑模版时，拉取已保存的 Slot 配置
- 普通用户端在选择模版后，加载：
  - PSD 尺寸 & 预览图
  - Slot 列表
  - 字段定义列表

**响应示例**：

```json
{
  "id": "6accd848595bdd26",
  "name": "夏季T恤三商品位模版",
  "width": 790,
  "height": 2600,
  "imageUrl": "/templates/6accd848595bdd26/reference.png",
  "slots": [/* Slot[] */],
  "fieldDefinitions": [/* FieldDefinition[] */]
}
```

**后端逻辑要点**：

- 从 `manifest.json` 中读取基础信息（名称、尺寸）
- 按现有逻辑选择 `reference.png` 或 `backdrop.png` 作为 `imageUrl`
- 尝试读取 `slot-config.json`：
  - 若存在：返回其中的 `slots` 与 `fieldDefinitions`
  - 若不存在：返回空数组，供管理端初次配置

### 3.3 模版列表 / 保存 / 删除（复用现有接口）

- 模版列表 `GET /api/templates`：
  - 已经实现，基于 `manifest.isUserSaved` 过滤
  - 普通用户端模版选择器直接复用

- 模版保存 `POST /api/template/save`：
  - 主要更新 `manifest.name`、`isUserSaved`、`savedAt`、`frontendConfig`
  - Slot 配置由 `/api/template/:id/slot-config` 负责，不混写

- 模版删除 `DELETE /api/template/:id`：
  - 已有实现，可直接物理删除对应目录（包含 slot-config 与 exports）

---

## 4. 批量导出与一键同步设计

### 4.1 导出职责划分

- **前端（普通用户端）负责**：
  - 计算 Slot ↔ ExcelRecord 映射
  - 根据 `slot-config.json` 中的 `slots.variables` + 当前 Excel 数据，生成 `updates` 数组
  - 按需要决定导出策略：
    - 单次导出中更新所有 Slot（得到一张综合大图）
    - 多次导出，每次只更新某些 Slot，生成多张图

- **后端负责**：
  - 对每次导出请求执行一次 `exportTemplate` 调用
  - 管理 `job.json` 与导出文件

### 4.2 一键同步接口（基础版）

为了保持后端简单、前端可控，推荐：**前端直接多次调用现有 `/api/template/export` 接口**，而不引入新的批量导出 API。这样可以：

- 充分利用现有、稳定的 Photoshop 流程
- 避免在后端再做一层「Slot → updates」反向推导（违背前端为 SSOT 的原则）

前端构造的导出请求示例：

```json
POST /api/template/export
{
  "templateId": "6accd848595bdd26",
  "updates": [
    { "psId": 123456, "varType": "text", "value": "¥99.00" },
    { "psId": 123457, "varType": "text", "value": "夏季纯棉T恤" },
    { "psId": 123458, "varType": "img",  "imagePath": "e:/tmp/img_main_001.png" }
  ],
  "format": "png",
  "quality": 95
}
```

> 图片字段：如果 Excel 中是 URL，前端/后端之间需约定：前端先下载并上传到后端的图片处理中转接口，再将本地 `imagePath` 回填到 `updates`。这一点可以在实现阶段细化，不影响当前架构设计。

### 4.3 可选：后端批量导出封装 API

如果希望后端统一接收一个「批量任务」，可以增加一个轻量封装：

**Endpoint**：`POST /api/template/:id/batch-export`（可选）

**请求体示例**：

```json
{
  "tasks": [
    { "label": "SKU_A", "updates": [/* Update[] */] },
    { "label": "SKU_B", "updates": [/* Update[] */] }
  ],
  "format": "png",
  "quality": 95
}
```

**后端行为**：

- 校验 `templateId`
- 依次对每个 `tasks[i]` 调用内部的 `exportTemplate`
- 生成结果列表返回：

```json
{
  "success": true,
  "results": [
    { "label": "SKU_A", "url": "/templates/.../exports/export_1712.png" },
    { "label": "SKU_B", "url": "/templates/.../exports/export_1713.png" }
  ]
}
```

> 注意：这里仍然不让后端参与 Slot → updates 的转换，只是帮前端批量调用导出逻辑、聚合结果，符合「后端是 dumb executor」的原则。

---

## 5. 安全性、健壮性与运维

### 5.1 安全性

- 所有与 `templateId` 相关的接口都必须调用已有的 `isSafeTemplateId` 校验函数
- 任何文件读写都必须以 `output/templates/{templateId}` 为根目录，禁止拼接上级路径
- 对 `slot-config.json` 的写入需要：
  - 限制请求体大小
  - 对字段类型做基础校验（slots 必须为数组，psId 为数字等）

### 5.2 健壮性

- 读取 `slot-config.json` 时：
  - 文件不存在：返回默认空配置
  - JSON 解析失败：记录错误日志，返回 500，提示「模版配置损坏」
- 导出时：
  - 若 `updates` 为空或长度为 0：直接返回错误，避免无意义导出
  - 大批量导出时，前端应做节流与并发控制（例如一次最多并发 2-3 个任务）

### 5.3 清理与生命周期

- 继续复用 `CleanupService`：
  - 对临时模版目录按时间清理
  - `slot-config.json` 与导出结果随模版目录一并回收
- 对导出结果可选择：
  - 保留最近 N 天 / 最近 N 次导出
  - 或继续由 CleanupService 根据时间统一清理

---

## 6. 与现有文档与实现的对齐关系

- 与 `docs/ARCHITECTURE.md`：
  - 保持「前端解析 + Node 中间层 + PS 宿主」三层架构不变
  - 继续遵守 `updates` 优先、`values` 兼容的导出协议
- 与 `docs/API_DEV_GUIDE.md`：
  - 不修改现有 `/api/template/ingest` 与 `/api/template/export` 接口
  - 在其基础上增加：
    - `GET /api/template/:id/config`
    - `POST /api/template/:id/slot-config`
    - （可选）`POST /api/template/:id/batch-export`
- 与前端 `SLOT_TEMPLATE_FRONTEND_ARCHITECTURE.md`：
  - `slot-config.json` 中的 `Slot`、`SlotVariable`、`FieldDefinition` 结构与前端约定完全一致
  - 前端只需在进入页面时调用 `/api/template/:id/config`，即可拿到所有配置
  - 管理端保存 Slot/字段映射时调用 `/api/template/:id/slot-config`

---

通过以上后端架构与接口设计，可以在 `psd-to-ecommerce-new` 中较小代价地支持：

- 管理端：PSD 模版解析 + Slot 圈选 + 字段映射配置的持久化
- 普通端：基于模版配置的多行 Excel 数据绑定与一键批量导出

同时保持后端职责「轻业务、重执行」，最大化沿用现有稳定的 Photoshop 渲染链路，降低改造风险。

