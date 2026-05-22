变更：管理后台模板列表支持“复制模板”

- 模板列表每个条目新增“复制”入口，支持改名与“复制后直接进入配置页”（默认开启）
- 后端新增 `POST /api/template/:id/duplicate`：复制 `source.psd/manifest.json/slot-config.json/预览图`，跳过 `exports/inputs` 临时产物
- 新模板自动写入 `isUserSaved=true` 与新的 `savedAt`
- 构建脚本补齐前端构建优先使用本地 Vite，避免 npm 缺失导致发布模式启动失败
- 模板列表兼容合并扫描外部数据目录与项目内 `output/templates`
- 管理端移除变量/字段自动持久化至 slot-config，避免下次进入丢失
- 新增 legacy 模板自动迁移：当模板仅在 `projectRoot/output/templates/{id}` 时，访问列表/详情/配置会自动复制到 `outputRoot/templates/{id}`，避免“列表可见但配置页404/预览图裂”
- DEV 启动时服务端日志改为控制台可见且落盘：`start.bat` 使用 PowerShell Tee 输出，便于定位问题
- 产品图自动匹配放宽：支持无角度但唯一候选时匹配，图片变量未绑定 Excel 字段也可参与自动匹配并输出诊断
- 自动匹配回填图片预览补齐渲染服务域名：`/output/...` 相对路径在前端统一转换为可访问 URL，避免 DEV 下图片破裂
- `/output` 资源在 DEV 下默认选择 `:3001` 作为基址，避免 3010 源站缺少代理导致 404 裂图
- 导出文本换行统一标准化为 `\r`，保证手动换行在 Photoshop 导出中生效
