# Fdesign 净化演示包

这个目录提供一套可公开查看的 synthetic demo data，用来说明 Fdesign 如何把商品表、字段映射和商品图变量组织到一个 PSD 自动填充任务里。

演示包不包含私有模板、真实商品素材或运行产物，也不包含 Photoshop、字体或任何第三方授权资源。

## 文件

- `sample-products.csv`：4 行净化商品数据，覆盖款号、色号、规格、图片变量和标题字段。
- `field-map.example.json`：示例字段映射，展示 Excel 列如何绑定到 PSD 文本变量和图片变量。
- `image-manifest.json`：示例图片清单，说明每张图对应的商品、色号、角度和本地路径。
- `images/*.svg`：可公开托管的简化眼镜示意图，仅用于演示变量替换流程。
- `MINIMAL_PSD_TEMPLATE_CN.md`：从零创建一个最小 PSD 模板的中文教程，用于第一次试跑字段绑定。
- `assets/minimal-psd-binding-flow.svg`：公开安全的绑定关系图，用于说明图层名、商品位和 CSV 字段如何对应。

## 建议用法

1. 按 README 启动前端和后端。
2. 按 [最小 PSD 模板制作教程](./MINIMAL_PSD_TEMPLATE_CN.md) 准备一个只含少量变量的测试 PSD，或根据 `field-map.example.json` 在模板中创建同名变量。
3. 导入 `sample-products.csv`，再把 `images/` 里的 SVG 示例图绑定到图片变量。
4. 先导出单条记录验证字段，再批量导出完整数据。

## 字段边界

这套数据只用于公开演示和文档截图。真实使用时，请替换为你自己的模板、图片和 Excel 数据，并在提交 issue 或截图前移除敏感内容。
