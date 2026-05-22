# psd-to-ecommerce-new 前端架构与交互方案（模版管理 / 普通使用分离）

> 目标：在不破坏现有稳定引擎的前提下，为「多商品位、多行 Excel 数据、按 Slot 精准回填」设计一套清晰的前端架构与交互方案，并区分**模版管理端**与**普通使用端**。

---

## 1. 整体架构概览

### 1.1 项目拆分思路

- 代码基座：基于 `psd-to-ecommerce-bento` 复制出的新项目 `psd-to-ecommerce-new`，沿用现有：
  - React 19 + Zustand 状态管理
  - Node.js 后端 + Photoshop 渲染引擎（`/api/template/ingest` + `/api/template/export` 等）
  - PSD 解析逻辑与导出逻辑保持兼容
- 新增概念：
  - **Template 模版**：管理员创建并保存的 PSD + 变量绑定方案
  - **Slot 商品位**：PSD 画布上被圈选的一块区域，代表一组商品相关变量（如：编号/名称/材质/价格）
  - **Slot-Field 映射**：Slot 内的每一个变量（PS 图层/文本）与 Excel 字段之间的绑定关系
  - **Slot-Record 映射**：普通用户在使用时，为每个 Slot 指定一条或多条 Excel 记录

### 1.2 双角色 / 双入口

- 管理端（模板管理页面）：
  - 访问路径示例：`/admin/templates` 或 `#/admin`
  - 仅面向管理员/设计同学
  - 职责：
    - 上传 PSD、创建模版
    - 在画布上圈选/选中变量，创建 Slot
    - 上传 Excel 文件，解析字段
    - 配置「Slot 内变量 ↔ Excel 字段」映射
    - 保存模版（含 PSD 元信息、Slot 定义、字段映射）

- 普通用户端（生产界面）：
  - 访问路径示例：`/workbench` 或 `#/produce`
  - 面向运营/投放同学
  - 职责：
    - 从模版库选择一个模版
    - 自动载入 PSD 画布与已配置好的 Slot + 字段映射
    - 上传 Excel，做数据查询 & 多行选择
    - 为每个 Slot 指定对应的 Excel 记录（支持一对一或按顺序批量绑定）
    - 一键同步：根据 Slot-Record 映射批量生成导出任务，将多条数据回填到 PSD 对应变量

### 1.3 路由与主要页面

以单页应用为基础，新增两大路由：

- `/admin/templates`：模版管理列表页
- `/admin/templates/:id/edit`：单个模版编辑页（PSD 圈选 + 字段映射）
- `/workbench`：普通用户工作台（选择模版 + Excel 绑定 + 一键同步）

路由可以通过 React Router 或轻量自实现（基于 hash）的方式集成，保持项目结构简单。

---

## 2. 核心数据模型设计

> 只描述前端侧的状态结构，具体类型可用 TypeScript 接口实现。

### 2.1 Template 模型

- 基本信息（来自后端 `manifest.json` / 模版列表接口）：
  - `id: string` 模版 ID
  - `name: string` 模版名称
  - `previewUrl?: string` 预览图
  - `width: number` 画布宽度
  - `height: number` 画布高度

- 扩展字段（前端/后端约定，存储在模版配置内）：
  - `slots: Slot[]` 当前模版下定义的所有商品位
  - `fieldMap: FieldDefinition[]` Excel 字段定义（管理员侧上传 Excel 后确认的字段列表）

### 2.2 Slot 模型

一个 Slot 对应 PSD 上的一块「商品区域」，以及内部的变量图层。

- `Slot`：
  - `id: string` Slot 唯一 ID
  - `name: string` 显示名称（如「左侧主推商品」「右侧推荐位」）
  - `rect: { x: number; y: number; width: number; height: number }` 在画布上的区域（用于高亮和点击）
  - `layerIds: string[]` 属于该 Slot 的图层/变量 ID 列表（前端解析时拿到的 `layer.id` 或内部 `layerId`）
  - `variables: SlotVariable[]` Slot 内部的变量列表

- `SlotVariable`：
  - `id: string` 变量唯一 ID（通常与图层 ID 一一对应）
  - `psId: number` Photoshop 内部图层 ID（用于导出时 updates 协议）
  - `type: 'text' | 'image'` 变量类型
  - `label: string` 在 UI 中展示的友好名称（如「商品编号」「材质」「主图」）
  - `excelFieldKey?: string` 绑定的 Excel 字段键（如 `sku_code`, `material`）

### 2.3 Excel 字段与记录

- 字段定义 `FieldDefinition`：
  - `key: string` 字段键（来自 Excel 列名的标准化）
  - `name: string` 原始列名或中文说明
  - `type: 'string' | 'number' | 'date' | ...` 字段类型（可选）

- 记录 `ExcelRecord`：
  - `id: string` 行 ID（可使用行号或 uuid）
  - `rowIndex: number` 行号
  - `values: Record<string, string | number | null>` 字段键到单元格值映射

### 2.4 Slot-Record 映射（普通用户使用时）

- `SlotRecordMapping`：
  - 结构：`Record<string, string | null>`
  - 含义：`{ [slotId]: recordId | null }`
  - 由普通用户在界面中操作产生，是「某个商品位用哪一行 Excel 数据」的配置。

在一键同步时：

- 遍历所有 Slot：
  - 根据 `slotRecordMapping[slot.id]` 找到绑定的 Excel 行
  - 读取该行对应字段值，结合 `slot.variables` 中的 `excelFieldKey`
  - 生成 Photoshop `updates` 指令数组

---

## 3. 管理端：模版创建与 Slot 配置交互

### 3.1 管理端页面结构

**页面 1：模版列表 `/admin/templates`**

- 功能：
  - 展示已有模版的卡片列表（名称、缩略图、创建时间）
  - 支持搜索/筛选（按名称、创建时间）
  - 操作：`新建模版`、`编辑`、`删除`

**页面 2：模版编辑器 `/admin/templates/:id/edit`**

- 主布局建议三栏：
  - 左侧：PSD 图层树 / 工具栏
  - 中间：画布预览区（遵守 `FRONTEND-DESIGN.md` 的视觉规范，采用玻璃拟态/Bento 样式）
  - 右侧：Slot 管理 & 字段映射面板

### 3.2 管理端操作流程

#### 步骤 1：上传 PSD & 初始化画布

- 管理员在模版编辑页点击「上传 PSD」：
  - 前端调用现有 `POST /api/template/ingest`，上传 PSD
  - 后端解析成功后返回 `templateId` 与基础尺寸/预览图
  - 前端：
    - 加载解析后的图层 JSON
    - 在画布中渲染 PSD 结构
    - 显示基础预览（保持与旧项目一致的高保真）

#### 步骤 2：在画布上圈选创建 Slot

为满足「圈选选中多个变量字段创建 slot」这一需求，前端提供两种能力：

1. **框选创建 Slot**：
   - 工具栏中有一个「创建商品位（Slot）」工具
   - 点击后在画布上拖动生成一个矩形选区
   - 系统根据选区范围自动检测落在其中的图层/变量：
     - 仅收集可绑定的文本/图片层
   - 弹出「新建 Slot」对话框：
     - Slot 名称（默认「商品位1」等，可编辑）
     - 列表展示所有被选中的变量（图层名 + 预览文本）
     - 可勾选/取消部分变量
   - 确认后生成一个新的 `Slot`，写入当前模版状态：
     - `rect` 即为当前矩形区域
     - `layerIds`/`variables` 由选区内图层生成

2. **从图层树创建 Slot**（高级/精确）：
   - 在图层树中多选若干相关图层
   - 右键菜单选择「设为新商品位」
   - 同样弹出「新建 Slot」对话框，允许命名与变量勾选

画布上的 Slot 表现：

- 每个 Slot 区域用淡色描边 + 标题标签显示（遵循 Bento/Glass 风格）
- 悬浮或点选 Slot 时：
  - 高亮对应区域
  - 在右侧 Slot 列表中同步选中该 Slot

#### 步骤 3：上传 Excel & 确认字段定义

- Slot 定义完毕后，管理员上传一份「字段模版 Excel」：
  - 前端使用现有 Excel 解析工具读取表头与若干行数据
  - 显示「字段定义面板」：
    - 列出所有列名及推测类型（字符串/数字等）
    - 管理员可编辑字段的「别名」或「业务含义说明」
  - 保存字段定义：
    - 构造 `FieldDefinition[]`，作为模版的一部分
    - 后续普通用户上传的 Excel，将以这些 `key` 为基准做匹配

#### 步骤 4：配置 Slot 内变量 ↔ Excel 字段映射

- 在右侧「Slot 管理」面板中，以列表展示所有 Slot：
  - 每行：Slot 名称 + 字段映射状态（例如「已映射 3/4 个字段」）
  - 点击某个 Slot 进入「变量映射面板」：
    - 左侧：Slot 下的变量列表：
      - 变量名（图层名/自定义 label）、类型（文本/图片）、示例内容
    - 右侧：每个变量对应一个下拉框：
      - 选项为 `FieldDefinition` 列表（Excel 字段）
      - 默认可尝试根据名称做智能匹配（如「商品编号」自动选 `sku`）
    - 支持：
      - 将某个变量标记为「不参与数据驱动」（手动文案）

保存时，将 `Slot[]` 与 `FieldDefinition[]` 作为模版配置存入后端或模版 manifest 中。

#### 步骤 5：保存模版

- 点击「保存模版」：
  - 调用后端 `POST /api/template/save-config`（可新增）提交：
    - `templateId`
    - `slots` 数组
    - `fieldDefinitions` 数组
  - 后端将这些信息写入对应的模版目录（如 `manifest.json` 或单独配置文件）
  - 前端提示保存成功，模版列表中即可看到该模版

---

## 4. 普通用户端：模板选择与批量回填交互

### 4.1 普通用户工作台布局

**页面：`/workbench`**

建议采用上下分区布局：

- 上半部分：
  - 模版选择条：下拉或卡片选择已发布模版
  - 画布区：加载选中模版的 PSD 预览，以及 Slot 区域高亮

- 下半部分：分为两个面板：
  - **Excel 数据面板**：
    - 上传 Excel 按钮
    - 搜索/筛选输入框（按商品编号、关键字搜索）
    - 数据表格（可多选行）
  - **Slot 绑定面板**：
    - 列出当前模版的所有 Slot
    - 每个 Slot 对应「绑定记录」的一行配置

整体视觉风格沿用 `FRONTEND-DESIGN.md` 的 Bento/Glass 设计，使用柔和阴影、圆角卡片、流体布局，让「数据 ↔ Slot 绑定」体验清晰不压迫。

### 4.2 普通用户操作流程

#### 步骤 1：选择模版

- 用户进入 `/workbench`：
  - 顶部显示模版选择区域（支持缩略图预览）
  - 选择某个模版后：
    - 前端调用 `/api/template/:id/config` 拉取：
      - PSD 基础信息
      - Slot 列表
      - 字段定义列表
    - 画布区加载 PSD 预览与 Slot 高亮框
    - Slot 绑定面板展示 Slot 列表（此时还未绑定任何数据）

#### 步骤 2：上传 Excel & 查询多条数据

- 用户在 Excel 数据面板上传 Excel 文件：
  - 前端解析为 `FieldDefinition[] + ExcelRecord[]`
  - 尝试将字段与模版的字段定义自动对齐（字段 key 一致则视为匹配）
  - 展示数据表格：
    - 支持按主键（如商品编号）搜索
    - 支持多行勾选

#### 步骤 3：为 Slot 指定对应记录

在 Slot 绑定面板中，每一行对应一个 Slot，交互设计如下：

- 行结构：
  - 左侧：Slot 名称 + 小缩略预览（可点「定位」在画布中高亮）
  - 中间：当前绑定的记录摘要（如「行 12｜商品编号：A123｜名称：夏季T恤」）
  - 右侧：操作按钮：`选择记录` `清除`

**绑定方式 A：逐个选择**

- 点击某个 Slot 行的「选择记录」：
  - 弹出一个对话框/抽屉，显示当前 Excel 数据表（与下方数据面板同源）
  - 用户在对话框中点击某一行的「使用此记录」
  - 关闭对话框，更新 `slotRecordMapping[slotId] = recordId`

**绑定方式 B：按顺序一键绑定**

- 在 Excel 数据面板中勾选多条记录（如 3 条）
- 在 Slot 绑定面板顶部提供按钮：
  - `按选中记录顺序绑定商品位`
  - 逻辑：
    - 遍历 Slot 列表（按 UI 顺序）
    - 将第 1 条记录绑定到第 1 个 Slot，以此类推
    - 如果记录数少于 Slot 数量，后面的 Slot 保持未绑定，给出提示

**绑定方式 C（可选增强）：拖拽绑定**

- 用户在 Excel 表格中拖拽某行，拖到画布中的 Slot 区域：
  - 在拖拽目标上方显示「释放以绑定到『左侧主推商品』」提示
  - 松手后完成绑定，等价于 `slotRecordMapping[slotId] = recordId`

#### 步骤 4：一键同步 / 批量生成

- Slot 绑定面板底部提供两个按钮：
  - `预览填充`：
    - 前端在画布上根据当前 `slotRecordMapping` 计算出变量值
    - 只更新 Web 画布上的文本/图片，暂不调用 Photoshop，供用户肉眼检查
  - `一键同步生成`：
    - 触发真正的导出任务

**一键同步逻辑（前端侧抽象）：**

1. 为当前模版构建一个任务队列：
   - 每一个「导出任务」可以是：
     - 一次导出，包含多个 Slot 的更新（一个组合版 PSD）
     - 或者一次 Slot-Record 组合对应一份导出（按业务需求选择）
   - 在简单实现中，可按「当前模版 + 当前 Slot-Record 映射 = 一次导出任务」处理

2. 对于每个任务：
   - 遍历所有 Slot：
     - 查找该 Slot 绑定的 `recordId`
     - 若无绑定：跳过或按配置决定是否报错
     - 若有绑定：
       - 取出对应的 `ExcelRecord`
       - 根据 `Slot.variables` 中的 `excelFieldKey` 去 `record.values` 拿值
       - 生成 `updates` 数组元素：`{ psId, varType, value }`

3. 调用后端现有导出接口：
   - `POST /api/template/export`，传入：
     - `templateId`
     - `updates: Update[]`
     - 其他导出配置（格式、质量等）

4. 前端展示导出进度：
   - 使用顶部进度条 / 任务列表卡片展示当前导出进度与结果链接

---

## 5. 前端状态管理与组件拆分建议

### 5.1 状态域划分

- `useTemplateStore`（全局模板/Slot 配置）：
  - 当前选中模版信息
  - 当前模版的 Slot 列表
  - 当前模版的字段定义列表

- `useAdminEditorStore`（仅在管理端使用）：
  - PSD 画布解析结果（图层树、画布尺寸）
  - 当前选中的 Slot / 当前选中的图层
  - 临时框选区域

- `useWorkbookStore`（Excel 数据）：
  - 当前上传的 Excel 文件元信息
  - 字段定义 & 解析结果（可在管理端/普通端复用）
  - 查询条件 & 当前筛选结果

- `useSlotBindingStore`（普通用户端）：
  - `slotRecordMapping` 映射
  - 当前高亮 Slot / 当前高亮 Excel 行

### 5.2 组件拆分（概念级别）

- 管理端：
  - `AdminTemplateListPage`
  - `AdminTemplateEditorPage`
  - `CanvasWorkbench`（复用现有画布组件，增加 Slot 高亮/框选能力）
  - `SlotManagerPanel`（Slot 列表 + 新建/编辑/删除）
  - `SlotVariableMappingPanel`（针对单个 Slot 映射 Excel 字段）
  - `FieldDefinitionPanel`（Excel 字段列表管理）

- 普通用户端：
  - `UserWorkbenchPage`
  - `TemplateSelector`
  - `ExcelDataPanel`（上传、查询、多选）
  - `SlotBindingPanel`（Slot ↔ 记录绑定）
  - `ExportTaskPanel`（显示导出队列与结果）

组件层级与命名保持与现有项目风格一致，后续在具体实现时再对接真实文件结构。

---

## 6. 验收标准与后续扩展点

### 6.1 本阶段验收标准

- 管理端：
  - 能从 PSD 创建模版
  - 在画布上圈一块区域，自动识别该区域内的变量，并成功创建 Slot
  - 能上传 Excel 并得到字段定义
  - 能为 Slot 内每个变量配置对应的 Excel 字段
  - 能将上述配置保存为模版，并在列表中重新载入查看

- 普通用户端：
  - 能选择已配置好的模版
  - 能上传 Excel、查询并多选多行数据
  - 能为每个 Slot 指定一条 Excel 记录（手动或按顺序绑定）
  - 点击「预览填充」时，画布上能看到不同 Slot 使用不同记录的数据
  - 点击「一键同步」时，能触发导出任务（后端调用可先 stub/mock，在实现阶段再接真实接口）

### 6.2 后续可选扩展

- Slot 支持「重复区域」配置（一个 Slot 对应多行记录，形成商品列表）
- Slot 模版的权限控制（哪些模版对哪些普通用户可见）
- Excel 字段多语言/多渠道配置（例如不同平台字段名不同）
- 导出任务中心：统一查看历史导出记录、重试失败任务

---

以上方案仅调整前端架构与交互，不改变底层 PSD 解析与 Photoshop 导出协议，确保在 `psd-to-ecommerce-new` 中可以渐进式落地，实现「管理员配置模版 + 普通用户一键批量回填」的完整闭环。

