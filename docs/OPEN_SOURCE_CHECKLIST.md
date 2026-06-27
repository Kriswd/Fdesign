# 开源检查清单

更新日期：2026-06-28

## 本次已完成

- 版本展示统一为 `3.0`，前端标题、启动脚本与后台 `/health.version` 已对齐。
- 浏览器栏图标与首页左上角 Logo 统一使用 `public/fdesign-logo.svg`。
- 已提交 `LICENSE`、`.env.example`、`CONTRIBUTING.md` 与 `SECURITY.md`。
- 已移除私有生成脚本、策划资料、二进制文档、备份压缩包、临时工作目录和发布调试痕迹。
- `.gitignore` 已忽略运行输出、日志、环境文件、缓存、工作流截图、测试结果和 PSD/字体大文件。
- 已更新可自动修复的依赖审计项，并将 SheetJS 依赖切换到官方 0.20.3 分发包。
- 公开分支会使用净化后的历史发布，避免旧资料随可见性切换一并暴露。
- README 首屏已改为“Excel 商品数据 -> 批量 PSD 成品”的结果导向定位。
- 已新增 Demo、公开演示包、Roadmap、Release Notes 与 GitHub Issue/Discussion 模板。
- 已新增 `docs/START_HERE_CN.md`，用于承接国内社区、文章和朋友转发过来的首次访问者，按演示、试跑、案例和反馈分流。
- 已新增 `docs/USE_CASES_CN.md`，用于回答国内用户常见的“我的 PSD 批量作图流程是否适合 Fdesign”。
- 已新增 `docs/llms.txt`，用于给搜索、AI 摘要和社区转发场景提供机器可读的公开项目摘要。
- 已新增 `docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md`，用于指导用户用公开演示数据从零制作最小 PSD 测试模板。
- 最小 PSD 教程已嵌入公开安全的绑定关系图和主工作流截图，避免首批用户只看到空态说明。
- 已新增 `docs/assets/fdesign-workflow-demo.gif`，并嵌入 README、GitHub Pages 与 Demo 文档，用公开截图讲清 PSD 模板预览、图片变量替换、Excel 字段绑定和批量导出路径。
- 已新增 `docs/showcases/README.md` 与 `docs/showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md`，作为公开净化案例库和第一个电商详情页案例。
- 已新增 `docs/showcases/MAIN_IMAGE_COLOR_VARIANTS_CN.md`，用于承接同款多色主图批量导出的常见场景。
- 已新增 `docs/showcases/MULTI_ARTBOARD_BATCH_EXPORT_CN.md`，用于承接多画板详情页批量导出和画板变量组织场景。
- 已新增 `docs/TROUBLESHOOTING_CN.md`，用于承接国内用户首次启动、端口、图片匹配和 Photoshop 导出排障。
- 已在 `docs/TROUBLESHOOTING_CN.md` 补充图片匹配和图层命名净化样例，覆盖图片未绑定、角度错位、商品位复用、变量未识别和字段错列。
- 已在 `docs/TROUBLESHOOTING_CN.md` 补充 Photoshop 导出失败净化样例，覆盖 `IDAT: incorrect data check`、静默吞任务、批量中途失败和 PSD/PSB 保存失败。
- 已新增 `docs/SHOWCASE_GUIDE.md`，用于指导用户提交公开安全的净化模板案例和最小复现。
- 已新增 GitHub Pages 项目页 `https://kriswd.github.io/Fdesign/`，用于社群和社媒传播落地。
- GitHub Pages 顶部导航已加入“选购服务”入口，店铺仍作为次级服务入口，不影响开源本地试跑。
- `package.json` 包名已从旧工程名收敛为 `fdesign`，并补充 PSD/Photoshop/Excel 自动化关键词。
- 已保留 `scripts/capture_github_growth_metrics.ps1` 用于本地记录真实 Star、访问、克隆和社区反馈。
- 已新增 `npm run verify:public-surface`，用于发布前检查公开入口、GitHub 模板和增长设置脚本，防止内部发布材料或具体私有数据类别误入公开面。
- 内部运营、渠道排期、发布文案和复盘资料不得提交到公开仓库；本地只放在 `private/` 或 `internal/`。

## 店铺入口配置

- 首页顶部默认展示公开店铺选购入口：`https://pay.ldxp.cn/shop/FTIWLFHQ`。
- 如需更换店铺地址，通过 `VITE_SHOP_URL` 和 `VITE_SHOP_LINK_LABEL` 配置；`VITE_SHOP_URL` 不是 `http(s)` 地址时，前端会自动隐藏选购入口。

## 开源前必须确认

- 运行 `npm run verify:public-surface`、`npm run lint`、`npm run build` 与 `npm test`。
- 启动前后端，检查前端界面和 `/health` 的真实响应。
- 用 Git 跟踪列表复查公开树，不要包含模板素材、字体、运行输出、日志、真实环境变量或私有资料。
- 确认 README 中的运行条件仍准确，尤其是 Photoshop 宿主依赖边界。
- 确认 GitHub Releases、Topics、Labels、Issues 与 Discussions 均指向公开仓库，并且不含私有素材或敏感业务资料。
- 确认 GitHub Pages 可访问，项目页首屏截图、Logo、GitHub/Star CTA 和店铺次级入口均正常。
- 发布后运行 `scripts/capture_github_growth_metrics.ps1`，记录 Star、Views、Clones、Issue/Discussion、Release 与 Pages 的基线数据。

## 后续优化

- 给后台管理和任务模板导入导出补充更稳定的 Playwright 主流程烟测。
- 将版本展示继续收敛到自动生成流程，减少手工发布步骤。
- 为 `/health` 增加构建 commit 和构建时间，方便定位运行版本。
- 基于第一批真实用户反馈，继续补充图片匹配、图层命名和字段映射的净化复现案例。
- 基于第一批真实用户反馈，继续补充更多 Photoshop 导出失败的净化复现案例和 FAQ。
- 每周用 GitHub traffic、clones、issues 和真实反馈复盘公开页与 README 转化质量，而不是只看 Star 数。
