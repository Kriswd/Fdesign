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
- 首页顶部默认展示公开店铺选购入口 `https://pay.ldxp.cn/shop/FTIWLFHQ`，并支持通过 `VITE_SHOP_URL` 覆盖。

## 4. 依赖审计

- 刷新可自动修复的依赖锁定版本，将 `multer`、`postcss` 与 `vite` 的直接依赖下限提升到已验证版本。
- 将 SheetJS `xlsx` 依赖切换到官方 0.20.3 分发包，公开发布前的 `npm audit` 结果为 0 告警。

## 5. 开源展示与社区基础设施

- README 首屏调整为“把 Excel 商品数据，一键变成批量 PSD 成品”的结果导向表达。
- 新增 `docs/DEMO.md`、`docs/demo-kit/`、`docs/ROADMAP.md` 与 `docs/github/release-v3.0.0.md`。
- 新增 GitHub Issue/Discussion 模板与 `scripts/setup_github_growth.ps1`，用于配置 Topics、Labels、Discussions 和首批公开议题。
- 店铺入口保留为次级服务入口，开源快速开始与贡献路径优先展示。
- 新增 `docs/index.html` GitHub Pages 项目页，用真实工作台截图做首屏，作为社群和社媒传播的稳定落地页。
- 保留 `scripts/capture_github_growth_metrics.ps1` 用于持续记录真实 Star、访问、克隆和社区反馈。
- 内部运营资料、渠道排期和发布文案从公开文档中撤出，后续只保留在本地私有工作目录。
