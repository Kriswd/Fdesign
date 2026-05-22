变更：画板 PSD 自动填充导出稳定性加固（父级回放锚点 + 文本稳态矩形收敛）

- JSX 层级回放从对象引用扩展为 `parentId/refId` 双锚点，恢复时优先按图层 ID 解析父级与兄弟参照，减少复制/删除后引用失效带来的跨画板偏移
- 画板稳态导出中，图片变量在智能对象隔离后追加一次“替换前矩形回放”（`restoreLayerArtboardPosition`），确保替换流程始终在原画板坐标上下文内执行
- 画板稳态导出中，文本变量目标矩形改为优先读取当前图层 bounds，避免外部 updates 坐标噪声引发“部分文本变量偏移”
- 普通 PSD 导出链路保持不变：仅在 `preserveArtboardTextPosition=true` 分支启用上述增强逻辑
- 补充结构测试：`tests/artboard_export_stability.test.mjs` 新增断言覆盖图层 ID 回放与画板稳态几何回放调用
- 服务端新增 `SCRIPT_BUILD` 强一致校验：导出前读取 `render_export.jsx` 期望版本并与 `result.scriptBuild` 比对，不一致时抛出 `SCRIPT_BUILD_MISMATCH`，避免发布包/运行目录错配导致“修复已改但线上仍偏移”
- 启动链路新增版本门禁：`start.bat` 在 DEV 模式启动后端后立即校验 `/health.runtime.exportJsxScriptBuild` 与本地 `render_export.jsx` 的 `SCRIPT_BUILD`，不一致即阻断前端拉起，避免误连旧服务
- 补充导出结果解析稳健性：服务端输出候选路径解析新增 PSD/PSB 兄弟扩展名补齐与去重，并在单张/批量合并 PSD 导出场景延长落盘轮询窗口，降低 Photoshop 延迟落盘或 PSD→PSB 降级时误报“未生成输出文件”的概率
- 补充单张导出“空产物”自恢复：当 `run_job.vbs` 返回成功但首轮仍无 `resultPath` 且无输出文件时，服务端自动执行一次 `quitAfter=true` 强制重试，并在重试前后延长 `resultPath/output` 轮询窗口，降低常驻 Photoshop 偶发吞任务引发的“未生成输出文件”
- 补充调度层“静默吞任务”判定：若 `run_job.vbs` 成功返回后短时间内仍未生成 `result/.log/.fatal.log` 任一产物，则立即判定为 Photoshop 常驻实例失联，记录结构化诊断并强制重启 `Photoshop.exe` 后再走队列重试，避免用户等待数分钟后才落到“未生成输出文件”
- 修正“静默吞任务”重试预算：即使全局 `PS_EXPORT_MAX_RETRIES` 默认值为 0，命中 `silent_noop_after_vbs_success` 后仍保底重试 1 次，确保“识别出来但不执行恢复动作”的逻辑缺口被补上
- 修复导出调度脚本生命周期竞态：服务端改为在当前导出目录生成注入 `__FDESIGN_JOB_PATH` 的 `run_*.jsx` 自包含脚本，并在调度返回后保留到导出元数据清理阶段统一回收，避免 Photoshop COM 已返回但脚本尚未被消费时因源文件被删而静默空跑
- 升级画板重命名策略：`artboardRenames` 基于 `psId` 精确命中后，支持“天猫主图”画板仅替换中间款号段；纯“款号+色号”画板改为替换为上传文件解析出的“款号+色号”，避免导出命名与商品图款号不一致
- 导出默认折叠画板组：在 single / batch / psd-bundle 三条 JSX 导出链路统一执行 `collapseAllGroupsEvent`，确保导出 PSD 图层面板默认收起
