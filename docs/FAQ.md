# Fdesign FAQ

## Fdesign 是什么？

Fdesign 是一个本地 Photoshop 自动化工作台，用来把 Excel 商品数据、商品图和 PSD 模板变量绑定起来，再批量导出 PSD、PSB、PNG 与 JPEG。

它更像一个“PSD 批量生产工作台”，不是云端图片生成服务，也不是 Photoshop 的替代品。

## 第一次应该看哪里？

建议按这个顺序：

1. 先看 README 首屏和项目页，确认是否符合你的场景。
2. 如果想先看界面流转，可以看 [B站演示视频](https://www.bilibili.com/video/BV1YDTA6nEeN/)。
3. 如果想判断是否符合自己的 PSD 批量作图场景，可以看 [公开净化案例库](./showcases/README.md) 和 [眼镜商品详情页批量套版案例](./showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md)。
4. 按 [中文快速试跑](./QUICKSTART_CN.md) 确认 Node.js、前后端端口、后端健康检查和本机 Photoshop。
5. 打开 [Demo walkthrough](./DEMO.md)，理解主工作流。
6. 打开 [公开演示包](./demo-kit/README.md)，查看 `sample-products.csv`、`field-map.example.json` 和 `image-manifest.json`。
7. 按 [最小 PSD 模板制作教程](./demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) 做一个本机测试模板，先跑一条记录。
8. 如果启动、端口、图片匹配或 Photoshop 导出卡住，按 [中文排障清单](./TROUBLESHOOTING_CN.md) 逐项定位。
9. 最小模板跑通后，再把同样的绑定方法迁移到真实 PSD 模板。

## 运行需要什么？

- Windows 10/11 x64
- Node.js 18+
- 本机已安装且可被脚本调用的 Adobe Photoshop

仓库不分发 Photoshop、字体、PSD 模板素材、真实商品素材或导出产物。

## 可以在 macOS 或 Linux 上跑吗？

当前公开版本优先支持 Windows + 本机 Photoshop 调度链路。macOS 和 Linux 不是当前验证目标，尤其是 Photoshop 脚本调度、路径和导出行为需要单独适配。

## 为什么没有直接附带 PSD 模板？

PSD 模板通常涉及字体、图片素材和授权边界。为了让开源仓库保持干净，公开仓库只提供净化演示数据和 SVG 示例图。你可以按 [最小 PSD 模板制作教程](./demo-kit/MINIMAL_PSD_TEMPLATE_CN.md)，根据 `docs/demo-kit/field-map.example.json` 自己创建一个简化 PSD 模板来试跑字段绑定。

## Excel 字段怎么绑定到 PSD 变量？

可以先看 `docs/demo-kit/field-map.example.json`：

- `textVariables` 表示 PSD 文本变量和 Excel 列的对应关系。
- `imageVariables` 表示 PSD 图片变量和 Excel 中图片路径列的对应关系。
- `outputNaming` 展示如何用字段组合导出目录和文件名。

真实项目中，建议先让 PSD 变量名保持稳定，再逐步增加规则链。

## 图片匹配失败通常怎么排查？

先检查这几件事：

- Excel 中的图片路径是否真实存在。
- 款号、色号、角度命名是否和图片文件名一致。
- PSD 图片变量是否已经绑定到正确字段。
- 同一张图片是否被多个变量使用但参考线不一致。

如果需要提 issue，请尽量提供净化后的字段样例、图片命名样例和失败提示，不要上传私有素材。

## Photoshop 导出失败通常怎么排查？

先确认：

- 后端健康检查 `http://127.0.0.1:3001/health` 可访问。
- Photoshop 已安装并能被脚本调用。
- PSD 文件没有被其它程序锁定。
- 导出目录可写，路径里没有异常字符。
- 复杂模板先用单条记录测试，再批量导出。

如果失败信息里有 job id、日志路径或错误码，可以把净化后的错误摘要发到 issue。

如果你是按中文快速试跑文档第一次启动项目，可以直接使用 [中文试跑反馈模板](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)，这样环境、启动步骤和脱敏信息会更完整。
更细的依赖、端口、健康检查、图片匹配和 Photoshop 导出排查步骤，可以看 [中文排障清单](./TROUBLESHOOTING_CN.md)，其中已经补了 `IDAT: incorrect data check`、Photoshop 静默吞任务、批量中途失败和 PSD/PSB 保存失败的净化样例。

## 可以把真实模板或截图发到 issue 吗？

可以，但请先净化：

- 删除真实商品图片、品牌敏感字段和私有数据。
- 保留能复现问题的最小字段、图层命名和错误信息。
- 如果模板不能公开，建议只贴图层结构、变量名、字段映射和错误摘要。

## 店铺入口和开源功能是什么关系？

开源功能可以直接本地运行。顶部店铺入口只是次级服务入口，用于需要模板定制、部署协助或成品服务的场景。开发者和普通试用者可以只使用开源仓库。

## 我能贡献什么？

最有价值的贡献通常是：

- 复现清楚的 bug report。
- 净化后的 PSD 模板结构或字段映射案例。
- 快速开始、FAQ、错误排查和示例数据改进。
- Windows + Photoshop 导出链路的稳定性反馈。
