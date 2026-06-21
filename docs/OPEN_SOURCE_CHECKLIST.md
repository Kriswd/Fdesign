# 开源检查清单

更新日期：2026-06-16

## 本次已完成

- 版本展示统一为 `3.0`，前端标题、启动脚本与后台 `/health.version` 已对齐。
- 浏览器栏图标与首页左上角 Logo 统一使用 `public/fdesign-logo.svg`。
- 已提交 `LICENSE`、`.env.example`、`CONTRIBUTING.md` 与 `SECURITY.md`。
- 已移除私有生成脚本、策划资料、二进制文档、备份压缩包、临时工作目录和发布调试痕迹。
- `.gitignore` 已忽略运行输出、日志、环境文件、缓存、工作流截图、测试结果和 PSD/字体大文件。
- 已更新可自动修复的依赖审计项，并将 SheetJS 依赖切换到官方 0.20.3 分发包。
- 公开分支会使用净化后的历史发布，避免旧资料随可见性切换一并暴露。
- README 首屏已改为“Excel 商品数据 -> 批量 PSD 成品”的结果导向定位。
- 已新增 Demo、Roadmap、Launch Kit、Release Notes 与 GitHub Issue/Discussion 模板。
- 已新增 GitHub Pages 项目页 `https://kriswd.github.io/Fdesign/`，用于社群和社媒传播落地。
- 已补齐分发渠道清单、UTM 链接、跨平台发布文案、首月增长计划和 GitHub 指标采集脚本。
- 已补齐国内增长作战手册、国内 30 天内容排期、国内平台发布模板和国内渠道 scorecard。

## 店铺入口配置

- 首页顶部默认展示公开店铺选购入口：`https://pay.ldxp.cn/shop/FTIWLFHQ`。
- 如需更换店铺地址，通过 `VITE_SHOP_URL` 和 `VITE_SHOP_LINK_LABEL` 配置；`VITE_SHOP_URL` 不是 `http(s)` 地址时，前端会自动隐藏选购入口。

## 开源前必须确认

- 运行 `npm run lint`、`npm run build` 与 `npm test`。
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
- 基于第一批真实用户反馈，补充一套净化后的模板案例教程或 GIF 演示。
- 按 `docs/launch/first_30_days_growth_plan.md` 每周复盘渠道质量，而不是只看 Star 数。
- 国内推广优先按 `docs/launch/china_growth_playbook.md` 执行，每次发布后补 `docs/launch/china_growth_scorecard.md`。
