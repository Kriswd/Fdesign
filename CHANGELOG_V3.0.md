# 闪图 Fdesign V3.0 更新说明

## 1. 统一版本元数据

- `package.json` 与 `package-lock.json` 根版本升级为 `3.0`。
- 前端页面标题、工作台标题、批量生成页标题、启动脚本标题统一展示 `V3.0`。
- 后台 `/health` 新增 `version` 字段，从 `package.json` 读取当前应用版本。

## 2. 产品 Logo 与公开仓库卫生

- 新增 `public/fdesign-logo.svg` 作为浏览器栏图标和首页左上角产品 Logo。
- 删除 Vite/React 默认脚手架图标与未使用样式文件，减少开源仓库中的模板痕迹。
- `.gitignore` 补充 `.env*`、缓存、测试结果与临时目录规则，并允许提交 `.env.example`。
- `package-lock.json` 不再被忽略，便于外部贡献者复现依赖树。

## 3. 公开发布入口

- 新增 MIT `LICENSE`、`.env.example`、`CONTRIBUTING.md`、`SECURITY.md` 与 `docs/OPEN_SOURCE_CHECKLIST.md`。
- 更新 README 的项目定位、开发端口、健康检查地址、运行依赖与验证命令。
- 移除不适合进入公开树的策划资料、内部发布资料、临时工作目录、备份与二进制调试痕迹。

## 4. 依赖审计

- 刷新可自动修复的依赖锁定版本，将 `multer`、`postcss` 与 `vite` 的直接依赖下限提升到已验证版本。
- 将 SheetJS `xlsx` 依赖切换到官方 0.20.3 分发包，公开发布前的 `npm audit` 结果为 0 告警。
