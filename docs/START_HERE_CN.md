# Fdesign 中文上手入口

如果你是从 V2EX、掘金、小红书、B 站或朋友转发第一次看到 Fdesign，可以按这页走。目标不是一次看完所有文档，而是先判断三件事：看不看得懂、能不能试跑、卡住后怎么反馈。

## 1. 先判断是不是你的场景

如果你还不确定自己的流程是否适合 Fdesign，先读 [Fdesign 中文适用场景](./USE_CASES_CN.md)。这页按主图多色号、多画板详情页、字段组合和本机 Photoshop 自动化链路拆解判断标准。
如果你已经能描述 PSD 结构、Excel 字段和图片命名规则，可以直接提交 [PSD 工作流适配反馈](https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml)。

Fdesign 适合这类工作：

- 同一套 PSD 模板要重复替换款号、色号、规格字段和商品图。
- 需要保留 PSD / PSB 源文件，同时批量导出 PNG / JPEG。
- 希望在本机 Windows + Photoshop 环境里跑，不把私有素材上传到云端。
- 想研究 React + Node.js + Photoshop JSX/VBS 的本地自动化链路。

如果你只是想要云端一键生图，或者没有本机 Photoshop，这个版本可能不适合直接使用。

## 2. 先看 3 个入口

| 你想做什么 | 入口 |
| --- | --- |
| 先看界面和流程 | [B 站演示视频](https://www.bilibili.com/video/BV1YDTA6nEeN/) / [工作流 GIF](./assets/fdesign-workflow-demo.gif) |
| GitHub 或 npm 访问慢 | [国内访问与试跑减阻](./CHINA_ACCESS_CN.md) |
| 先本地跑起来 | [中文快速试跑](./QUICKSTART_CN.md) |
| 先理解字段绑定 | [公开演示包](./demo-kit/README.md) / [最小 PSD 模板制作教程](./demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) |

建议顺序是：先看 GIF 或视频，再看公开演示包，最后按中文快速试跑启动项目。如果你还没跑到项目本身，只是卡在 GitHub 下载、npm 安装或端口启动，先看国内访问与试跑减阻。

## 3. 想看完整场景

如果你不确定 Fdesign 是否适合自己的 PSD 批量作图场景，可以先看公开净化案例库：

- [公开净化案例库](./showcases/README.md)
- [主图多色号批量导出](./showcases/MAIN_IMAGE_COLOR_VARIANTS_CN.md)
- [多画板详情页批量导出](./showcases/MULTI_ARTBOARD_BATCH_EXPORT_CN.md)
- [眼镜商品详情页批量套版](./showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md)

这些案例只使用公开截图、假数据和演示素材，不包含私有 PSD、真实商品图或运行产物。

## 4. 卡住时先看这里

| 卡点 | 入口 |
| --- | --- |
| GitHub 下载慢、npm 安装慢、不知道是否要先 clone | [国内访问与试跑减阻](./CHINA_ACCESS_CN.md) |
| npm、端口、后端健康检查、前端打不开 | [中文排障清单](./TROUBLESHOOTING_CN.md) |
| 图片未绑定、角度图错位、图层变量不识别 | [图片匹配和图层命名净化样例](./TROUBLESHOOTING_CN.md#51-图片匹配和图层命名净化样例) |
| `IDAT: incorrect data check`、Photoshop 静默吞任务、批量中途失败 | [Photoshop 导出失败净化样例](./TROUBLESHOOTING_CN.md#7-photoshop-导出失败净化样例) |
| 不确定自己的 PSD 结构是否适配 | [PSD 工作流适配反馈](https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml) |
| 不知道该提 Issue 还是 Discussion | [中文试跑讨论](https://github.com/Kriswd/Fdesign/discussions/8) |

提交反馈前，请把字段名、图片名、图层路径和截图换成公开安全的假数据，不要上传私有 PSD、真实商品图、账号信息、token 或后台截图。

## 5. 想参与改进

- 中文贡献指南：[docs/CONTRIBUTING_CN.md](./CONTRIBUTING_CN.md)
- 公开路线图：[docs/ROADMAP.md](./ROADMAP.md)
- 试跑反馈模板：[Quickstart feedback issue](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)
- 工作流适配反馈：[Workflow fit issue](https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml)
- Photoshop 导出样例收集：[Issue #10](https://github.com/Kriswd/Fdesign/issues/10)
- 图片匹配和图层命名样例收集：[Issue #15](https://github.com/Kriswd/Fdesign/issues/15)

如果 Fdesign 正好解决了你的重复作图问题，欢迎给 GitHub 仓库点一个 Star。更有价值的是，把你跑不通、看不懂或模板不适配的地方用净化信息反馈出来，这会直接决定下一轮文档和案例补什么。
