# Fdesign 公开净化案例库

这个目录用于放公开安全的 Fdesign 使用案例。案例的目标是帮助第一次接触项目的人快速判断：Fdesign 是否适合自己的 PSD 批量作图场景，以及应该如何把模板、Excel 字段、商品图和导出格式拆开。

这里的案例只使用公开截图、假数据、演示 SVG 或授权明确的素材，不包含私有 PSD、真实商品图、敏感业务资料、账号后台或运行产物。

## 已有案例

| 案例 | 适合判断的问题 | 公开资产 |
| --- | --- | --- |
| [眼镜商品详情页批量套版](./EYEWEAR_DETAIL_WORKFLOW_CN.md) | 字段、图片变量、商品位绑定和 PSD / PSB / PNG / JPEG 导出如何组成一个完整电商详情页工作流 | 公开工作台截图、`docs/demo-kit/` 假数据、SVG 示例图 |

## 推荐阅读顺序

1. 先看 [眼镜商品详情页批量套版](./EYEWEAR_DETAIL_WORKFLOW_CN.md)，理解一个完整场景如何拆成字段、图片变量和导出目标。
2. 再看 [公开演示包](../demo-kit/README.md)，对照 CSV、字段映射 JSON 和图片清单。
3. 如果要自己试跑，按 [最小 PSD 模板制作教程](../demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) 从零做一个本机测试模板。
4. 如果启动、图片匹配或 Photoshop 导出卡住，按 [中文排障清单](../TROUBLESHOOTING_CN.md) 准备净化后的错误摘要。

## 后续最值得补的案例

- 电商主图多色号批量导出。
- 多画板详情页批量导出。
- 活动图或社媒图批量改字段。
- Photoshop 导出失败的最小复现案例。
- 图片匹配失败的净化复现案例。

## 提交你自己的净化案例

可以按 [净化案例提交指南](../SHOWCASE_GUIDE.md) 处理字段、截图和素材，然后通过这些入口提交：

- [Template showcase issue](https://github.com/Kriswd/Fdesign/issues/new?template=template_showcase.yml)
- [中文试跑反馈](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)
- [中文试跑讨论](https://github.com/Kriswd/Fdesign/discussions/8)

如果不确定内容是否适合公开，先只描述字段结构、变量关系和报错摘要，不上传素材文件。
