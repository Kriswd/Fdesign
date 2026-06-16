# Fdesign V3.0 Post Templates

更新日期：2026-06-16

这些文案可以直接复制后按平台微调。发布前再次确认截图不含真实业务数据、私有模板、付费字体或内部业务信息。

## V2EX

标题：

```text
开源了一个本地 Photoshop 工作台：Excel 商品数据批量生成 PSD/PNG/JPEG
```

正文：

```markdown
最近把 Fdesign V3.0 开源了。

它解决的是一个很具体的电商作图流程：同一套 PSD 详情页/主图模板，需要反复替换款号、色号、商品图、规格字段，再导出 PSD、PSB、PNG 或 JPEG。

Fdesign 的做法是：

1. 在浏览器工作台导入 PSD 模板
2. 绑定 Excel 字段和商品图
3. 调用本机 Photoshop 批量导出成品

它不是云端作图服务，要求 Windows 10/11 + Node.js 18+ + 本机 Photoshop。仓库只包含应用代码，不分发 Photoshop、模板素材、字体或真实业务数据。

项目页：https://kriswd.github.io/Fdesign/?utm_source=v2ex&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=share_creation
GitHub：https://github.com/Kriswd/Fdesign

我想优先收集三类反馈：

- README 的快速开始是否足够清楚
- 真实 PSD 模板里哪些变量/图层最容易出问题
- Photoshop 批量导出失败时还缺哪些诊断信息

如果这个方向对你有用，欢迎试跑、提 issue，或者给仓库一个 Star。
```

## 掘金

标题：

```text
我把电商 PSD 批量作图工作台开源了：React + Node.js 调 Photoshop 的本地自动化实践
```

摘要：

```text
Fdesign V3.0 是一个本地运行的 Photoshop 自动化工作台：导入 PSD 模板，绑定 Excel 商品字段和商品图，再批量导出 PSD/PSB/PNG/JPEG。文章记录开源定位、技术链路、Photoshop 调度边界和公开仓库净化过程。
```

文章结构：

```markdown
## 为什么不是再做一个云端作图工具

## 核心流程：Excel 商品数据 -> PSD 模板变量 -> Photoshop 导出

## 前端工作台：PSD 预览、变量绑定和数据控制台

## 后端调度：Node.js 如何把导出任务交给 Photoshop

## 开源前做了哪些净化

## 当前限制：Windows + Photoshop、本地素材、模板兼容性

## 项目地址和下一步 Roadmap
```

结尾：

```markdown
项目页：https://kriswd.github.io/Fdesign/?utm_source=juejin&utm_medium=article&utm_campaign=fdesign_v3_launch&utm_content=technical_breakdown
GitHub：https://github.com/Kriswd/Fdesign

如果你也在做 Photoshop 自动化、电商批量图或 PSD 模板生产，欢迎提 issue 或分享一个已净化的模板场景。
```

## 国内社群短帖

```text
我把之前做的电商 PSD 批量作图工作台 Fdesign V3.0 开源了。

适合这种流程：Excel 商品数据 + 商品图 + PSD 模板 -> 批量导出 PSD/PSB/PNG/JPEG。

它是本地跑的，不上传素材到云端；要求 Windows + Photoshop + Node.js。

项目页：https://kriswd.github.io/Fdesign/?utm_source=private_community&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=ecommerce_designers
GitHub：https://github.com/Kriswd/Fdesign

现在最想收集真实模板场景和首次运行问题。如果你身边有做电商设计、运营套图或 Photoshop 自动化的朋友，可以转给他看看。
```

## Hacker News

Title:

```text
Show HN: Fdesign – local Photoshop workbench for batch ecommerce PSDs
```

URL:

```text
https://github.com/Kriswd/Fdesign
```

First comment:

```markdown
Hi HN, I made Fdesign, an open-source local workbench for a very specific Photoshop automation workflow: turn Excel product data and product images into batch PSD/PSB/PNG/JPEG deliverables.

The target users are ecommerce designers, operators, and small teams who already have PSD templates and need to repeatedly produce product detail pages or marketplace images without uploading private assets to a cloud service.

It currently requires Windows, Node.js 18+, and a local Photoshop installation. The repo does not include Photoshop, paid fonts, private templates, or sample private business data.

I would especially appreciate feedback on the quick start, the Photoshop automation boundary, and whether the README makes the use case clear to someone who has not seen this ecommerce workflow before.
```

HN 注意：不要请朋友 upvote/comment。只回复真实问题。

## Product Hunt

Name:

```text
Fdesign
```

Tagline:

```text
Batch ecommerce PSDs from Excel and Photoshop
```

Primary URL:

```text
https://kriswd.github.io/Fdesign/
```

Description:

```text
Fdesign is an open-source local workbench for ecommerce PSD automation. Import a PSD template, bind Excel product fields and product images, then batch export PSD, PSB, PNG, and JPEG deliverables through a Windows + Photoshop workflow.
```

First comment:

```markdown
Hey Product Hunt, I built Fdesign for a very specific design operations problem: ecommerce teams often need to produce many PSD-based product images from the same template, while keeping source files local.

Fdesign V3.0 is now open source. It runs locally, uses a browser workbench for PSD preview and data binding, then calls Photoshop on the machine to export the final assets.

Best fit:

- Ecommerce designers with repeat PSD templates
- Operators maintaining Excel product data
- Automation developers exploring Photoshop scripting

Current limits:

- Windows + local Photoshop required
- No bundled private templates, fonts, or Photoshop itself
- Still early; real template compatibility feedback is valuable

I would love feedback on the onboarding, README, and which workflow examples would make the project easier to evaluate.
```

## Reddit

Title:

```text
I open-sourced a local Photoshop automation workbench for batch ecommerce PSDs
```

Body:

```markdown
Disclosure: I am the maker of this project.

Fdesign is an open-source local workbench for a specific Photoshop automation workflow: importing a PSD template, binding Excel product fields and product images, and batch exporting PSD/PSB/PNG/JPEG deliverables.

It is not a SaaS tool and it does not upload private assets. It currently requires Windows, Node.js 18+, and a local Photoshop installation.

Repo: https://github.com/Kriswd/Fdesign
Project page: https://kriswd.github.io/Fdesign/?utm_source=reddit&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=transparent_maker_post

I am looking for feedback on the technical approach and onboarding docs, especially from people who have dealt with Photoshop scripting or batch image production.
```

Reddit 注意：先读 subreddit 规则，只投和 Photoshop automation、design tools、open source tooling 相关的社区。

## B 站 / 视频号短视频脚本

```text
标题：把 Excel 商品数据批量套进 PSD，我把这个 Photoshop 工作台开源了

开场 3 秒：
同一套电商 PSD 模板，要反复替换款号、色号、商品图和规格字段，最烦的是还要保留 PSD 源文件。

中段：
Fdesign V3.0 现在开源了。它在本地浏览器里预览 PSD，绑定 Excel 字段和商品图，然后调用本机 Photoshop 批量导出 PSD、PSB、PNG、JPEG。

限制：
它不是云端作图服务，需要 Windows + Photoshop + Node.js，也不包含任何私有模板、字体或素材。

结尾：
项目页和 GitHub 放在简介/评论。如果你也做电商套图、PSD 自动化，欢迎试跑或者提真实模板问题。
```
