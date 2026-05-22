# Fdesign 项目架构与核心技术文档

本文档是当前 `psd-to-ecommerce-new` 的架构基线，覆盖前端、后端、Photoshop 渲染链路、存储模型、鉴权策略与运行维护约束。

---

## 1. 系统总览

项目采用 **React 前端 + Node.js 服务层 + Photoshop ExtendScript** 的混合架构：

1. **前端（React + Zustand）**
   - 管理端：`/admin`
   - 工作台主入口：`/workbench/*`
   - 兼容旧入口：`/slot`
2. **后端（Express 5）**
   - 统一 API 网关、鉴权、文件落盘、任务调度、清理与备份
3. **渲染层（Photoshop）**
   - 通过 `run_job.vbs` 调度 JSX，在 PSD 副本上执行图层替换与导出

---

## 2. 前端架构

### 2.1 路由与页面职责

- **工作台容器**：`src/pages/WorkbenchTabsPage.jsx`
  - `PSD自动填充`：`Workbench/PsdAutoFillTab.jsx`
  - `批量生成产品图`：`Workbench/BatchProductImageTab.jsx`
  - `批量抠图（无PSD）`：`Workbench/CutoutNoPsdTab.jsx`
- **管理端**：`src/pages/AdminPage.jsx`
  - 模板列表、PSD 上传、模板删除/重命名
  - 管理员登录与首次改密
  - 子模块：`AdminSlotEditor.jsx`、`AdminTaskTemplateTab.jsx`

### 2.2 前端状态与数据流

- 全局数据状态统一在 `src/store/dataStore.js`：
  - Excel 解析状态：`rawHeaders/activeHeaders/rows/primaryKey/excelHeaderCheck`
  - 模板配置状态：`slots/fieldDefinitions/ignoredVariableIds/ignoredFieldKeys`
  - PSD 自动填充图片预览：当匹配结果返回 `/output/...` 相对地址时，前端会用 `renderServerBaseUrl` 补齐成可访问 URL，避免 DEV 分域导致图片破裂
  - 用户绑定状态：`slotRecordMapping/currentRow`
- 核心业务函数：
  - `buildSlotUpdates`：根据 Slot-Record 映射生成导出 `updates[]`
  - `computeVariableValueByRules`：按顺序串行执行 `computedRules`，让后续规则消费前一步结果；当规则链无结果时再回退 `computedRule`
- API 请求通过 `src/utils/apiClient.js`：
  - 支持多候选 base URL 兜底（显式配置、同源、`hostname:3001`、localhost）
  - 404/非 JSON 网关响应场景具备降级与调试信息保留

### 2.3 PSD 自动填充页（当前主生产链路）

- 文件：`src/pages/Workbench/PsdAutoFillTab.jsx`
- 关键职责：
  - 加载模板与 slot-config
  - Excel 行选择与商品位绑定
  - 产品图库上传、款号/色号/角度自动匹配
  - 按 `slotRecordMapping` 回填变量并触发导出
- 当前交互约束：
  - 选中记录不会自动绑定商品位，需明确点选“绑定到商品位”
  - 回填诊断默认可折叠，降低信息噪声
  - Photoshop 导出时，被自动填充替换的商品图会把对应画板名称与图片图层名称重命名为产品图文件名（不带扩展名，优先使用上传原始文件名）

---

## 3. 后端架构

### 3.1 入口与服务实例

- 主入口：`server/index.js`
- 核心服务：
  - `PhotoshopIngestService`：PSD 入库/导出/批量导出/变量图导出
  - `SlotConfigService`：商品位配置读写与模板聚合配置
  - `TaskTemplateService`：任务模板（多 PSD 组合）持久化
  - `CleanupService`：模板与导出临时产物回收
  - `PuppeteerRenderService`：DOM 渲染图/PDF
  - `SharpImageProcessor`：图片处理工具接口
  - `startupBackupService`：启动时项目快照备份

### 3.2 数据根目录与迁移

- 数据根默认：`<project>/output`
- 支持重定向：`FDESIGN_DATA_DIR`（兼容 `FDESIGN_OUTPUT_DIR`）
- 若启用外部数据目录，启动时会自动尝试从旧 `output` 迁移 `templates/db/admin/assets`，并写入迁移标记文件。

### 3.3 自动备份与定时清理

- 启动备份：`runStartupBackup`（默认开启，可通过环境变量关闭）；当以 Node `--watch` 运行且未显式设置 `FDESIGN_BACKUP_ON_START` 时默认跳过，避免开发热重启反复备份拖慢启动；当主备份目录不可写时，会自动回退到可写目录（`FDESIGN_BACKUP_FALLBACK_DIR` → `<output>/project_backups_fallback` → `%TEMP%/FdesignData/project_backups`）
- 定时清理（每小时）：
  1. 过期临时模板清理（不会删除用户保存模板）
  2. 导出临时产物清理（`inputs` 过期文件、`exports` 元数据）
  3. `cutout_no_psd` 历史批次回收（白名单命名 + keepDays + keepLatest）
- 关键开关：
  - `DISABLE_SCHEDULED_CLEANUP`
  - `DISABLE_SCHEDULED_EXPORT_ARTIFACTS_CLEANUP`
  - `DISABLE_SCHEDULED_CUTOUT_NO_PSD_CLEANUP`
  - `FDESIGN_BACKUP_DIR`
  - `FDESIGN_BACKUP_FALLBACK_DIR`
  - `FDESIGN_EXPORT_INPUTS_KEEP_HOURS`
  - `FDESIGN_EXPORT_META_KEEP_HOURS`
  - `FDESIGN_CUTOUT_NO_PSD_KEEP_DAYS`
  - `FDESIGN_CUTOUT_NO_PSD_KEEP_LATEST`

---

## 4. 认证与安全模型

### 4.1 管理员鉴权

- 端点：
  - `GET /api/admin/me`
  - `POST /api/admin/login`
  - `POST /api/admin/logout`
  - `POST /api/admin/change-password`
- 会话机制：
  - HTTP-only cookie（`fdesign_admin`）+ tokenVersion 失效控制
  - 登录失败限流（按 IP）
  - 首次默认密码登录后 `mustChangePassword=true`，前端强制改密

### 4.2 鉴权边界

- 生产环境默认启用管理员鉴权
- 开发环境默认放开（`requireAdmin` 自动 bypass），或可显式设 `ADMIN_AUTH_DISABLED=true`
- 写操作受保护：
  - 任务模板增删改
  - 模板保存、模板删除、模板替换 PSD
  - 商品位配置写入
- CORS：
  - 同源直接允许
  - 可配置 `ADMIN_ALLOWED_ORIGINS`
  - 生产环境未配置白名单时默认拒绝跨域来源

---

## 5. 核心业务链路

### 5.1 模板入库与保存

1. `POST /api/template/ingest` 上传 PSD
2. 后端写入 `output/templates/{templateId}`，生成 `manifest.json` 与参考图
3. 管理端通过 `POST /api/template/save` 标记 `isUserSaved/savedAt`，并持久化 `frontendConfig`

### 5.2 模板配置（Slot Config）

- 配置文件：`output/templates/{templateId}/slot-config.json`
- 读取：`GET /api/template/:id/config`
- 写入：`POST /api/template/:id/slot-config`
- 约束：
  - `templateId` 必须通过安全校验
  - `slot.variables[].psId` 必须为数字
  - `align` 仅接受 `left/center/right`

### 5.3 模板替换 PSD 与配置迁移

- 端点：`POST /api/template/:id/replace-psd`（管理员）
- 过程：
  1. 新 PSD 入库到临时模板目录
  2. 读取旧 `slot-config` 和新旧变量
  3. 调用 `migrateSlotConfig` 迁移变量绑定与规则
  4. 覆盖原模板资源并删除临时目录

### 5.4 任务模板（Task Templates）

- 存储：`output/db/task_templates.json`（并带 SQLite 兼容迁移逻辑）
- 模型：一个任务模板可包含多个 `templateId`，并记录 `selectedPsIds/selectedVarIds/guidePicks/exportFormats`
- 删除模板保护：被任务模板引用的 `templateId` 不允许删除
- 模板删除链路会优先删除数据根目录 `outputRoot/templates/{templateId}`；若当前模板仅存在于 legacy `output/templates/{templateId}`，则会回退删除 legacy 目录，避免列表可见但无法删除

### 5.5 导出主链路（Template Export）

- 主端点：`POST /api/template/export`
- 协议优先级：`updates[]` 优先，`values + variables` 为兼容回退
- 支持格式：`png/jpeg/psd/psb`
- 关键能力：
  - Base64 图片先落地本地临时文件
  - 路径安全校验（仅允许受控目录）
  - 2GB PSD 超限时自动降级 PSB（并回传实际 outputFormat）
  - 图片预对齐链路启用高保真像素密度模式：按内容宽高与目标占位比例动态放大对齐画布（受 `maxDetailScale/maxCanvasPixels` 上限约束），并在 PSD 自动填充导出 `PNG/JPEG/PSD/PSB` 全格式生效（预缩放上限 `maxScaleFactor=3`），减少小版心场景细节损失
  - 文本变量替换后会按替换前的图层 bounds 进行水平与垂直位置校正，避免内容变化导致叠字
- 文本变量在写入 Photoshop 前会将 `\n` 标准化为 `\r`，确保手动换行在导出结果中生效
  - Photoshop 脚本读取图层几何时优先使用 `boundsNoEffects`（不可用时回退 `bounds`），降低画板/图层样式场景的替换漂移
  - PNG 导出优先使用 `PNGSaveOptions`，JPEG 导出优先使用 `JPEGSaveOptions`（质量百分比映射到 1-12 且嵌入色彩配置）；仅在异常时回退 SaveForWeb
  - 图片替换缩放时按缩放方向显式设置插值（缩小使用 `BICUBICSHARPER`，放大使用 `BICUBICSMOOTHER`），降低 PSD/PNG 导出发糊
  - 图片替换后会先比较当前 bounds 与目标占位框；若已对齐则跳过 `fitLayerToRect`，避免同一素材在 Sharp + Photoshop 发生重复重采样
  - 对齐阶段在“大幅缩小”场景会执行轻度锐化（unsharp）后再进入 Photoshop，缓解 4K 源图缩到小版心时的细节发软
  - 导出任务会基于 `manifest.variables[].path` 与 `updates[].psId` 生成 `artboardRenames`：若画板名包含“天猫主图”则仅替换中间款号段（如 `天猫主图 BL3208 C50 特价色` → `天猫主图 BX7007 C50 特价色`）；若画板名本身为“款号+色号”格式（如 `BL3208 C50`），则替换为上传文件解析出的“款号+色号”（如 `BX7007 A15`）；其余画板默认回退为解析出的“款号+色号/款号”
  - 导出前会统一执行画板组折叠（single / batch / psd-bundle 三条链路一致），导出结果默认以折叠状态落盘，降低导出 PSD 的图层面板噪音
  - 当请求为 PSD 自动填充且模板为画板 PSD 时，导出任务会下发 `preserveArtboardTextPosition`；JSX 在图片替换时会先执行智能对象隔离副本，再先 `replacePlacedContents` 完成真实置图，随后才回放原父级/兄弟层级与画板位置，避免临时大尺寸智能对象在错误时机污染画板几何并触发整批 `+1024` 偏移；层级回放同时记录并优先按 `parentId/refId` 重新解析父级与兄弟参照图层，降低对象引用失效导致的跨画板漂移；在 PSD bundle 分支中，变体层改为在原父层级复制并回放层级位置（不再优先复制到文档根），避免右侧画板等边缘位置出现跨画板位移；目标矩形默认锁定替换前图层 bounds，仅当 `updates` 里的 `x/y/width/height` 与原 bounds 近似一致时才采用，防止错误坐标造成跨画板漂移；画板稳态模式下文本目标矩形优先取当前图层 bounds（不依赖外部 update 坐标），文本替换在 `align` 缺失时会回退读取图层原始 `justification` 作为锚点，避免“部分文本偏移”；日志会额外输出 `layerChain/updateRectRaw/updateRectParsed/replacedRect(beforeFit)/desiredAfterDistance` 与 `text_update` 诊断字段便于复盘；文本层采用全量 bounds 稳态快照并在更新后统一回放
  - 服务端在发起导出前会读取 `server/photoshop/render_export.jsx` 中的 `SCRIPT_BUILD` 作为期望版本，并与 Photoshop 回传 `result.scriptBuild` 做强一致校验；若不一致直接抛出 `SCRIPT_BUILD_MISMATCH`，阻断“重启后仍在跑旧 JSX”造成的隐性偏移
  - 若 `run_job.vbs` 返回成功，但短时间内既没有 `resultPath` 也没有任何 JSX 日志（`.log/.task_0.log/.fatal.log`），服务端会判定为“Photoshop 常驻实例静默吞任务”，立即触发一次 Photoshop 进程级重置并走队列重试，避免用户端长时间等待后才收到“未生成输出文件”
  - 上述“静默吞任务”重试不受全局 `PS_EXPORT_MAX_RETRIES=0` 影响：即使普通重试预算为 0，也会保底执行 1 次“重启 Photoshop 后重试”，避免诊断命中后仍直接把错误返回给前端
  - 服务端会在当前 `jobPath` 导出目录生成注入 `__FDESIGN_JOB_PATH` 的自包含 `run_*.jsx` 执行脚本，并在调度返回后保留该文件到导出元数据清理阶段统一回收，避免 COM 成功返回后立即删除导致 Photoshop 仍在排队读取脚本时发生静默空跑
  - 返回 `jobPath/resultPath/scriptBuild/expectedScriptBuild` 便于排障

### 5.6 批量导出链路

- 端点：`POST /api/template/batch-export`
- 模式：
  - 多任务逐条导出
  - PSD bundle 合并导出
- 约束：
  - 最大任务数限制
  - 未显式传入 `quality` 时默认按 100 处理（优先质量而非体积）
  - 合并 PSD 模式要求单任务仅一个图片变量
  - PNG 命名模板导出 PSD/PSB 时强制依赖通道 TGA

### 5.7 无 PSD 抠图链路

- 端点：
  - `POST /api/assets/upload-images`
  - `POST /api/assets/upload-channel-masks`
  - `POST /api/cutout/batch-no-psd`
  - `POST /api/cutout/batch-no-psd-compose`
- 输出目录：`output/cutout_no_psd/cutout_no_psd(_compose)_<ts>/`
- 每批次包含 `job_*.json / result_*.json / 日志`，便于问题复盘

---

## 6. PSD 解析与变量机制

### 6.1 解析铁律

- 隐藏图层早期剔除（`hidden/visible:false`）
- Ghost 图层识别与过滤（命名+均匀度+白名单）
- 候选变量推断时背景图排除（面积阈值 `>= 0.5` + 命名兜底）
- 画板（Artboard）模板需做坐标系归一化：当子图层坐标为画板局部坐标时，按 `artboardRect` 自动换算到文档绝对坐标，再参与变量与参考线计算

### 6.2 变量标识与一致性

- 前端渲染变量使用 `id`，导出回写依赖 `psId`
- 变量顺序遵循 `zIndex`，保证画布与 PSD 堆叠一致
- 后端在必要时补全 `manifest.variables` 与缺失 `id`

---

## 7. 辅助渲染与图片工具链

- Puppeteer 渲染接口：
  - `/api/render/image`
  - `/api/render/pdf`
  - `/api/render/batch`
  - `/api/export/slices`
- Sharp 工具接口：
  - `/api/image/process|crop|slice|optimize|responsive|watermark|info|compare`

这些能力服务于预览、切片、图像处理等辅助场景，不替代 Photoshop 作为最终生产导出引擎。

---

## 8. 目录与运维约定

### 8.1 关键目录

- `src/`：前端应用
- `server/`：后端 API 与调度逻辑
- `server/photoshop/`：JSX 脚本
- `output/templates/`：模板主数据
- 模板列表读取以 `outputRoot/templates` 为准，启用外部数据目录时兼容合并扫描 `projectRoot/output/templates`
- 当模板仅存在于 `projectRoot/output/templates/{templateId}` 时，后端会在读取列表或详情时自动迁移到 `outputRoot/templates/{templateId}`，确保“列表可见”与“点击配置可加载”一致
- `output/db/`：任务模板与存储元信息
- `output/admin/`：管理员认证数据
- `output/release/`：发布包与阶段产物

### 8.2 启动约定

- 前端：`npm run dev`（`127.0.0.1:3010`）
- 后端：`npm run server`（默认 `3001`）
- 健康检查：`GET /health`（包含 `runtime.exportJsxPath/exportJsxScriptBuild`，用于核对导出脚本实际版本）
- 性能指标：`GET /api/metrics`

### 8.3 调试约定

- 导出可用 `dryRun: true` 验证 job 结构
- 定位导出问题优先查看 `jobPath/resultPath/scriptBuild`
- `start.bat` 的 DEV 启动会在拉起后端后强制校验 `/health.runtime.exportJsxScriptBuild` 与本地 `render_export.jsx` 的 `SCRIPT_BUILD` 一致，不一致直接阻断启动
- 抠图透明度可用 `scripts/check_png_alpha.mjs` 校验 RGBA 通道

### 8.4 发布与打包约定

- **唯一打包入口**：必须通过 `scripts/build_release.ps1` 脚本打包，严禁手动 zip 压缩。
  - 完整包：`-PackageMode full`
  - 补丁包：无 `-PackageMode` 或仅包含业务代码更新。
- **启动脚本规范**：
  - Windows 启动脚本 `start_app.bat` **必须强制使用 CRLF 换行符**，否则 `cmd` 会发生命令截断。
  - 脚本内禁止静默启动 Node（如 `start /b`），必须在当前窗口前台运行并输出日志，出错时必须 `pause` 暴露 `ERRORLEVEL`。
- **发包前置校验**：必须通过 `npm run lint` 与 `npm run build`。

---

## 9. 当前架构边界

- 前端负责业务编排（绑定、规则计算、updates 构造），后端保持“执行器 + 持久化”角色
- Photoshop 链路是最终生产输出真理源，Puppeteer 仅用于辅助预览/切片
- 模板、任务模板、鉴权数据均以文件系统为主，不依赖外部数据库服务
- 周期清理与启动备份是稳定性兜底，不替代业务内即时清理
