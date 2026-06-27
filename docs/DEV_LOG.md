# 📜 Developer Journey Log
*Chronological record of development tasks, changes, and risk assessments.*

[2026-04-02] Task: 修复 PSD 自动填充导出长时间等待后“未生成输出文件” | Changes: 基于真实失败任务 `job_1775128998719.json` / `job_1775128998719.json.vbs.log` 确认 `run_job.vbs` 成功但 JSX 未产出任何 `result/.log/.fatal.log`，在 `server/services/photoshopIngest.js` 新增静默吞任务判定、结构化诊断、Windows 下 `Photoshop.exe` 强制重启后队列重试，并补充 `tests/photoshop_command_artifacts.test.mjs` 与架构/变更说明同步 | Risk: 中，自动重启仅在“VBS 成功但 JSX 完全无产物”这一窄条件触发，可恢复失联常驻实例，但会终止用户手工打开的 Photoshop 进程

[2026-04-02] Task: 修正 silent_noop_after_vbs_success 命中后未实际重试 | Changes: 基于新报错 `[1775131024978_551079]` 复盘发现 `runWithRetry` 仍受 `PS_EXPORT_MAX_RETRIES` 默认值 0 限制，导致虽然已经识别出静默吞任务，但不会执行 Photoshop 重启后的恢复重试；为此在 `server/services/photoshopIngest.js` 新增 `getRetryBudgetForPhotoshopError`，对 `silent_noop_after_vbs_success` 保底提供 1 次重试预算，并补充 `tests/photoshop_command_artifacts.test.mjs` 回归测试 | Risk: 低，只扩大静默吞任务这一窄场景的恢复预算，不影响普通导出错误的重试策略

[2026-04-02] Task: 修复 PSD 自动填充导出脚本被过早删除导致的静默空跑 | Changes: 定位到 `runPhotoshopCommand` 会在 `cscript` 返回后立刻执行 `prepared.cleanup()`，导致 `run_*.jsx` 在 Photoshop 实际消费前被删；已改为保留自包含运行脚本并交给导出元数据清理任务统一回收，同时补充调度摘要日志 `retainedRunJsxPath` 用于现场排查；同步更新 `docs/ARCHITECTURE.md` 与 `openspec/changes/2026-03-23-artboard-export-stability-hardening.md` 的脚本生命周期描述与实现一致 | Risk: 低，导出目录短期会多保留少量 `run_*.jsx` 文件，但已有清理任务回收，不影响导出正确性

[2026-04-02] Task: 实现画板命名规则升级与导出默认折叠 | Changes: `server/utils/templateMeta.js` 新增款号/色号解析规则，支持“天猫主图”画板仅替换中间款号段、纯“款号+色号”画板替换为上传文件解析出的款号+色号，并保持 `psId -> artboardRename` 映射稳定；`server/photoshop/render_export.jsx` 新增 `collapseAllArtboardGroups` 并在 single/batch/psd-bundle 导出前统一调用；同步更新 `tests/template_meta_artboard.test.js`、`tests/server-export-error.test.mjs`、`tests/artboard_export_stability.test.mjs` 回归断言 | Risk: 中，命名规则更严格后依赖上传文件名中存在可识别款号，若文件名不含规则码将回退旧命名分支

[2026-04-02] Task: 修复“导出后画板名未改变”根因（映射键错位） | Changes: 复盘发现 `buildArtboardRenameMap` 产出为 `psId -> 新画板名`，但 JSX `renameArtboardGroupByLayer` 仍按父组名称当 key 查映射，导致重命名始终 miss；已在 `server/photoshop/render_export.jsx` 改为优先使用 `psIdHint` 命中映射，并在 single/bundle 两处调用透传 `psId`；同步更新 `tests/server-export-error.test.mjs` 与 `tests/artboard_export_stability.test.mjs` 断言，防止再次回归 | Risk: 低，仅收敛重命名命中策略，不改变导出几何与图片替换流程

## 2026-03-20
- **Task**: Standardize Release Packaging and Debug `start_app.bat` Execution
- **Changes**: 
  - Fixed `start_app.bat` silent failure issue. Ensured CRLF line endings to prevent Windows `cmd` parsing errors ("not recognized as an internal or external command").
  - Modified `start_app.bat` to run the Node process in the foreground rather than via `start "" /b`, capturing the exit code and pausing on error so logs are visible to the user.
  - Updated `docs/发布包使用说明.md` to strictly document packaging norms: mandatory CRLF in bat files, visible logging, and specific valid packaging commands (`build_release.ps1` flags).
- **Risk**: Low. Improves debuggability on client environments.

## 2026-01-17
- **Task**: Refactor Temporary Template Cleanup Service
- **Changes**: 
  - Modified `server/services/cleanupService.js`: Switched from daily to hourly expiry (default 24h), added `deleteTemplate` method.
  - Updated `server/index.js`: Added `POST /api/cleanup/temporary-templates` endpoint and initialized hourly schedule.
  - Created `scripts/manual_cleanup.js` for manual maintenance.
- **Risk**: Low. Safe ID validation and `isUserSaved` manifest check prevent accidental deletion of user data.

## 2026-01-20
- **Task**: Split WorkbenchPage into User-End Only Mode
- **Changes**:
  - Removed Admin Logic: Deleted PSD upload (`handlePsdUpload`), template saving (`handleConfirmSave`), and related states (`psdFile`, `uploadProgress`).
  - Refactored Exports: Updated `handleExportByPhotoshop`, `_handleExport`, `_handleBatchExport` to depend on `templateId` (Slot-based) instead of `psdFile`.
  - UI Cleanup: Simplified header (removed save buttons), removed admin modals, fixed missing icons (`FolderPlus`).
  - **Fix**: Resolved `ReferenceError: selectedSlotId is not defined` in `WorkbenchPage.jsx` by adding missing state and enabling Slot selection UI.
- **Risk**: Low. Ensure backend `templateId` endpoints are robust.

## 2026-01-21
- **Task**: Align PSD ingest preview and template slot binding behavior with legacy project; clean up Slot terminology in UI
- **Changes**:
  - Updated `src/pages/WorkbenchPage.jsx`: Fixed Slot 绑定模式下 Excel 行预览逻辑，改为使用 `excelFieldKey` 字段驱动变量预览，确保与 `buildSlotUpdates` 导出协议一致；同时将「Slot 数据映射」文案替换为「商品位数据映射」并优化提示语。
  - Updated `src/pages/AdminPage.jsx`: 调整上传提示和模版列表说明，将「Slot 配置」相关文案统一为「模版配置 / 商品位配置」，避免用户端暴露内部术语。
  - Updated `src/pages/AdminSlotEditor.jsx`: 将侧边栏标题与商品位列表相关文案从「Slot 配置」改为「模版配置 / 商品位」，统一商品位命名（包含占位名称与删除确认文案）。
  - Updated `docs/ARCHITECTURE.md`: 将「Slot 配置扩展」章节重命名为「模版商品位配置扩展」，并说明商品位为原 Slot 概念，以保持文档与实现的一致性。
- **Risk**: Low. 逻辑改动仅影响商品位预览与 UI 文案，不改变后端导出协议；需在真实 PSD + Excel 场景下回归验证一行绑定多商品位的预览行为。

- **Task**: Fix admin canvas preview missing backdrop when only `images/reference_*.jpg` exists
- **Changes**:
  - Updated `server/services/slotConfigService.js`: 扩展 `buildImageUrl`，在缺少 `reference.png/backdrop.png` 时回退查找 `images/` 目录下以 `reference` 开头的 PNG/JPEG/WEBP 文件，优先选择按文件名排序后的第一个作为预览图 URL。
  - Updated `server/index.js`: 统一通过 `slotConfigService.buildImageUrl` 生成 `/api/templates` 与 `/api/template/:id` 的预览图字段，避免与磁盘目录结构（`images/reference_*.jpg`）不一致导致管理端画布一片空白。
  - Updated `src/pages/AdminSlotEditor.jsx`: 更新管理端画布的 `referenceImage` 传递逻辑，直接使用后端返回的相对预览路径（包含 `images/reference_*.jpg` 回退结果），避免在前端再次拼接基地址导致路径不一致。
  - Updated `docs/ARCHITECTURE.md`: 在「模版商品位配置扩展」中补充预览图回退策略说明，并明确管理端画布直接消费该相对 URL，使文档与实现保持一致。
- **Risk**: Low. 改动仅影响模版预览 URL 选择策略，不改变 PSD 解析与 Photoshop 导出链路；如 `images` 目录缺失或无匹配文件则仍安全返回 `null`。

- **Task**: Ensure AdminSlotEditor canvas always hits the correct render server for previews
- **Changes**:
  - Updated `src/pages/AdminSlotEditor.jsx`: 管理端画布在构造 `referenceImage` 时统一通过 `renderServerBaseUrl + previewUrl` 生成完整图片地址，保持与 `WorkbenchPage` 和 `AdminPage` 中模版预览图用法一致，避免在多机房/局域网环境下由于前端与渲染服务不在同源导致画布背景请求落到错误主机。
- **Risk**: Very Low. 仅影响预览图请求 URL，不改变 Slot 配置与导出协议；`VITE_RENDER_SERVER` 为空时仍然退化为相对路径 `/templates/...`，兼容本地 Vite 代理场景。

- **Task**: Verify AdminSlotEditor canvas pipeline for `images/reference_*.jpg` templates
- **Changes**:
  - 使用 `output/templates/771ef0766febe6d9`、`7da9ee2135a8cbf9`、`83411aa992ec8d50` 等真实模版目录，逐级核对 `manifest.json` 中变量坐标、`server/services/slotConfigService.buildImageUrl` 生成的 `imageUrl`、`server/index.js` `/api/templates` 与 `/api/template/:id` 返回的 `previewUrl/imageUrl` 字段，以及 `src/pages/AdminPage.jsx`、`src/pages/AdminSlotEditor.jsx` 中对这些字段的消费逻辑，确认当仅存在 `images/reference_*.jpg` 时，管理端模版列表与画布背景均能正确加载参考图，变量边框由 `CanvasLayer` 按坐标渲染。
  - 通过 `npm run lint` 回归校验前后端代码无语法与风格错误，确保之前对 Slot 配置与预览 URL 逻辑的改动未引入新的静态检查问题。
- **Risk**: None. 本次为链路级验证与文档记录，未新增逻辑分支；如后续再新增模版目录结构，仅需遵守 `output/templates/{id}` 约定并确保参考图文件位于该目录或其 `images` 子目录中即可被现有逻辑识别。

- **Task**: Roll back template preview selection to legacy single-image behavior
- **Changes**:
  - Updated `server/services/slotConfigService.js`: 将 `buildImageUrl` 逻辑收紧为仅在模版目录下查找 `reference.png` 或 `backdrop.png`，不再从 `images/` 子目录中回退选择多视图文件，保持与旧项目一致的一张完整 PSD 预览图行为。
  - Updated `src/pages/AdminSlotEditor.jsx`: 管理端画布的 `referenceImage` 改为直接消费后端返回的相对预览路径（`/templates/{id}/reference.png|backdrop.png`），不再额外拼接 `renderServerBaseUrl`，避免与 Vite 代理及旧项目行为不一致导致画布空白或跨域问题。
  - Verified `docs/ARCHITECTURE.md`: 「模版商品位配置扩展」章节已经描述为仅使用 `reference.png/backdrop.png` 作为预览图来源，与当前实现保持一致，无需额外修改。
- **Risk**: Low. 预览回退策略由「多视图容错」收紧为「单视图确定性」后，若模版目录缺少 `reference.png/backdrop.png` 将不会自动兜底到 `images/` 目录，需要通过重新入库 PSD 或补齐参考图文件来修复，但避免了多视图尺寸不一致导致的画布变形问题。

- **[2026-01-21] Task**: 对齐 AdminSlotEditor 与 WorkbenchPage 的画布渲染逻辑，修复管理端画布变形
- **Changes**:
  - Updated `src/pages/AdminSlotEditor.jsx`: 将管理端画布由 `CanvasLayer` 替换为与用户端一致的 `TemplateCanvas`，背景图通过 `imageUrl` 字段传入 `backgroundImage`，并沿用统一的宽高与缩放计算逻辑，保证同一模板在管理端与工作台的背景与变量坐标严格一致，不再出现一端正常、一端变形的问题。
  - Updated `src/pages/AdminSlotEditor.jsx`: 读取模板详情时优先使用 `renderServerBaseUrl + imageUrl` 作为预览地址，并在加载原始图片尺寸后根据 `scaleX/scaleY` 对 `width/height` 与变量坐标进行等比修正，仅当预览图与 PSD 尺寸确实存在一致的整体缩放时才调整，避免误判导致的拉伸。
  - Verified `src/components/TemplateCanvas.jsx`: 复用现有「内容为基准、视口自适应缩放」的实现，包括 `computeFitScale` 和 `TransformWrapper` 行为，确认管理端不再单独维护一套缩放/平移逻辑，减少后续维护成本和视觉偏差来源。
- **Risk**: Very Low. 本次仅在前端替换画布组件与预览 URL 构造方式，导出协议与后端接口保持不变；若后续调整 `TemplateCanvas` 行为，将同时影响用户端与管理端画布，需要一并回归两条链路的渲染与导出结果。

- **[2026-01-21] Task**: 恢复兼容 `images/reference_*.jpg` 预览回退并统一前后台缩放逻辑
- **Changes**:
  - Updated `server/services/slotConfigService.js`: 重新扩展 `buildImageUrl`，在缺少 `reference.png/backdrop.png` 时回退遍历 `output/templates/{id}/images` 目录，优先选择以 `reference` 开头的 `.png/.jpg/.jpeg/.webp` 文件，其次按文件名排序取第一张，保证既兼容旧项目生成的 `images/reference_*.jpg` 目录结构，又维持单一预览图的确定性行为。
  - Updated `src/pages/WorkbenchPage.jsx`: 在加载模板详情时与管理端相同，先按 `frontendConfig`/`manifest` 的尺寸与变量恢复状态，再基于真实预览图尺寸计算 `scaleX/scaleY`，在确认为等比缩放的前提下同步修正 `width/height`、变量坐标与 `sliceLines`，避免仅在工作台侧出现画布变形或切片线错位。
  - Updated `docs/ARCHITECTURE.md`: 更新「模版商品位配置扩展」中关于预览图选择策略的描述，明确 `slotConfigService.buildImageUrl` 的优先级链路为 `reference.png` → `backdrop.png` → `images/reference*.{png|jpg|jpeg|webp}` → 其它图片文件的字母序首个，使文档重新成为预览图生成逻辑的单一事实源。
- **Risk**: Low. 回退策略仅在缺失标准 `reference.png/backdrop.png` 时生效，对已按新链路入库的模版无行为变更；旧目录若存在多张尺寸不同的预览图，也会通过前端按真实图片尺寸统一缩放变量与切片线，避免再次出现坐标错位或画布拉伸的问题。

## 2026-01-21 (Later)
- **Task**: 修复 AdminSlotEditor 画布纵向严重变形并对齐旧项目行为
- **Changes**:
  - Updated `src/pages/AdminSlotEditor.jsx`: 在加载模板详情时引入 `baseWidth/baseHeight`，优先使用 `frontendConfig.width/height` 或 `manifest` 中的宽高作为变量坐标的原始坐标系，再基于真实预览图尺寸计算 `scaleX/scaleY`，无论是否等比缩放都统一将画布宽高设置为图片的 `naturalWidth/naturalHeight`，并按这两个缩放因子批量修正变量的 `x/y/width/height`，避免因 `manifest.height` 过大导致背景被拉伸而变量坐标仍按旧高度渲染。
  - Verified 管理端真实界面: 通过本地运行 `npm run dev` 打开 `http://localhost:5174/admin`，选中仅包含 `images/reference_01.jpg` 预览图的真实模板（如 `73be1a34dd745c59`），使用浏览器开发者工具检查 `template-background` 图片的 `clientWidth/clientHeight` 与 `naturalWidth/naturalHeight` 均为 `1000 x 1740`，确认渲染宽高与原图一致，画布不再出现纵向拉伸，文本变量和 `{img:...}` 占位符与背景底图对齐。
  - Verified 静态检查: 在 `psd-to-ecommerce-new` 根目录执行 `npm run lint`，确认本次前端逻辑调整未引入新的 ESLint 错误或类型/语法问题。
- **Risk**: Medium. 变量坐标与切片线现在严格依赖 `manifest`/`frontendConfig` 中的宽高作为原始基准，并与预览图实际尺寸做一次性缩放；如果未来导入的模板出现「变量是按裁剪图尺寸标注，但 `manifest` 仍为完整 PSD 尺寸」这类数据不一致情况，可能导致坐标缩放两次，需要在后续接入端到端模板验证与更精细的尺寸来源元数据时一并回归。

## 2026-01-21 (Ghost Buster)
- **Task**: 恢复 PSD 幽灵图层 MAD 过滤逻辑，与旧项目保持一致
- **Changes**:
  - Updated `src/config/layerRules.js`: 将 `LAYER_FILTER_RULES.FLAGS.ENABLE_MAD_FILTER` 从 `false` 调整为 `true`，重新启用基于像素均值绝对偏差 (MAD) 的纯色占位层过滤逻辑，使命名命中 `color/copy/拷贝/备份` 且非白名单的嫌疑图层在被判定为极度均匀时标记为 `isGhost` 并从变量与候选列表中剔除，恢复旧项目中对「纯色占位块」的可靠清洗效果。
  - Verified `tests/ghost_buster_verify.js`: 通过 `node ./tests/ghost_buster_verify.js` 验证典型用例：`{img:color03_正_拷贝_2}`、`{img:color01_正_拷贝_2}` 这类纯色占位层被正确标记为 `DROPPED`，而 `sunglasses copy` 与 `商品主图 copy` 等包含产品关键词或具有噪点纹理的图层保持 `KEEP`，确认启用 MAD 过滤后仍符合设计的白名单与噪点保护策略。
- **Risk**: Low-Medium. 对命中嫌疑命名且图像内容接近纯色的图层会更激进地清理；在极端设计稿中，如果设计师刻意用「color/copy/拷贝」命名真实产品图且图像本身几乎无纹理，可能被标记为幽灵图层被过滤，此时可通过调整图层命名或将关键图层命名为包含 `产品/goods/item/sunglass/眼镜` 等白名单关键词来避免误杀。

## 2026-01-21 (AdminSlotEditor Canvas Fix)
- **Task**: 修复 AdminSlotEditor 管理端画布纵向压缩与变量错位问题
- **Changes**:
  - Updated `src/pages/AdminSlotEditor.jsx`: 在加载模板详情的 `loadData` 中新增 `psdAppliedRef` 标记，区分「仅依赖后端预览图尺寸」与「已经成功应用前端 psdParser 结果」两种分支，当 PSD 解析成功时强制使用 `result.width/result.height` 覆盖 `canvasWidth/canvasHeight`，并将 `scaleX/scaleY` 重置为 `1`，避免先按后端裁剪图尺寸缩放变量、再用完整 PSD 画布渲染背景导致的纵向压扁。
  - Updated `src/pages/AdminSlotEditor.jsx`: 在批量缩放变量坐标与宽高前增加 `!psdAppliedRef.current` 判断，仅当当前模板仍处于「预览图等比缩放修正」模式时才对变量执行乘法缩放；一旦前端 PSD 解析已生效，则保持变量 `x/y/width/height` 为原始 PSD 坐标系，确保与 `TemplateCanvas` 中的背景画布尺寸严格一致。
  - Updated `src/pages/AdminSlotEditor.jsx`: 通过 `extractTemplateFromPsd` 结果构造 `variablesWithHidden`，将缺失的 `hidden` 字段归一为布尔值，配合 `TemplateCanvas` 内部的 `variables.filter(v => !v.hidden)` 逻辑，在管理端自动隐藏 MAD 判定的幽灵图层与空白图片层，减少「漫天飞的图层」干扰。
- **Risk**: Low-Medium. 本次调整使管理端画布在 PSD 解析成功时完全以前端 psdParser 的宽高与坐标为单一真理源；如果后端未来引入与 PSD 画布尺寸不一致的裁剪预览图，将不再对管理端变量进行二次缩放修正，需要通过补齐 `frontendConfig` 或统一 ingest 流程来解决尺寸来源不一致的问题。

## 2026-01-21 (Workbench Canvas Fix)
- **Task**: 对齐普通用户端 Workbench 画布比例与管理端 AdminSlotEditor 行为
- **Changes**:
  - Updated `src/pages/WorkbenchPage.jsx`: 将 `handleLoadTemplate` 重写为与 `AdminSlotEditor.loadData` 同源的加载流程，先从 `/api/template/:id` 读取 `frontendConfig/manifest` 的基础宽高，再通过 `imageUrl` 计算真实预览图尺寸与 `scaleX/scaleY`，统一用预览图的 `naturalWidth/naturalHeight` 作为画布宽高，避免仅工作台侧将背景强行压进 `790x1300` 导致比例失真。
  - Updated `src/pages/WorkbenchPage.jsx`: 新增对 `/templates/{id}/source.psd` 的前端解析，复用 `PSDParser` 与 `extractTemplateFromPsd`，在 PSD 解析成功时以 `result.width/result.height` 和解析出的变量列表作为单一真理源，覆盖基于预览图的缩放，使 Workbench 与 Admin 在 PSD 存在时看到完全一致的画布尺寸与变量坐标。
  - Updated `src/pages/WorkbenchPage.jsx`: 在 PSD 解析失败且仅能依赖预览图时，沿用旧有逻辑在确认等比缩放后按 `scaleY` 同步放大变量坐标与 `sliceLines`，避免切片线与背景发生相对错位；同时保留原有的 `frontendConfig.variables` 回退路径，兼容已有模版配置。
  - Verified 静态检查: 在 `psd-to-ecommerce-new` 根目录执行 `npm run lint`，确认本次 Workbench 侧前端逻辑调整未引入新的 ESLint 错误或语法问题。
- **Risk**: Medium. 普通端首次引入前端 PSD 解析链路，若模板目录缺失 `source.psd` 将回退到仅基于 `frontendConfig/manifest` + 预览图的缩放逻辑，此时仍可能受历史数据（错误的 `width/height`）影响；后续接入端到端模版校验与模板健康检查时需要一并暴露「缺失 PSD/预览图尺寸不一致」等异常，避免运营在问题模板上长时间工作。

## 2026-01-21 (Workbench PSD Preview Alignment)
- **Task**: 让普通用户端 Workbench 与 AdminSlotEditor 一样使用 PSD 渲染出的底图，而不是直接消费后端 `imageUrl`，彻底消除两端底图比例不一致的问题
- **Changes**:
  - Updated `src/pages/WorkbenchPage.jsx`: 新增 `canvasToObjectUrl` 辅助函数，复用管理端 `AdminSlotEditor` 中的实现逻辑，优先通过 `canvas.convertToBlob`/`canvas.toBlob` 生成 PNG Blob，并在必要时回退到 `PSDParser.canvasToDataURL`，保证 Workbench 也能从前端渲染出的 PSD 画布生成预览图。
  - Updated `src/pages/WorkbenchPage.jsx`: 在成功解析 `/templates/{id}/source.psd` 且 `result.canvas` 存在时，不再直接使用后端返回的 `imageUrl`，而是调用 `canvasToObjectUrl(result.canvas, parser)` 生成前端预览 URL，将其写回 `bgUrl`，并在随后统一通过 `setBackgroundImage(bgUrl)` 传入 `HudEditor/CanvasLayer`，使用户端底图与 PSD 画布像素维度完全一致。
  - Updated `src/pages/WorkbenchPage.jsx`: 调整 `backgroundObjectUrlRef` 的管理逻辑，在每次更新 `bgUrl` 时优先释放旧的 `blob:` URL，仅当新地址为 `blob:` 时才写入 Ref，避免内存泄漏，同时支持后续模版切换时安全回收对象 URL。
- **Risk**: Low. 本次改动仅影响用户端 Workbench 底图来源与内存管理逻辑，导出协议与后端接口保持不变；若模板目录缺失 `source.psd`，仍会回退到旧的 `imageUrl` 预览路径，此时行为与此前版本一致。

## 2026-01-21 (Docs Alignment)
- **Task**: 同步 ARCHITECTURE.md 中前后端画布渲染与预览图职责描述，使其与当前 AdminSlotEditor 与 Workbench 实际行为保持一致
- **Changes**:
  - Updated `docs/ARCHITECTURE.md`: 在「1.1 系统分层」中补充说明管理端与用户端画布均以前端 `psdParser` 解析结果作为单一真理源，在存在 `source.psd` 时统一使用 PSD 渲染出的底图和变量坐标，后端 `imageUrl/previewUrl` 只用于模版列表缩略图或缺失 PSD 时的回退参考图。
  - Updated `docs/ARCHITECTURE.md`: 在「4.3 模版商品位配置扩展」中收紧 `slotConfigService.buildImageUrl` 的职责范围，明确其仅负责选择单一预览图并通过 `imageUrl/previewUrl` 对外暴露，管理端与工作台的画布在 PSD 存在且解析成功的情况下不再直接消费该 URL 作为背景，而是优先使用前端生成的 Canvas 结果。
- **Risk**: None. 本次仅为文档同步更新，不包含任何代码逻辑改动；后续如再调整画布渲染链路时，应优先更新实现并立即回写到 ARCHITECTURE.md，确保其持续作为唯一技术真理源。

[2026-01-22] Task: 修复管理端画布圈选起始区域与多选触发 | Changes: 调整 TemplateCanvas 圈选拖拽容器为完整画布区域并允许从变量内部起拖拽，以提升缩放后的圈选命中与可用范围 | Risk: Low. 仅影响管理端圈选交互，不触及导出与模板数据结构。
[2026-01-22] Task: 用户端工作台改为只读变量并增加Excel字段校验 | Changes: 移除用户端变量编辑/删除入口与字段管理删除入口，Excel 上传时校验字段与模板配置一致并提示缺失/多余字段 | Risk: Low. 仅收紧用户端操作范围，导出与后端接口不变。
[2026-01-23] Task: 修复隐藏图层过滤与管理端变量列表溢出 | Changes: 前端 psdParser 将 `visible:false` 视为隐藏并在递归阶段剔除，确保隐藏图层不会污染变量/候选列表；管理端 AdminSlotEditor 为关键 flex 容器补齐 `min-h-0`，使变量列表稳定在面板内滚动不再跑出屏幕 | Risk: Low. 仅修正前端解析可见性与布局约束，不改动导出协议与后端链路。
[2026-03-12] Task: PSD自动填充支持产品图库上传与按款号色号角度自动匹配 | Changes: 后端上传产品图接口增加 publicUrl 字段；用户端新增产品图库上传区与“自动匹配图片”，按款号/色号/正侧45 匹配并写回图片变量（同时保留 imagePath 供导出用） | Risk: Low. 不改导出协议，仅新增辅助字段与前端回填逻辑，冲突/缺失会提示且不自动误替换。
[2026-03-12] Task: 优化管理端登录与首次改密体验 | Changes: 登录弹窗在未登录/需改密时不可关闭，移除取消入口；首次改密文案重写并增加“确认新密码”与本地校验提示，避免困惑与误操作 | Risk: Low. 仅前端交互与校验增强，不改变服务端鉴权与密码规则。
[2026-03-12] Task: 修复PSD自动填充表格空白、自动匹配与布局高度 | Changes: DataConsole 取消固定 max-height 以消除底部大空白；商品位回填时自动按款号/色号/角度匹配产品图，并在上传图库后自动触发一次匹配；画布与右侧面板高度改为随视口自适应以缓解挤压变形 | Risk: Low. 仅前端布局与回填逻辑调整，匹配会跳过用户手动上传的 dataURL 图片以避免覆盖。
[2026-03-12] Task: 深挖自动匹配未回填根因并修复右侧挤压 | Changes: 确认根因是图片变量角度识别仅依赖“正/侧/45”关键词导致“主视图/侧视图/斜45”无法命中；扩展 `pickAngle` 别名识别并在匹配流程增加结构化诊断日志（reasonCounts/缺失角度样本/缺失款色样本）；右侧“当前模版”卡片压缩高度并调整工具栏列高度与间距降低上传后挤压 | Risk: Low-Medium. 角度别名扩展会改变少量历史模板的自动命中结果，但保留冲突检测避免误替换。
[2026-03-12] Task: 修复“手动点匹配仍不回填”的阻断条件 | Changes: 将“跳过本地图片”从 `value 是 dataURL` 改为仅在变量显式标记 `manualImageValue=true` 时才跳过；手动点“自动匹配图片”时强制覆盖手动锁定图并输出 no-match 详细日志（含 catalog 预览与样本），避免默认模板 dataURL 被误判为手动覆盖源 | Risk: Medium. 手动触发匹配会覆盖用户之前手工替换的图片，需依赖按钮语义与提示避免误操作。
[2026-03-12] Task: 精简PSD自动填充右侧布局并合并模版信息区域 | Changes: 移除右侧“当前模版”卡片并将模板名称/尺寸/商品位/切换入口整合到画布预览顶部；产品图库标题去文案只保留图标并压缩按钮避免换行；商品位绑定卡片与列表高度进一步压缩以降低下方挤压变形 | Risk: Low. 仅前端布局与文案层级调整，不改变匹配逻辑与导出协议。
[2026-03-12] Task: 数据控制台扩容并改为“指定商品位后再回填” | Changes: 底部数据控制台高度提升到 `h-[78vh] min-h-[780px]` 以保障可见行数；字段标签区改为限高滚动；表格滚动改为基于行索引 + requestAnimationFrame 节流，减少每像素重渲染卡顿；移除“选中记录即自动绑定”与“模板加载后自动分配行”，改为仅在用户点击指定商品位后触发回填 | Risk: Medium. 行为从自动分配改为手动绑定，旧使用习惯可能需要适配，但可显著降低误绑定。
[2026-03-10] Task: 修复合并PSD在多图/多格式场景下“错乱”观感 | Changes: 合并PSD默认隐藏被替换的原图层，并且仅显示第一张产品图对应的智能对象副本，避免多张产品图叠加导致打开即错乱；保持 PNG/JPG 导出链路独立 | Risk: Low. 仅影响合并PSD的默认可见性，不影响单张导出与对齐算法。
[2026-03-10] Task: 修复批量导出 PNG 无法下载与打包数量异常 | Changes: 下载与打包改为对多候选后端地址做容错解析，避免走到前端源站导致拿到 HTML/404；打包统计不再依赖行级状态，按每个格式成功项计数 | Risk: Low. 仅影响下载/打包的客户端行为，不改变导出产物与服务端落盘。
[2026-03-06] Task: 批量生成支持按PSD模板独立导出格式 | Changes: 批量生成页支持每个PSD单独勾选 PNG/JPG/PSD 并按文件名包含 PNG 自动默认勾选；任务模板 items 持久化 exportFormats 并在任务模板生成链路应用；管理端任务模板保存同步 exportFormats | Risk: Low-Medium. 旧任务模板缺失 exportFormats 时会按兼容默认（PNG+JPG+PSD）运行，可能产生额外导出物，需回归关键模板。
[2026-01-23] Task: 统一工作台与管理端画布变量堆叠顺序 | Changes: 抽取 `stableSortByZIndex` 并在 TemplateCanvas/CanvasLayer/候选变量合并中复用，`zIndex` 缺失时按原始顺序回退，避免图片遮挡文字 | Risk: Low. 仅影响前端画布渲染顺序，不改动 PSD 解析与导出协议。
[2026-01-23] Task: 修复候选变量合并导致的图层遮挡 | Changes: `buildVariablesFromCandidates` 按 `zIndex` 升序合并与排序 text/img 候选，保持画布堆叠顺序与 PSD 一致，避免图片变量覆盖文字变量 | Risk: Low. 仅调整候选变量列表顺序，不改变过滤/解析规则与导出协议。
[2026-01-23] Task: 修复用户端画布热点层级遮挡 | Changes: `CanvasLayer` 渲染热点时按 `zIndex` 排序并写入 `style.zIndex`，移除固定 `z-10`，确保替换图片/文字的堆叠顺序与 PSD 一致，避免眼镜图遮住编号文字 | Risk: Low. 仅影响用户端画布覆盖层顺序，不改动解析与导出链路。
[2026-01-23] Task: 修复幽灵图层在画布图层树仍可见的问题 | Changes: 前端 psdParser 在图片数据提取失败的降级分支中，若判定为嫌疑占位层则同时标记 `isGhost/isWhiteOrTransparent` 并禁止进入解析输出 `layers` 列表，避免 `IMGcolor01_正_拷贝_2` 等无用图层进入画布渲染链路；文档同步更新 Ghost Busting 的“剔除 layers 输出”约束 | Risk: Low-Medium. 仅收紧“提取失败+命中嫌疑命名”的保留策略；若存在真实业务图层被错误命名为嫌疑词且又无法提取像素数据，会从画布图层树中消失，需要通过命名白名单或修复资源缺失来规避。
[2026-01-23] Task: 修复背景候选识别 50% 面积边界并完成真实界面自验 | Changes: 将背景候选判定从 `> 0.5` 调整为 `>= 0.5`（恰好占 50% 画布的图片层也视为背景，避免误入候选变量）；在浏览器中验证管理端变量列表在桌面/小屏尺寸下均保持容器内滚动（`overflow-y:auto` 且 `clientHeight < scrollHeight`） | Risk: Low. 仅影响“无变量标记时的候选推断”与管理端布局约束，不触及导出协议。
[2026-01-23] Task: 管理端变量列表优先使用前端 PSD 解析结果 | Changes: 在 AdminSlotEditor 加载时始终以前端 psdParser 解析的变量作为主来源，并仅在 PSD 缺失时回退到保存变量；对保存变量按 id 进行最小合并以保留 hidden/value 状态，从而过滤半透明色块等幽灵图层 | Risk: Medium. 如果历史保存的变量 id 与前端解析 id 不一致，列表将只展示前端解析到的变量，需要重建对应的商品位变量映射。
[2026-01-23] Task: 管理端布局与幽灵图层过滤增强 | Changes: 管理端画布区域改为小屏堆叠与可收缩布局以避免变量列表越界；新增嫌疑图层低不透明度阈值并用于前端 PSD 解析过滤半透明色块 | Risk: Medium. 嫌疑图层在低不透明度下将被更积极地过滤，需确认未误伤确有意义的低透明素材。
[2026-01-23] Task: 修复背景图层识别边界并对齐幽灵图层自测 | Changes: 将候选变量生成中的“背景图层”判定从面积占比 > 50% 调整为 >= 50%，避免恰好半屏的大图被误识别为可编辑图片候选；更新 ghost_buster_verify.js 直接复用 psdParser + layerRules 作为自测基准并新增一例“嫌疑但有纹理”样本 | Risk: Low. 仅影响无显式变量标签时的候选列表过滤与测试脚本，不影响导出协议。
[2026-01-23] Task: 修复白底产品图被误判为幽灵图层 | Changes: 调整 psdParser 的 Uniformity(MAD) 采样策略，忽略纯白背景并新增 `UNIFORM_MIN_NON_WHITE_RATIO`，仅当非白像素采样占比足够且 MAD 低于阈值时才判为纯色占位层；更新 ghost_buster_verify.js 增加“白底稀疏主体”用例防回归 | Risk: Low-Medium. 对嫌疑命名且主体占比极小的白底图片会更倾向保留，可能降低对少量极端占位层的清理力度。
[2026-01-23] Task: 对齐幽灵图层过滤到老项目并修复误杀 | Changes: 移除嫌疑图层基于低不透明度的直接丢弃规则，恢复 Uniformity(MAD) 采样逻辑与老项目一致；同步 `layerRules.js` 与 `ARCHITECTURE.md` 中相关字段与描述，避免配置漂移导致误判 | Risk: Low. 仅影响命中嫌疑命名的图层过滤路径，真实纹理图片更不易被误杀。
[2026-01-23] Task: 修复变量画布渲染层级与 PSD 不一致 | Changes: 变量提取阶段透传 psdParser 生成的 `zIndex`，TemplateCanvas 按 `zIndex` 渲染变量，避免图片变量遮挡文字变量（如产品编号） | Risk: Low. 仅影响画布预览层级，不修改 PSD 解析过滤与导出协议。
[2026-01-23] Task: 发布 v1.5 并同步 Git（过滤大文件） | Changes: 更新 `psd-to-ecommerce-new/package.json` 版本号为 1.5；补齐根目录与子项目 `.gitignore` 的 PSD/字体/输出目录过滤并新增 `.vite/` 忽略，清理已被暂存的缓存文件后再提交 | Risk: Low. 仅影响版本元信息与 Git 过滤规则，不影响运行时逻辑。
[2026-03-03] Task: 恢复后端认证与导出链路 | Changes: 合并管理员鉴权与动态 CORS、安全头；恢复模板预览补全、变量图导出与批量 PSD 合并；photoshopIngest 回滚至备份版本并补齐 slot-config align 校验 | Risk: Medium. 涉及后端接口与导出链路变更，需要回归导出与管理端操作。
[2026-03-04] Task: 修复任务模板导出不可用与 PNG 结果未合并 | Changes: 前端批量生成在任务模板模式下按“分组”生成 PNG 结果并与 PSD/JPEG/PSD 导出行统一键（psdId+imgId）；单变量场景修正 groupId 与 imageId 不一致导致 PNG 单独成列表；导出前按模板变量类型过滤 selectedPsIds/guidePicks 并在模板信息未加载或报错时阻断导出；API 客户端补齐非 JSON 响应提示并在疑似 Vite 代理 5xx 时自动回退到 3001 | Risk: Medium. 变更涉及导出与抠图请求构造，需回归单变量与多变量分组两种任务模板导出。
[2026-03-04] Task: 补齐管理端 PSD 拖拽上传交互 | Changes: AdminPage「上传 PSD 模版」卡片新增拖拽高亮与松开上传；AdminTaskTemplateTab 统一拖拽事件 stopPropagation 并补齐 dragOver 高亮与文案一致 | Risk: Low. 仅影响管理端上传交互，不触及解析与导出协议。
[2026-03-04] Task: 恢复模版配置页选中联动与参考线绑定 | Changes: AdminSlotEditor 选中变量后自动滚动并闪动定位到左侧商品位行与右侧变量行；接入 PSD 原生 guides/参考线图层解析并在绑定模式下复用 HudEditor guidePicker 绑定图片变量左右参考线，绑定结果写入 manifest.frontendConfig.guidePicks | Risk: Low-Medium. 增加一次前端 PSD 解析用于提取参考线，需关注大 PSD 的性能；绑定数据落盘不影响导出协议但依赖用户端后续消费 guidePicks。
[2026-03-05] Task: 自动填充导出 PSD 2GB 限制修复 | Changes: PSD 保存失败自动降级导出 PSB；若 Photoshop 不支持 PSB 则导出“扁平化 PSD”（单图层）兜底；后端以 result.json 为准返回真实输出 URL/formatUsed/warnings，并对输出路径做安全校验；前端下载文件名与实际扩展名一致并提示降级 | Risk: Medium. 大文件导出耗时与磁盘占用增加；扁平化兜底会丢失图层结构，需在 UI 明示并建议升级 Photoshop。
[2026-03-06] Task: 修复文字变量替换后水平位置偏移 | Changes: Photoshop 导出脚本在写入文本后按更新协议的对齐方式，将文字图层 bounds 对齐回更新前矩形（左/中/右）以保持填充稳定；更新 scriptBuild 标识便于链路确认 | Risk: Low. 仅影响文本更新后的水平位移，对图片替换与保存逻辑无影响。
[2026-03-06] Task: 管理端支持 Ctrl 多选图片变量批量绑定参考线 | Changes: 画布热点点击透传鼠标事件并在管理端按 Ctrl/Command 切换多选集合；绑定模式下沿用已有批量写入逻辑，将同一对参考线一次性应用到所有选中图片变量 | Risk: Low. 仅影响管理端选中交互，不影响导出协议与运行时渲染。
[2026-03-06] Task: 修复管理端非绑定模式下参考线不可见 | Changes: TemplateCanvas 增加参考线渲染能力并在管理端画布常规模式透传 guides/guideLayers，使“参考线：开”在非绑定模式也可直接查看 | Risk: Low. 仅为可视化增强，不改变参考线数据来源与保存格式。
[2026-03-06] Task: 优化参考线绑定多选的选中态表现 | Changes: 绑定模式画布对除当前活动变量外的其它选中图片变量显示高亮边框，避免“已选 N 个”但视觉只剩 1 个的误解 | Risk: Very Low. 仅影响管理端绑定模式的高亮显示。
[2026-03-06] Task: 阻止同图多层且参考线不同的导出串改 | Changes: 后端在规范化图片 updates 时检测“同一输入图片被用于多个 psId 但 guidePick/参考线绑定不一致”的情况并直接拒绝导出，避免不同位置对齐参数混用导致串层与错位 | Risk: Low. 可能会阻止少量“刻意复用同图”的导出，但能显著降低误操作风险。
[2026-03-06] Task: 批量导出一键打包按平台归类 | Changes: 新增 exportZipLayout 纯函数工具，按 PSD 模板名识别平台并在 JSZip 打包时生成平台/格式/型号色号目录结构；唯品会按 1-3/30/50 模板重命名 1/2/3/30/50.jpg 并跳过非 45 角 | Risk: Low-Medium. 若用户文件名不包含平台/型号色号/角度关键字会回退到兜底目录或跳过部分文件，需通过命名规范或 UI 提示规避。
[2026-03-07] Task: 任务模板保留原始PSD文件名用于平台识别 | Changes: ingest 时在 manifest 写入 originalPsdName；/api/template/:id/config 透出 originalPsdName；任务模板保存时把各 templateId 的 originalPsdName 冗余进 items；批量导出打包按 originalPsdName 识别平台 | Risk: Low. 老模板缺少 originalPsdName 时会回退到原 manifest.name 的 .psd 值或继续使用兜底目录。
[2026-03-11] Task: 京东/天猫导出物打包去掉最末级“款号+色号”目录 | Changes: `src/utils/exportZipLayout.js` 调整京东/天猫 PNG 与 JPG 的 zip 内路径，不再插入 `型号 色号` 子目录，改为直接放入 `平台/PNG产品图/` 与 `平台/PC|App/`；同步更新 `src/utils/exportZipLayout.test.mjs`、`tests/exportZipLayout.test.mjs` | Risk: Medium. 目录更扁平后更易出现同名文件；当前打包逻辑会对重复路径做去重后缀，避免覆盖但可读性可能下降。
[2026-03-11] Task: 调整唯品会1-3导出 JPG 重命名映射 | Changes: `src/utils/exportZipLayout.js` 将 1-3 模板的角度映射改为 45→1.jpg、正→2.jpg、侧→3.jpg；同步更新 `src/utils/exportZipLayout.test.mjs`、`tests/exportZipLayout.test.mjs` 覆盖三角度用例 | Risk: Low. 仅影响唯品会1-3模板的 JPG 命名规则，跳过逻辑保持不变。
[2026-03-11] Task: 天猫 PNG 打包仅保留 45 度 | Changes: `src/utils/exportZipLayout.js` 对天猫 PNG 打包增加角度过滤（仅 angle=45 的条目进入 zip，其余 skip）；同步更新 `src/utils/exportZipLayout.test.mjs`、`tests/exportZipLayout.test.mjs` | Risk: Low-Medium. 如果文件名缺失角度关键字将被视为非 45 并被跳过，需确保命名规范。
[2026-03-11] Task: 管理端上传 PSD 后自动进入配置并置顶新模板 | Changes: `src/pages/AdminPage.jsx` 上传成功后把新模板条目插入列表头部并设置 editingTemplateId 直接进入配置页；模板列表按 savedAt 倒序排序 | Risk: Low. 仅影响管理端列表排序与上传后的导航体验。
[2026-03-11] Task: 天猫白底800 JPG 单独分组并只保留45度 | Changes: `src/utils/exportZipLayout.js` 增加天猫 JPG 的特殊规则：PSD 名包含“白底800”时仅打包 45 度并写入 `天猫/白底800/`；同步更新 zip 路径测试用例 | Risk: Low-Medium. 依赖文件名角度关键字识别，命名不规范会导致条目被跳过。
[2026-03-11] Task: 唯品会30模板PNG仅保留45度并重命名为30.PNG | Changes: `src/utils/exportZipLayout.js` 扩展唯品会30规则到 PNG：仅打包 45 度并强制输出 `唯品会/<型号 色号>/30.PNG`；同步更新 `src/utils/exportZipLayout.test.mjs`、`tests/exportZipLayout.test.mjs` | Risk: Low-Medium. 依赖角度关键字识别，缺失角度信息会被跳过。
[2026-03-11] Task: 支持替换模板源PSD并迁移自动填充配置 | Changes: 新增 `POST /api/template/:id/replace-psd`，使用迁移算法将旧 slot-config 的字段映射与规则迁移到新 PSD 变量；管理端 `AdminSlotEditor` 增加“替换PSD”入口并展示迁移报告；新增迁移算法与测试 | Risk: Medium. 弱匹配策略（几何/名称）可能发生误匹配，需结合迁移报告人工复核未匹配/冲突项。
[2026-03-11] Task: 用户端Excel字段不一致不阻断且不白屏 | Changes: `src/utils/excelParser.js` 将字段不一致改为记录校验结果而非抛错；`src/components/DataConsole.jsx` 捕获上传异常并在界面显著提示字段差异；`src/store/dataStore.js` 增加 `excelHeaderCheck` 状态；新增测试 `tests/excelParserHeaderCheck.test.mjs` | Risk: Low. 仅放宽校验与增加提示，不影响正常导出逻辑。
[2026-03-12] Task: 支持发布包覆盖升级并无缝继承已有配置 | Changes: `server/index.js` 支持 `FDESIGN_DATA_DIR/FDESIGN_OUTPUT_DIR` 重定向数据根目录并在首次启用时从旧 `output/` 自动拷贝迁移；新增 `scripts/upgrade_in_place.ps1` 用于“保留 output/ 目录”的覆盖升级；更新运行说明与 `docs/ARCHITECTURE.md` | Risk: Low-Medium. 若 `FDESIGN_DATA_DIR` 指向无权限目录会导致启动失败或无法落盘，需要在部署侧固定到可写路径。
[2026-03-12] Task: 批量导出打包按体积/数量自动分卷并可配置 | Changes: `src/pages/Workbench/BatchProductImageTab.jsx` 增加“打包设置”（自动/尽量单包/自定义阈值），打包逻辑从固定每100个拆分改为按“每卷最大文件数 + 每卷最大体积MB”动态分卷，并引入硬上限保护避免大 PSD 导致浏览器卡死；设置持久化到 localStorage | Risk: Medium. 浏览器端 ZIP 仍受内存与单文件体积影响，超大 PSD/PSB 可能仍会触发卡顿，建议用自动或合理阈值。
[2026-03-12] Task: 导出临时文件自动清理，防止 templates 目录膨胀 | Changes: 后端导出完成后自动清理 `output/templates/{id}/inputs` 下本次导出生成的对齐/抠图/调试临时文件；`CleanupService` 每小时清理 `inputs/` 过期残留与 `exports/` 过期 job/result/log 元数据（保留时长可配置） | Risk: Low. 默认不删除导出产物，仅回收临时文件与元数据。
[2026-03-13] Task: 修复 PSD 自动填充导出 imagePath 白名单误拦截 | Changes: `server/services/photoshopIngest.js` 的 `resolveImagePath` 改为使用 `isPathInsideDir` 做目录内校验，避免 Windows 路径大小写/分隔符差异导致误判；同时将 `exportTemplate` 与 `exportVariableImages` 的允许目录从仅 `output/uploads` 扩展为 `output/uploads + output/assets/images`，与用户端产品图上传落地目录一致；补充 `tests/server-export-error.test.mjs` 断言防回归 | Risk: Low-Medium. 放宽白名单后允许读取 `output/assets/images` 下文件，但仍受“目录内校验”约束，不会放开到任意路径。
[2026-03-13] Task: 修复偏光规则对“非偏光”误判并支持自定义输出 | Changes: `src/store/dataStore.js` 的 `lensTypeSummary` 与 `keywordContains` 增加“不/非+关键词”否定优先级，避免 `非偏光` 被误判为偏光；`lensTypeSummary` 支持可选 `polarizedText/unpolarizedText` 覆盖默认输出；补充规则计算单测 | Risk: Low. 仅修正边界语义并增加可配置输出，默认行为保持不变。
[2026-03-13] Task: 修复 PSD 导出替换图片后层级置顶导致文案叠层 | Changes: `server/photoshop/render_export.jsx` 移除单次导出流程中替换图片后对图层 `PLACEATBEGINNING` 的强制置顶，改为仅按原父级兄弟顺序还原（避免图片盖住文本/看起来文案叠在一起）；更新对应测试断言 | Risk: Medium. 若少量模板依赖“置顶”让替换图可见，需通过模板本身层级修正或引入显式开关。
[2026-03-13] Task: 修复 PSD 自动填充产品图匹配误删色号 90/45 | Changes: `src/utils/productImageMatch.js` 的 `stripAngleTokens` 增加左侧边界约束，避免将色号如 `C90/A60` 中的 `90/45` 当作角度 token 删除，导致 `BL6110 C90 正.jpg` 这类图片解析不到色号从而无法匹配；补充 `tests/productImageMatch.test.mjs` 回归用例 | Risk: Low. 仅收紧角度 token 的删除条件，不影响原本规范命名解析。
[2026-03-14] Task: 管理后台模板列表增加复制模板 | Changes: 新增后端 `POST /api/template/:id/duplicate` 复制模板落盘并跳过 inputs/exports；管理端 `AdminPage` 模板卡片新增“复制”按钮与弹窗改名/默认复制后进入配置页；补充复制落盘单测 | Risk: Low-Medium. 复制会增加磁盘占用（包含 PSD 与预览），但已排除临时产物目录以控制膨胀。
[2026-03-14] Task: 修复文本变量居中导出叠字 | Changes: `server/photoshop/render_export.jsx` 在文本替换后按替换前 bounds 同时校正 X/Y，避免因对齐/换行导致纵向漂移叠字；补充回归测试 `tests/renderExportTextVerticalStable.test.mjs` | Risk: Low. 仅对文本变量追加垂直位置校正，不影响图片替换与导出流程。
[2026-03-14] Task: 修复用户端参考线未识别与回填诊断标题栏整合 | Changes: 用户端加载模板时即使后端返回空 guides 也会从 source.psd 重新提取原生参考线；前端参考线解析兼容更多字段与多种坐标缩放（32/65536/比例值）；回填诊断面板从画布浮层迁移到画布标题栏按钮下拉，避免遮挡画布操作 | Risk: Low. 仅影响用户端参考线可视化与诊断面板位置，不改动导出协议与后端对齐逻辑。
[2026-03-14] Task: 修复偏光摘要在偏光/非偏光共存时误判 | Changes: `src/store/dataStore.js` 的 `lensTypeSummary` 去掉“不偏光”否定分支，仅以“非偏光”作为否定关键词；当偏光与非偏光同时出现（同字段或跨字段）时输出 `高清偏光/非偏光`（支持 bothText 自定义）；`keywordContains` 同步避免“不偏光”触发偏光命中；补充规则单测覆盖共存场景 | Risk: Low-Medium. 若历史数据使用“不偏光”表示非偏光，将不再被识别为否定，但已做“中性化处理”避免被误判为偏光，默认仍回落到非偏光输出。
[2026-03-14] Task: PSD自动填充导出PSD文件名按款号重命名 | Changes: 当所选模版名称包含“详情”时，导出PSD/PSB下载文件名改为“商品位1款号-产品详情-1000.<ext>”，否则保持原有“模版名_日期_导出.<ext>” | Risk: Low. 仅影响下载文件名，不改变后端导出产物与协议。
[2026-03-16] Task: 修复导出链路画质折损与发糊问题 | Changes: `render_export.jsx` 改为 PNG/JPEG 高保真保存路径（PNGSaveOptions 与 JPEGSaveOptions，JPEG 质量百分比映射到 1-12 并嵌入色彩配置，异常才回退 SaveForWeb）；`sharpProcessor` 对齐链路新增保真像素密度模式并按内容与占位比例动态放大画布（受上限约束）；`photoshopIngest` 全量图片对齐调用启用保真参数；新增回归测试覆盖导出策略与对齐输出像素密度 | Risk: Medium. 导出临时文件与内存占用会增加（已用 maxDetailScale/maxCanvasPixels 限制），需持续观察大批量任务下的性能与磁盘压力。
[2026-03-16] Task: 调整JPEG默认质量到100并保持高保真替换链路 | Changes: `server/index.js` 将批量导出默认 quality 从 95 调整为 100；`render_export.jsx` 中 JPEG 百分比质量缺省值改为 100（含 SaveForWeb 回退分支）；新增 `tests/server-export-error.test.mjs` 断言默认质量为 100 | Risk: Low-Medium. 默认输出体积会增大，但可减少重复压缩造成的主观发糊与细节损失。
[2026-03-16] Task: 修复PNG/PSD仍发糊（4K源图缩小场景） | Changes: `render_export.jsx` 在 `fitLayerToRect` 增加插值策略切换（缩小=BICUBICSHARPER，放大=BICUBICSMOOTHER）；`sharpProcessor` 在大幅下采样后增加轻度锐化（sigma 0.9）并写入 debug 信息；新增 `tests/export-image-fidelity.test.mjs` 回归断言插值与锐化策略存在 | Risk: Medium. 轻度锐化可能在少量高噪点原图上放大颗粒感，但参数已控制为保守值，优先解决导出结果“发软发糊”。
[2026-03-16] Task: 修复批量导出页面JPG质量默认值仍为95 | Changes: `src/pages/Workbench/BatchProductImageTab.jsx` 将 `exportJpegQuality` 初始值由 95 调整为 100，确保前端质量输入默认与后端一致；`tests/export-image-fidelity.test.mjs` 新增回归断言锁定该默认值 | Risk: Low. 仅提升默认质量参数，输出体积略增但与“优先清晰度”目标一致。
[2026-03-16] Task: 优化PNG/PSD导出清晰度并避免二次重采样 | Changes: 基于 Adobe 官方重采样建议（降采样优先 Bicubic Sharper）与色彩管理最佳实践，`render_export.jsx` 增加“替换后边界对齐检测”，当素材替换后已贴合目标占位则跳过 `fitLayerToRect`；保留缩放方向插值策略，仅在确需缩放时才执行一次插值；`tests/export-image-fidelity.test.mjs` 增加回归断言防止逻辑回退 | Risk: Medium. 跳过二次缩放会让少量历史模板暴露其原始占位边界偏差，但这属于模板数据问题，可通过日志快速定位并修模板。
[2026-03-16] Task: 改密后不再提示初始密码 | Changes: 管理端登录弹窗仅在 `mustChangePassword=true`（首次登录改密）时展示“初始密码：admin”与复制按钮；常规登录不再出现“初始密码/初始：admin”占位提示，避免误导；更新 `tests/admin-login-ux.test.mjs` 回归断言 | Risk: Low. 仅调整提示展示条件，不影响登录/改密流程。
[2026-03-16] Task: 继续优化PNG/PSD清晰度并生成验证发布包 | Changes: `photoshopIngest` 将内容边缘高保真对齐从仅 `PSD/PSB` 扩展到 `PNG/JPEG/PSD/PSB`，并把预缩放上限提升到 `maxScaleFactor=3`、`maxPixels=36000000`；新增 `tests/server-export-error.test.mjs` 回归断言；按发布规范生成 `output/release/Fdesign_release_20260316_1925_quality_fidelity_20260316.zip` 并通过 `scripts/verify_deployment.ps1` 验证健康检查与首页可用 | Risk: Medium. 更高预缩放会增加临时图与内存占用，但换来小版心导出的细节保真提升，已通过上限参数约束。
[2026-03-18] Task: 兼容画板PSD导出时文本/图片漂移 | Changes: `server/utils/templateMeta.js` 增加画板坐标归一化（局部坐标自动换算到文档坐标），并恢复 `backgroundRect/guides/guideLayers` 元数据输出；`server/photoshop/render_export.jsx` 读取几何改为优先 `boundsNoEffects` 并更新脚本构建号；新增 `tests/template_meta_artboard.test.js` 覆盖画板局部/绝对坐标两类输入 | Risk: Medium. 坐标归一化逻辑对历史画板模板会改变变量与参考线的计算基准，需用真实画板模板回归验证导出落位。
[2026-03-19] Task: 兼容外部数据目录与项目内模板同时可见 | Changes: `server/index.js` 模板列表合并扫描 `outputRoot/templates` 与 `projectRoot/output/templates` 并增加结构化日志，避免模板仅复制到项目目录时管理端不可见；同步更新 `docs/ARCHITECTURE.md` | Risk: Low. 仅扩展模板列表读取范围，不改变模板入库与导出协议。
[2026-03-19] Task: 管理端移除变量/字段自动持久化 | Changes: `src/pages/AdminSlotEditor.jsx` 在移除与恢复变量/字段时触发节流自动保存 `slot-config`，记录结构化日志，避免下次进入配置页面丢失移除状态 | Risk: Low. 仅新增自动保存行为，不改变商品位配置结构。
[2026-03-19] Task: 修复发布模式构建对 npm 依赖导致的启动失败 | Changes: 调整 `start.bat` 前端构建流程，优先使用本地 `node_modules/vite/bin/vite.js` 直接构建，避免 npm 缺失导致 `MODULE_NOT_FOUND`；失败时补充 NODE/NPM 路径日志便于定位 | Risk: Low. 仅影响构建脚本，业务逻辑与导出链路不变。
[2026-03-19] Task: 导出阶段按上传文件名重命名画板组 | Changes: `server/utils/templateMeta.js` 新增 `buildArtboardRenameMap`，`server/services/photoshopIngest.js` 在单导出/批量导出/PSD合并任务写入 `artboardRenames`，`server/photoshop/render_export.jsx` 在图片替换后按映射重命名所属画板组，`tests/server-export-error.test.mjs` 增加映射与透传回归断言 | Risk: Medium. 依赖 `manifest.variables.path` 的首段作为画板名，若模板中画板命名重复或路径不规范会导致重命名跳过。
[2026-03-19] Task: 修复模板列表合并扫描的同ID屏蔽问题 | Changes: `server/index.js` 将 `seen.add(id)` 延后到 `manifest.isUserSaved` 校验之后，避免 data 目录下未保存/异常同 ID 目录提前占位，导致 legacy 目录中的已保存模板被跳过；`tests/server-export-error.test.mjs` 增加回归断言锁定顺序 | Risk: Low. 仅影响模板列表聚合去重时机，不改变模板保存与导出协议。
[2026-03-19] Task: 修复清空Excel后二次上传误报“未配置商品位” | Changes: `src/store/dataStore.js` 新增 `resetExcelData` 仅清空 Excel 与选中行相关状态并保留 `slots/fieldDefinitions`；`src/components/DataConsole.jsx` 清空按钮改为调用 `resetExcelData`；`tests/build_slot_updates_align.test.js` 增加回归用例覆盖“清空后商品位配置仍保留” | Risk: Low. 清空行为由“全量重置”收敛为“仅重置Excel态”，不会影响模板配置加载与商品位结构。
[2026-03-19] Task: 修复未配置图片变量被自动匹配填充 | Changes: `src/pages/Workbench/PsdAutoFillTab.jsx` 新增 `hasSlotVarBinding` 并将自动匹配限制为“已配置 excelFieldKey/computedRule/computedRules 的图片变量”，同时在匹配报告新增 `skippedUnmapped`；`tests/psd-autofill-ui.test.mjs` 增加回归断言 | Risk: Low. 仅收紧自动匹配入口，不影响已配置映射变量的图片填充。
[2026-03-19] Task: 修复发布脚本 prod 构建阶段命令乱码与异常拆分 | Changes: `start.bat` 追加 `chcp 65001` 并将 `:build_frontend` 分支内提示文案改为 ASCII，避免 UTF-8 中文在 cmd 括号块下被错误解析导致 `"VITE_BIN" build` 命令拆裂、误落入 npm fallback 触发 `node_modules/npm` 缺失异常 | Risk: Low. 仅影响启动脚本日志与编码初始化，不改变服务端/前端业务逻辑。
[2026-03-19] Task: 修复启动备份目录 EPERM 导致备份失效 | Changes: `server/services/startupBackupService.js` 改为“按候选目录逐个完整尝试备份”，主目录失败时自动回退到 `FDESIGN_BACKUP_FALLBACK_DIR` / `<output>/project_backups_fallback` / `%TEMP%/FdesignData/project_backups`，并输出结构化 fallback 日志；新增 `tests/startup_backup_service.test.mjs` 覆盖“主目录不可写”和“仅子目录不可写”两类场景；同步更新 `docs/ARCHITECTURE.md` | Risk: Low. 仅增强备份目录选择与容错，不影响导出链路与模板读写。
[2026-03-19] Task: 修复手动复制模板后管理端图裂且配置页加载失败 | Changes: `server/index.js` 新增 legacy 模板自动迁移逻辑（从 `projectRoot/output/templates/{id}` 复制到 `outputRoot/templates/{id}`）并在 `/api/templates`、`/api/template/:id`、`/api/template/:id/config`、`/api/template/:id/slot-config`、`/api/template/save`、`/api/template/:id/duplicate` 统一触发；`/templates` 静态资源挂载增加 legacy 目录兜底，避免列表可见但预览和详情不可读 | Risk: Low-Medium. 首次访问 legacy 模板会产生一次磁盘复制开销，若 legacy 目录权限异常将回退仅可读模式并输出告警日志。
[2026-03-19] Task: 修复 DEV 模式启动卡顿（非业务链路） | Changes: `server/services/startupBackupService.js` 增加 Node `--watch` 模式默认跳过启动备份（未显式设置 `FDESIGN_BACKUP_ON_START` 时生效），避免开发热重启时重复全项目快照；`start.bat` 的 `:dev` 分支显式设置 `FDESIGN_BACKUP_ON_START=0`，减少开发模式冷启动等待；新增 `tests/startup_backup_service.test.mjs` 覆盖 watch 模式默认跳过逻辑；同步更新 `docs/ARCHITECTURE.md` | Risk: Low. 仅影响开发态默认行为，生产态仍按显式配置与默认开启规则执行启动备份。
[2026-03-19] Task: 恢复 DEV 服务端日志可见并修复产品图自动匹配失效 | Changes: `start.bat` 开发模式改为 PowerShell Tee 输出，服务端日志既写入文件也在控制台显示；`src/utils/productImageMatch.js` 新增 `matchCatalogImageByAngleSource` 支持无角度时按唯一候选匹配；`PsdAutoFillTab.jsx` 自动匹配不再要求图片变量先绑定 Excel 字段，并记录未绑定目标数量；新增 `tests/product_image_match_auto.test.mjs` | Risk: Low-Medium. 自动匹配放宽后可能覆盖未显式绑定但包含角度标识的图片变量，仍保留“手动锁定图片”保护避免误替换。
[2026-03-19] Task: 修复自动匹配后图片预览破裂 | Changes: `src/utils/apiClient.js` 新增 `resolveAssetUrl` 用于补齐 `/output` 相对路径；`PsdAutoFillTab.jsx` 在图片回填时统一通过渲染服务基地址生成可访问 URL；新增 `tests/resolve_asset_url.test.mjs` 覆盖相对路径补齐与 data/blob/http 透传 | Risk: Low. 仅影响前端预览 URL 组装，不改变导出与后端落盘路径。
[2026-03-19] Task: 修复 DEV 下图片仍裂图的根因（/output 基址选择） | Changes: `src/utils/apiClient.js` 在 `resolveAssetUrl` 中为 `/output` 资源优先选择 `:3001` 基址，避免 Vite 源站无代理导致 404；更新 `tests/resolve_asset_url.test.mjs` 覆盖候选基址选择 | Risk: Low. 仅影响前端资产 URL 解析顺序，不改变任何导出与落盘路径。
[2026-03-19] Task: 导出文本换行不生效修复 | Changes: `server/services/photoshopIngest.js` 新增 `normalizeTextValue` 将 `\n` 统一转换为 `\r` 并在 `normalizeClientUpdates` 统计与输出；`server/photoshop/render_export.jsx` 在写入 `textItem.contents` 前同样标准化换行；`tests/server-export-error.test.mjs` 增加回归断言 | Risk: Low. 仅影响导出文本值的换行规范化，不改变其它字段写入逻辑。
[2026-03-19] Task: 修复画板PSD自动填充导出文本/图片偏移 | Changes: `server/services/photoshopIngest.js` 新增画板模板识别并在自动填充导出下发 `preserveArtboardTextPosition`；`server/photoshop/render_export.jsx` 在该模式下对智能对象走 Replace Contents 直替并跳过二次 fit，同时对非更新文本层执行 bounds 稳态回放；新增 `tests/artboard_export_stability.test.mjs` 并回归相关导出脚本测试 | Risk: Medium. 画板稳态模式会减少自动几何重算，若模板依赖历史二次 fit 行为可能出现个别占位差异，已限定仅在“自动填充+画板模板”启用。
[2026-03-19] Task: 修复画板稳态回放遗漏“已更新文本层”导致的二次漂移 | Changes: `server/photoshop/render_export.jsx` 将文本稳态快照从“仅未更新文本”升级为“全量文本”，并在每次文本更新后执行 `upsertStableTextBounds` 刷新该文本层的目标 bounds，再在图片替换后统一回放；`server/services/photoshopIngest.js` 增加画板稳态开关结构化日志（`hasArtboardTemplate/enableArtboardStableExport`）与 dryRun 调试字段；`tests/artboard_export_stability.test.mjs` 增加回归断言；回归通过 lint/build 与导出链路测试 | Risk: Medium. 回放范围扩大后会增加少量文本层位移操作次数，但阈值与异常捕获已保留，且仅在“自动填充+画板模板”分支启用。
[2026-03-19] Task: 修复画板稳态分支导致“未缩放对齐+导出过慢” | Changes: `server/photoshop/render_export.jsx` 移除稳态分支中“强制 skipFit”逻辑，恢复按 `shouldSkipFitAfterReplace` 判定是否执行 `fitLayerToRect`，避免图片直接覆盖不缩放；将文本稳态回放从“每次图片替换后执行”改为“更新完成后统一执行一次”，并增加稳态耗时日志；`tests/artboard_export_stability.test.mjs` 增加断言禁止强制 skipFit 且要求存在统一回放标记 | Risk: Medium. 重新启用 fit 可能暴露个别模板历史对齐噪声，但统一稳态回放已保留用于抵消文本漂移，且性能显著优于逐图层回放。
[2026-03-19] Task: 修复参考线宽度未生效导致产品图不按比例缩放 | Changes: `server/photoshop/render_export.jsx` 在图片替换后计算目标矩形时，改为优先读取 `readRectFromUpdate(u)`（即客户端按左右参考线与变量绑定写入的 `x/y/width/height`），仅在无更新矩形时回退占位图层 bounds；更新 `SCRIPT_BUILD` 为 `ARTBOARD_STABLE_EXPORT_V3`；`tests/artboard_export_stability.test.mjs` 增加“目标矩形优先来自 updates”断言并通过回归 | Risk: Medium. 若某些历史任务未携带 `x/y/width/height` 将回退到旧行为，但自动填充链路已默认携带，不影响既有兼容性。
[2026-03-19] Task: 发布包提速并支持补丁覆盖升级 | Changes: `scripts/build_release.ps1` 新增 `-PackageMode (patch/full/both)`、默认生成 `Fdesign_patch_*.zip`，并在发包时裁剪 server 测试/备份/调试文件与 docs；新增 `dependencyHash` 与 `packageMode` 清单字段；`scripts/upgrade_in_place.ps1` 增加补丁包依赖哈希校验，不兼容时强制使用完整包；同步更新运行说明 | Risk: Low-Medium. 补丁包依赖已安装 runtime/node_modules，若基础包被人工改动可能触发哈希不一致，需要改用完整包升级。
[2026-03-20] Task: 修复发布包双击 start_app.bat 无响应 | Changes: `start_release.bat` 增加主入口 `call :start`，避免脚本直接落入子程序并 `goto :eof` 提前退出；重新打包生成 `Fdesign_release_20260320_1047_client_20260320_hotfix_start.zip` 与 `Fdesign_patch_20260320_1047_client_20260320_hotfix_start.zip`；验证解压后 `start_app.bat` 可启动并通过 `/health`，覆盖升级后仍可启动 | Risk: Low. 仅修复启动脚本入口流程，不影响后端业务逻辑与导出链路。
[2026-03-20] Task: 修复画板导出替换后“图片缩放错乱与文本/图片漂移” | Changes: `server/photoshop/render_export.jsx` 新增 `pickDesiredImageRect`，将图片替换目标矩形默认锁定为替换前图层 bounds，仅在 `updates` 矩形与原 bounds 近似时才采用，超阈值自动拒绝并落日志；画板稳态分支恢复统一智能对象隔离替换（`isolateSmartObjectLayer + restoreLayerPlacement`），阻断同源智能对象串改导致的跨画板错位；`tests/artboard_export_stability.test.mjs` 同步改为断言“稳态也必须隔离替换 + 异常 updates 坐标拒绝” | Risk: Medium. 在依赖“显式改写占位矩形”的历史任务里会更偏向保持模板原位，但这是为了保证画板 PSD 坐标稳定与可预测性。
[2026-03-20] Task: 增强画板导出几何链路日志用于现场复盘 | Changes: `server/photoshop/render_export.jsx` 升级 `SCRIPT_BUILD` 并新增 `formatRectForLog/collectLayerChainNames`，在图片替换链路输出 `targetLayerId/smartLayerId/layerChain/updateRectRaw/updateRectParsed/replacedRect(beforeFit)/skipFit/desiredAfterDistance` 等关键字段，便于一眼判断“坐标源错误”还是“替换后拟合失败”；`tests/artboard_export_stability.test.mjs` 增加日志字段存在性断言 | Risk: Low. 仅新增日志与构建标识，不改变导出算法分支。
[2026-03-20] Task: 修复画板导出“部分文本变量偏移” | Changes: `server/photoshop/render_export.jsx` 新增 `resolveTextAnchorAlign`，文本更新在 `align` 缺失时回退图层原始 `justification` 作为锚点再执行位置回放，避免仅部分文本因未携带 `align` 发生偏移；同时补充 `text_update` 诊断日志（`alignInput/alignResolved/desiredRect/afterRect/desiredAfterDistance`）并更新 `SCRIPT_BUILD`；`tests/artboard_export_stability.test.mjs` 增加对应断言 | Risk: Medium. 对历史依赖“未传 align 即不做水平锚点修正”的模板会变为按图层原对齐锚点纠正，但这与“保持原 PSD 文本位置”目标一致。
[2026-03-20] Task: 修复 PSD bundle 右侧画板图片位移 | Changes: `server/photoshop/render_export.jsx` 在 `runPsdBundle` 中将变体层复制改为优先 `target.duplicate()`（同父层级）并执行 `restoreLayerPlacement`，不再默认复制到文档根节点；目标矩形改为 `pickDesiredImageRect` 统一决策，重命名画板时改为以 `variantLayer` 回溯父链；补充 bundle 链路几何日志（before/replaced/after/distance）并更新 `SCRIPT_BUILD`；`tests/artboard_export_stability.test.mjs` 增加“bundle 原层级复制与位置回放”断言 | Risk: Medium. 若极少模板依赖“复制到文档根后再手动整理图层”的旧行为，图层层级顺序会更贴近原模板，但这正是修复跨画板位移所需。
[2026-03-23] Task: 修复画板PSD导出中对象引用失效导致的层级回放偏移 | Changes: `server/photoshop/render_export.jsx` 为层级回放补充 `parentId/refId` 持久锚点并新增 `resolveLayerByIdFromDoc`，优先按图层 ID 回放父级与兄弟顺序，避免复制/删除后对象引用失效引发跨画板漂移；在画板稳态模式新增 `restoreLayerArtboardPosition`，隔离替换后按替换前矩形回放图层左上角；文本更新在画板稳态模式下优先使用当前图层 bounds 作为目标矩形，避免外部 update 坐标噪声带来的局部文本偏移；同步更新 `SCRIPT_BUILD` 与 `tests/artboard_export_stability.test.mjs` 回归断言。 | Risk: Medium. 仅在“自动填充+画板模板稳态”路径增强几何约束，普通 PSD 导出链路不变；若模板历史上依赖错误 update 坐标驱动文本位移，将被收敛为保持模板原位。
[2026-03-23] Task: 修复“已重启仍跑旧 JSX”导致导出偏移无法收敛 | Changes: `server/services/photoshopIngest.js` 新增 `readJsxScriptBuild/assertScriptBuildMatch`，在单张导出、批量导出、PSD bundle 三条链路统一读取 `render_export.jsx` 期望构建号并与 `result.scriptBuild` 强一致比对，不一致直接抛出 `SCRIPT_BUILD_MISMATCH`（附 `jobPath/resultPath/expected/actual`）；导出调试日志新增 `expectedScriptBuild` 与 JSX 路径，返回结果补充 `expectedScriptBuild` 字段；同步更新 `docs/ARCHITECTURE.md` 与 `openspec/changes/2026-03-23-artboard-export-stability-hardening.md`。 | Risk: Low-Medium. 旧发布包与新脚本混跑场景将由“静默偏移”转为“显式失败”，短期可能增加报错率，但能快速暴露部署错配根因并避免错误产物继续流转。
[2026-03-23] Task: 强化 start.bat 的 DEV 启动脚本版本门禁 | Changes: `start.bat` 新增 `resolve_expected_script_build/verify_server_script_build`，启动后端后先读取本地 `server/photoshop/render_export.jsx` 的 `SCRIPT_BUILD`，再调用 `/health` 校验服务端 `runtime.exportJsxScriptBuild` 与脚本路径，一旦不一致立即阻断并回收 3001 端口；`server/index.js` 的 `/health` 返回新增 `runtime.outputRoot/exportJsxPath/exportJsxScriptBuild/residentModeEnabled`，`server/services/photoshopIngest.js` 新增 `getRuntimeDiagnostics` 统一暴露运行时导出脚本信息；同步更新 `docs/ARCHITECTURE.md` 与 `openspec/changes/2026-03-23-artboard-export-stability-hardening.md`。 | Risk: Low. 仅增加启动前置校验与健康信息输出，不改导出算法；若本机存在“前端连旧服务”场景会更早失败并给出明确版本差异。
[2026-04-02] Task: 修复画板与普通 PSD 导出误报“未生成输出文件” | Changes: `server/services/photoshopIngest.js` 修复批量结果解析中的 `await` 语法错误并改为 `Promise.all` 异步等待；导出产物候选改为 `buildOutputLookupCandidates` 自动补齐 PSD/PSB 兄弟扩展名，单张/批量合并 PSD 的轮询窗口提升到 12~15 秒并补充结构化失败日志；`server/services/exportResultResolver.js` 新增候选去重与 PSD/PSB 兄弟路径扩展能力；新增 `tests/export_result_resolver.test.mjs` 回归用例覆盖候选补齐逻辑。 | Risk: Low-Medium. 轮询窗口变长会让极端失败请求多等待数秒，但能显著降低 Photoshop 延迟落盘与 PSD→PSB 降级场景下的误报。
[2026-04-02] Task: 修复“VBS返回成功但 result/output 都缺失”导致单张 PSD 导出失败 | Changes: `server/services/photoshopIngest.js` 在单张导出链路新增 `resultPath` 轮询等待（PSD/PSB 最长 90s）、输出文件轮询窗口扩展（PSD/PSB 最长 120s），并在“首轮无 result 且无输出”时自动触发一次 `quitAfter=true` 强制重试，避免 Photoshop 常驻态偶发吞任务导致直接报“未生成输出文件”；同时补充重试触发结构化日志便于现场定位。 | Risk: Medium. 极端失败场景下单次请求等待时长会变长（最多新增约 1~2 分钟），但可显著提升常驻模式下导出成功率并减少误报。
[2026-04-02] Task: 修复 PSD 自动填充导出 `silent_noop_after_vbs_success` 根因竞态 | Changes: `server/photoshop/run_job.vbs` 改为优先把 wrapper JSX 与 `ps_jsx_*.jsx` 执行副本写入当前导出目录，VBS 成功返回后不再立即删除脚本文件，并补充 `wrapPath/execMode/execScriptPath/deferredCleanup` 诊断日志；`server/services/cleanupService.js` 新增对 `ps_jsx_*.jsx` 与 `ps_wrap_*.jsx` 的导出元数据清理；`tests/photoshop_command_artifacts.test.mjs` 与 `tests/cleanupService.test.mjs` 增加回归断言，防止再次把尚未被 Photoshop 消费的脚本提前删掉。 | Risk: Medium. 导出目录会短暂保留更多 `.jsx` 中间文件，但已有定时清理兜底；换来的收益是修掉 COM 成功返回但 Photoshop 实际未执行脚本的核心竞态。

[2026-04-22] Task: 修复画板重命名并发布 V2.9 | Changes: 修复天猫主图与可选色画板在 PSD 自动填充导出时未按上传产品图款号/色号重命名的问题，统一 package.json/package-lock 与页面/启动脚本版本为 V2.9，新增 CHANGELOG_V2.9 与版本回归断言 | Risk: Low-Medium. 画板命名逻辑收敛到上传产品图解析结果，需继续关注可选色总览模板；版本升级仅影响元数据与展示。
[2026-05-22] Task: 开源前 V3.0 品牌与基础卫生整理 | Changes: 统一 package/package-lock、前端标题、启动脚本与后台 /health.version 为 V3.0；新增产品 Logo 并复用到 favicon 与首页左上角；删除 Vite/React 脚手架默认资产；调整 .gitignore 的 env 与 lockfile 规则；补充 README、CHANGELOG_V3.0、OPEN_SOURCE_CHECKLIST 与 openspec 记录 | Risk: Low. 主要影响元数据、品牌展示与仓库卫生，不改变 PSD 导出业务协议。
[2026-05-22] Task: 净化公开仓库边界并补齐协作入口 | Changes: 移除私有生成脚本、策划资料、内部发布文档、备份压缩包、临时工作流目录与历史缓存；补充 MIT `LICENSE`、`.env.example`、`CONTRIBUTING.md`、`SECURITY.md` 与 package 公开元数据；README 与开源检查清单改为公开发布状态说明；发布回归测试增加公开树卫生断言 | Risk: Low. 仅收紧公开发布内容与协作入口，不改变应用运行协议。
[2026-05-22] Task: 开源前依赖审计收口 | Changes: 通过 `npm audit fix` 刷新可自动修复的依赖锁定版本；将 SheetJS `xlsx` 从 npm registry 旧版本切换到官方 0.20.3 tarball，消除公开树依赖审计告警；保留 Excel 解析回归测试验证现有导入行为 | Risk: Low-Medium. 依赖锁文件更新范围较大，需回归 lint/build/test 与 Excel 解析主流程。
[2026-05-22] Task: 落地公开页产品截图与前端拆包优化 | Changes: 裁剪用户提供的真实工作台截图并加入 `public/screenshots/fdesign-workbench-showcase.png`，README 在项目介绍中展示产品主工作流；`src/App.jsx` 改为路由级 `lazy`/`Suspense` 加载；`vite.config.js` 增加 React、PSD、表格、画布、UI 与导出依赖的稳定 `manualChunks`；发布回归测试补充截图与拆包断言 | Risk: Low-Medium. 首次进入各路由会多一次异步 chunk 请求，需通过生产构建与真实工作台导航回归确认。
[2026-06-05] Task: 开源发布补齐顶部店铺选购入口 | Changes: 新增 `src/components/ShopLinkButton.jsx`，在 `/workbench/*` 与兼容 `/slot` 工作台顶部展示可配置的“选购服务”入口；`src/config/appMeta.js` 从 `VITE_SHOP_URL`、`VITE_SHOP_LINK_LABEL` 读取店铺配置，并在 URL 为空或非 http(s) 时隐藏入口；`.env.example`、README、开源检查清单与 V3.0 changelog 补充配置说明；新增 `tests/open_source_shop_link.test.mjs` 锁定开源仓库不硬编码私有店铺链接 | Risk: Low. 入口默认隐藏，只有部署方配置真实店铺 URL 后才显示；不会改变 PSD 导出与后端协议。
[2026-06-05] Task: 设置公开店铺默认选购入口 | Changes: 将首页顶部“选购服务”默认链接设为 `https://pay.ldxp.cn/shop/FTIWLFHQ`，保留 `VITE_SHOP_URL` 覆盖能力；同步更新 `.env.example`、README、开源检查清单、V3.0 changelog、openspec 与店铺入口测试 | Risk: Low. 仅影响顶部外链默认地址，不改变 PSD 导出、后台 API 与数据协议。
[2026-06-15] Task: 制定 Fdesign 开源展示方向 | Changes: 确认 README 首屏采用“Excel 商品数据 -> 批量 PSD 成品”的结果导向定位，并规划 GitHub metadata、Release、Discussions、Issues 与公开演示材料 | Risk: Low. 当前仅为设计方向与实施前约束，不改变应用运行、导出链路或公开仓库设置。
[2026-06-16] Task: 落地 Fdesign V3.0 开源展示资产 | Changes: README 首屏改为“把 Excel 商品数据，一键变成批量 PSD 成品”，新增 `docs/DEMO.md`、`docs/ROADMAP.md`、`docs/github/release-v3.0.0.md` 与 `openspec/changes/2026-06-16-open-source-growth-implementation.md`，补充公开展示合同测试 `tests/open_source_growth_readme.test.mjs`，并收紧 `eslint.config.js` 忽略本机临时/历史工作目录以避免 lint 扫入未跟踪构建产物 | Risk: Low. 当前主要是公开文档、仓库展示资产与验证边界，不改变 PSD 导出、后台 API 或前端运行协议。
[2026-06-16] Task: 完成 Fdesign V3.0 公开发布远端配置与验证 | Changes: 推送开源增长资产到 `main`（实施提交 `41823c00`），修复 `scripts/setup_github_growth.ps1` 在 Windows 下对带空格 Issue 标题搜索参数被拆分的问题，改用 GitHub Search API 做幂等标题检查；已执行 GitHub 仓库公开增长配置，仓库为 public，Issues/Discussions 已开启，种子议题 #1-#4 已创建，`v3.0.0` Release 已发布：`https://github.com/Kriswd/Fdesign/releases/tag/v3.0.0`；远端星标基线为 0，后续增长需持续分发与复盘。Verification: `npm test -- --test-name-pattern "GitHub 社区"`、脚本语法检查、`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup_github_growth.ps1`、`gh api repos/Kriswd/Fdesign`、`gh release view v3.0.0`、`gh issue list`。 | Risk: Low. 仅影响公开仓库元信息、发布说明、议题与增长脚本，不改变 PSD 导出、后台 API 或前端运行协议。
[2026-06-16] Task: 补齐 GitHub Pages 可传播项目页 | Changes: 新增 `docs/index.html` 静态项目页，使用真实工作台截图作为首屏背景并突出 GitHub/Star CTA；复制公开截图到 `docs/assets/fdesign-workbench-showcase.png` 供 Pages 托管；README 与 `package.json` 增加 `https://kriswd.github.io/Fdesign/` 项目页入口；`scripts/setup_github_growth.ps1` 扩展为配置仓库 homepage 并启用 main 分支 `/docs` 的 GitHub Pages；已执行脚本启用 Pages，远端 Pages URL 为 `https://kriswd.github.io/Fdesign/`；新增 `openspec/changes/2026-06-16-github-pages-growth-landing.md` 与测试断言锁定 Pages 落地页和店铺次级入口。Verification: Puppeteer 本地渲染桌面/移动端通过，`npm run lint`、`npm run build`、`npm test` 通过。 | Risk: Low. 仅增加静态公开落地页与仓库配置脚本，不改变应用运行、PSD 导出、后台 API 或发布包逻辑。
[2026-06-16] Task: 补齐 Fdesign V3.0 指标采集能力 | Changes: 新增 `scripts/capture_github_growth_metrics.ps1`，采集 GitHub stars、forks、watchers、issues、PRs、Discussions、Release、Pages 与近 14 天 traffic 指标；新增 `tests/open_source_distribution_kit.test.mjs` 锁定公开仓库不暴露内部运营资料，并保留本地指标脚本。 | Risk: Low. 仅新增本地指标脚本和公开边界测试，不改变应用运行、PSD 导出、后台 API、GitHub 仓库设置或发布包逻辑。
[2026-06-22] Task: 撤回公开仓库中的内部运营资料并补齐演示包 | Changes: 删除公开树中已跟踪的内部渠道排期、发布文案、复盘表和执行计划；新增 `docs/demo-kit/` 净化示例数据、字段映射和 SVG 示例图；`.gitignore` 增加本地私有目录与旧内部资料目录忽略规则，后续内部作战资料只留本地私有目录。 | Risk: Low. 仅调整公开文档边界和演示材料，不改变 PSD 导出、后台 API、发布包或 GitHub 仓库设置。
[2026-06-22] Task: 修复 GitHub Pages 演示入口 | Changes: 将 Pages 首屏的 Demo CTA 从不存在的静态 HTML 改为 GitHub 演示包入口，并新增公开演示包区块，直接链接 `docs/demo-kit`、Demo walkthrough 和示例 CSV；更新公开增长测试锁定演示入口可达且不再出现坏链接。 | Risk: Low. 仅修改静态 Pages 文案与链接，不改变应用运行、PSD 导出、后台 API 或发布包逻辑。
[2026-06-22] Task: 补齐公开 FAQ | Changes: 新增 `docs/FAQ.md`，覆盖第一次试跑顺序、运行要求、演示包、Excel 字段映射、图片匹配、Photoshop 导出失败、issue 净化和店铺入口边界；README 与 GitHub Pages 增加 FAQ 入口，并更新公开增长测试锁定 FAQ 可见。 | Risk: Low. 仅新增公开支持文档和静态链接，不改变应用运行、PSD 导出、后台 API 或发布包逻辑。
[2026-06-22] Task: 补齐公开协作治理入口 | Changes: 新增 `CODE_OF_CONDUCT.md` 与 `.github/PULL_REQUEST_TEMPLATE.md`，明确社区行为、PR 验证项和公开数据净化检查；更新开源增长测试锁定行为准则与 PR 模板存在。 | Risk: Low. 仅新增公开协作文档和测试断言，不改变应用运行、PSD 导出、后台 API、GitHub 仓库设置或发布包逻辑。
[2026-06-22] Task: 补齐国内传播 SEO 基础设施 | Changes: GitHub Pages 增加中文关键词、canonical、Open Graph/Twitter 分享字段与 SoftwareApplication JSON-LD；新增 `docs/robots.txt` 和 `docs/sitemap.xml`，并更新开源增长测试锁定搜索与分享入口。 | Risk: Low. 仅修改静态公开页元信息和搜索索引文件，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
[2026-06-22] Task: 降低国内用户首次试跑摩擦 | Changes: 新增 `docs/QUICKSTART_CN.md`，覆盖 Windows/Node.js/npm 镜像、前后端启动、健康检查、Photoshop 调度、公开演示包和净化反馈；README、FAQ 与 GitHub Pages 增加中文快速试跑入口，并更新开源增长测试锁定入口可见。 | Risk: Low. 仅新增公开试跑文档和静态入口，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
[2026-06-28] Task: 补齐国内用户公开排障路径 | Changes: 新增 `docs/TROUBLESHOOTING_CN.md`，覆盖 npm install、后端健康检查、前端启动、公开演示包理解、图片匹配和 Photoshop 导出失败排查；README、FAQ、中文快速试跑、GitHub Pages 和开源检查清单增加排障入口。 | Risk: Low. 仅新增公开支持文档和静态链接，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
[2026-06-28] Task: 补齐最小 PSD 模板试跑教程 | Changes: 新增 `docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md`，指导用户用公开演示 CSV、字段映射和示例图在 Photoshop 中创建最小 PSD 测试模板；README、Demo、FAQ、中文快速试跑、排障清单、GitHub Pages 与开源检查清单增加入口。 | Risk: Low. 仅新增公开教程和静态链接，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
[2026-06-28] Task: 给最小 PSD 教程补可视化关系图 | Changes: 新增 `docs/demo-kit/assets/minimal-psd-binding-flow.svg`，在最小 PSD 教程中展示 Photoshop 图层名、Fdesign 商品位、CSV 第一行和字段绑定关系；demo-kit README 增加资产说明，便于国内用户先看懂再试跑。 | Risk: Low. 仅新增公开 SVG 教程资产和文档引用，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
[2026-06-28] Task: 给最小 PSD 教程补跑通后界面截图 | Changes: 在 `docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md` 中复用公开工作台截图，补充“跑通后你应该看到什么”说明；开源检查清单和增长测试同步锁定截图入口，降低首批国内用户看到空态后的理解成本。 | Risk: Low. 仅新增公开文档引用和测试断言，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
[2026-06-28] Task: 新增公开净化案例承接国内首批用户 | Changes: 新增 `docs/showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md`，用公开截图和 demo-kit 假数据说明眼镜商品详情页批量套版场景；README、Demo、净化案例指南、Pages、开源检查清单和增长测试增加入口。 | Risk: Low. 仅新增公开案例文档和静态链接，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
[2026-06-28] Task: 新增公开净化案例库索引 | Changes: 新增 `docs/showcases/README.md`，把眼镜详情页案例整理成案例库入口，并列出后续适合补充的公开安全案例类型；README、Demo、净化案例指南、Pages、开源检查清单和增长测试同步指向案例库。 | Risk: Low. 仅新增公开案例索引和静态链接，不改变应用运行、PSD 导出、后台 API、发布包或仓库设置。
