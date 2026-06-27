# Fdesign 公开分享包

这个文件给想介绍、转发或引用 Fdesign 的朋友使用。内容只包含公开安全的信息、截图和链接，不包含私有素材、运行产物或不可公开的信息。

## 一句话介绍

闪图 Fdesign V3.0 是一个开源的 Windows + 本机 Photoshop PSD 批量作图工作台，可以把 Excel 商品数据、商品图和 PSD 模板变量绑定起来，再批量导出 PSD / PSB / PNG / JPEG。

## 短介绍

Fdesign 适合电商设计师、运营和自动化开发者。它不是云端图片生成服务，而是本机 Photoshop 自动化工作台：先导入 PSD 模板，再绑定 Excel 字段和商品图，最后批量导出 PSD、PSB、PNG 和 JPEG 成品。

第一次了解项目，可以先看项目页、B站演示、公开演示包和案例库；第一次试跑，建议从中文快速试跑和最小 PSD 模板教程开始。

## 可复制短文案

### 作品分享版

```text
我最近看到一个开源工具 Fdesign：用 Windows + 本机 Photoshop，把 Excel 商品数据和商品图批量套进 PSD 模板，再导出 PSD / PSB / PNG / JPEG。

项目页：https://kriswd.github.io/Fdesign/
GitHub：https://github.com/Kriswd/Fdesign
演示包：https://github.com/Kriswd/Fdesign/tree/main/docs/demo-kit
案例库：https://github.com/Kriswd/Fdesign/tree/main/docs/showcases
```

### 技术分享版

```text
Fdesign 是一个 React + Node.js + Photoshop JSX/VBS 的本地自动化项目。它把 PSD 模板变量、Excel 字段、商品图匹配和 Photoshop 批量导出串成一个工作台，适合研究 PSD 批量作图、模板变量绑定和本机图像生产流程。

GitHub：https://github.com/Kriswd/Fdesign
架构说明：https://github.com/Kriswd/Fdesign/blob/main/docs/ARCHITECTURE.md
Demo：https://github.com/Kriswd/Fdesign/blob/main/docs/DEMO.md
```

### 试跑邀请版

```text
如果你做过 PSD 批量套版或商品图批量导出，可以帮忙试跑 Fdesign：

1. 先看 B站演示或公开案例库，判断是不是你的场景。
2. 按中文快速试跑确认 Node.js、前后端端口和本机 Photoshop。
3. 如果卡住，用中文反馈模板提交净化后的错误摘要。

中文快速试跑：https://github.com/Kriswd/Fdesign/blob/main/docs/QUICKSTART_CN.md
中文排障清单：https://github.com/Kriswd/Fdesign/blob/main/docs/TROUBLESHOOTING_CN.md
试跑反馈：https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml
```

## 常用公开链接

- 项目页：<https://kriswd.github.io/Fdesign/>
- GitHub 仓库：<https://github.com/Kriswd/Fdesign>
- B站演示：<https://www.bilibili.com/video/BV1YDTA6nEeN/>
- V3.0 Release：<https://github.com/Kriswd/Fdesign/releases/tag/v3.0.0>
- 中文快速试跑：<https://github.com/Kriswd/Fdesign/blob/main/docs/QUICKSTART_CN.md>
- 中文排障清单：<https://github.com/Kriswd/Fdesign/blob/main/docs/TROUBLESHOOTING_CN.md>
- FAQ：<https://github.com/Kriswd/Fdesign/blob/main/docs/FAQ.md>
- 公开演示包：<https://github.com/Kriswd/Fdesign/tree/main/docs/demo-kit>
- 最小 PSD 模板教程：<https://github.com/Kriswd/Fdesign/blob/main/docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md>
- 公开净化案例库：<https://github.com/Kriswd/Fdesign/tree/main/docs/showcases>
- 眼镜商品详情页案例：<https://github.com/Kriswd/Fdesign/blob/main/docs/showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md>
- 中文试跑讨论：<https://github.com/Kriswd/Fdesign/discussions/8>

## 可用公开素材

- 首页分享图：[`docs/assets/fdesign-social-card.png`](./assets/fdesign-social-card.png)
- 工作台截图：[`docs/assets/fdesign-workbench-showcase.png`](./assets/fdesign-workbench-showcase.png)
- README 工作台截图：[`public/screenshots/fdesign-workbench-showcase.png`](../public/screenshots/fdesign-workbench-showcase.png)
- 产品 Logo：[`docs/assets/fdesign-logo.svg`](./assets/fdesign-logo.svg)
- 最小 PSD 绑定关系图：[`docs/demo-kit/assets/minimal-psd-binding-flow.svg`](./demo-kit/assets/minimal-psd-binding-flow.svg)

## 推荐配图说明

配图优先使用工作台截图，因为它能同时展示 PSD 画布预览、商品位绑定、Excel 数据控制台和导出入口。介绍字段关系时，使用最小 PSD 绑定关系图；介绍完整场景时，使用公开净化案例库。

## 公开边界

介绍或转发 Fdesign 时，请保持这些边界：

- 不上传私有 PSD、真实商品图、账号信息、token、后台截图或敏感业务资料。
- 不使用未经验证的效率数字。
- 不把 Fdesign 说成 Photoshop 替代品。
- 不把它说成云端图片生成服务。
- 不引导别人提交无法公开授权的素材。
- 如果只是想试跑，请先用公开演示包和最小 PSD 模板教程。

## 推荐提问

如果你把 Fdesign 分享给目标用户，可以优先问这些问题：

- 第一次看项目，最看不懂的是 PSD 变量、Excel 字段，还是 Photoshop 导出链路？
- 公开演示包是否足够理解字段绑定？
- 案例库里还需要补主图、多画板、活动图，还是导出失败复现？
- 你的 PSD 批量作图流程最容易卡在图片匹配、图层命名，还是导出稳定性？
