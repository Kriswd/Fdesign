# Fdesign V3 Launch Kit

## 国内电商设计师/运营首发

### 长文标题

我把电商 PSD 批量作图工作台开源了：Excel 数据一键生成批量 PSD 成品

### 长文正文

很多电商团队的图片生产不是“不会设计”，而是重复劳动太多：同一套 PSD 模板，要反复替换款号、色号、商品图、规格字段和导出格式。

Fdesign V3.0 现在开源了。它是一个本地运行的 Photoshop 自动化工作台：导入 PSD 模板，绑定 Excel 字段和商品图，再批量导出 PSD、PSB、PNG 和 JPEG。

它更适合这些场景：

- 一套详情页或主图模板，要套很多商品数据。
- 设计师希望保留 PSD 源文件，而不是只导出扁平图。
- 运营手里有 Excel，希望减少重复复制粘贴。
- 小团队想在本机处理模板和素材，不把私有素材传到云端。

项目要求也很明确：Windows 10/11、Node.js 18+、本机 Photoshop。仓库只包含应用代码，不分发 Photoshop、字体、模板素材或私有数据。

GitHub: https://github.com/Kriswd/Fdesign

如果这个方向对你有用，可以点个 Star。更欢迎把你的模板场景、导出问题或文档疑问提到 Issues / Discussions，我会优先把真实场景沉淀进路线图。

### 短帖

我把一个电商 PSD 批量作图工具开源了：Fdesign V3.0。

核心流程很简单：导入 PSD 模板 -> 绑定 Excel 字段和商品图 -> 调 Photoshop 批量导出 PSD/PSB/PNG/JPEG。

它不是云端作图服务，而是给电商设计师/运营在本机跑的自动化工作台。需要 Windows + Photoshop。

GitHub: https://github.com/Kriswd/Fdesign

如果你也被重复改图折磨过，欢迎 Star 或提真实模板场景。

## 社群版消息

我最近把 Fdesign V3.0 开源了，主要解决电商图片生产里“Excel 商品数据批量套 PSD 模板”的重复劳动。

适合：详情页/主图模板、款号色号批量替换、需要保留 PSD 源文件的本地生产流程。

仓库地址：https://github.com/Kriswd/Fdesign

如果群里有电商设计、运营或做 Photoshop 自动化的朋友，欢迎试试。也欢迎把看不懂/跑不起来/模板不适配的地方提 issue，我会按真实场景改文档和路线图。

## English short summary

Fdesign V3.0 is an open-source local workbench for ecommerce PSD automation. It turns Excel product data and product images into batch PSD/PSB/PNG/JPEG deliverables through a Windows + Photoshop workflow.

GitHub: https://github.com/Kriswd/Fdesign

The project is useful for ecommerce designers, operators, and developers who need repeatable PSD template production without uploading private assets to a cloud service.

## 发布节奏

| 时间 | 动作 | 目标 |
| --- | --- | --- |
| Day 0 | GitHub Release + README 首屏 + 国内设计/运营社群首发 | 获取第一批真实访问和问题 |
| Day 1-3 | 发掘金/公众号/朋友圈短帖，收集运行阻塞 | 修 README 与 quick start |
| Day 7 | 汇总首批 issue，补一个真实案例教程 | 提升转化和信任 |
| Day 14 | 面向开发者平台发布技术拆解 | 承接 Photoshop 自动化搜索流量 |
| Day 30 | 复盘 star、views、clones、issues、discussion | 决定下一轮案例/GIF/视频 |

## Star 转化复盘

| 日期 | Stars | Unique views | Unique clones | 发布渠道 | 新 issue/discussion | 结论 |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| 2026-06-16 | 0 | 待复查 | 待复查 | README/Release 准备 | 0 | 基线日 |

## 发布注意

- 不夸大效率，不写未经验证的节省时间数字。
- 不把店铺服务作为开源首屏主 CTA。
- 不发布私有模板、私有数据、敏感业务资料或私有素材。
- 所有公开截图必须来自已净化的公开演示界面。
