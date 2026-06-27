# Fdesign 净化案例提交指南

这份指南用于提交公开安全的 Fdesign 模板案例、工作流复盘或故障最小复现。目标是让其他用户看懂你的 PSD 批量作图场景，同时不暴露私有素材、敏感业务资料或账号信息。

## 适合提交什么

- 一个电商主图、详情页、活动图或社媒图的 PSD 批量作图流程。
- 一组 Excel 字段如何映射到 PSD 文本变量、图片变量和导出命名。
- 一次 Photoshop 导出失败的最小复现步骤。
- 一个能帮助别人避坑的图层命名、图片匹配或字段整理经验。

## 不要提交什么

- 私有 PSD 模板原文件。
- 真实商品图、敏感业务资料、内部沟通记录、账号后台截图。
- 商用字体、付费素材、授权不清的图片。
- 含有手机号、地址、token、cookie、账号、支付信息的日志或截图。

## 推荐的净化方式

1. 把款号、色号、品牌名替换成假数据，例如 `FDX1001`、`C10`、`Demo Brand`。
2. 把真实商品图替换为自制 SVG、色块图或可公开授权图片。
3. 只保留必要字段，删除价格、供应商、敏感业务字段和内部备注。
4. 截图前检查浏览器地址栏、文件路径、聊天窗口、账号头像和后台信息。
5. 如果要描述 PSD 结构，用文字说明图层名和变量关系，不上传原始 PSD。

## 最小案例格式

可以按下面结构发到 Issue 或 Discussion：

```text
案例类型：
主图 / 详情页 / 活动图 / 社媒图 / 其他

目标：
我想把哪些 Excel 字段和商品图批量套入 PSD 模板？

输入字段：
- style_no: FDX1001
- color_no: C10
- title: Demo optical frame
- image_front: images/FDX1001-C10-front.svg
- image_side: images/FDX1001-C10-side.svg

PSD 变量：
- 文本变量：model_no, color_no, product_title
- 图片变量：product_front, product_side

输出格式：
PSD / PSB / PNG / JPEG

遇到的问题：
图片匹配失败 / 文本溢出 / Photoshop 导出失败 / 字段映射看不懂

可公开附件：
净化截图、假数据 CSV、字段映射 JSON、错误摘要
```

## 可以直接参考的公开演示包

- [公开演示包](./demo-kit/README.md)
- [公开净化案例库](./showcases/README.md)
- [净化案例：眼镜商品详情页批量套版](./showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md)
- [示例 CSV](./demo-kit/sample-products.csv)
- [字段映射示例](./demo-kit/field-map.example.json)
- [图片清单](./demo-kit/image-manifest.json)

## 提交入口

- [Template showcase issue](https://github.com/Kriswd/Fdesign/issues/new?template=template_showcase.yml)
- [中文试跑反馈](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)
- [中文试跑讨论](https://github.com/Kriswd/Fdesign/discussions/8)

如果你不确定内容是否适合公开，先只描述字段结构和报错摘要，不上传素材文件。
