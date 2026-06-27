# 净化案例：眼镜商品详情页批量套版

这个案例用于说明 Fdesign 适合处理什么样的电商 PSD 批量作图场景。它只使用公开截图和 `docs/demo-kit/` 中的净化演示数据，不包含私有 PSD、真实商品图、敏感业务资料或账号后台内容。

![闪图 Fdesign 工作台截图](../../public/screenshots/fdesign-workbench-showcase.png)

## 场景

同一套眼镜商品详情页 PSD 模板，需要为不同款号和色号反复替换：

- 商品标题、款号、色号、系列、年份。
- 材质、镜片类型、镜宽、鼻梁宽、镜腿长、重量等规格字段。
- 正面图、侧面图、细节图。
- 导出给后续设计或运营使用的 PSD / PSB / PNG / JPEG。

过去这些字段通常靠手工复制粘贴和逐图替换完成。Fdesign 的目标是把这条链路收敛成一次模板绑定和多行数据批量导出。

## 输入数据

示例 CSV 来自 [sample-products.csv](../demo-kit/sample-products.csv)：

| sku | style_no | color_no | category | frame_material | hero_image |
| --- | --- | --- | --- | --- | --- |
| FDX1001-C10 | FDX1001 | C10 | optical | acetate | images/FDX1001-C10-front.svg |
| FDX1001-C20 | FDX1001 | C20 | optical | acetate | images/FDX1001-C20-front.svg |
| FDX1002-C10 | FDX1002 | C10 | sunglasses | metal | images/FDX1002-C10-front.svg |
| FDX1002-C30 | FDX1002 | C30 | sunglasses | metal | images/FDX1002-C30-front.svg |

示例图片来自 [image-manifest.json](../demo-kit/image-manifest.json)，全部是公开安全的 SVG 演示资产。

## PSD 变量绑定

字段映射来自 [field-map.example.json](../demo-kit/field-map.example.json)。第一次试跑建议先保持变量名和字段名尽量接近，排查成本最低。

| PSD 变量 | 数据来源 | 用途 |
| --- | --- | --- |
| `title` | `title` | 商品主标题 |
| `sku` | `sku` | 唯一商品记录 |
| `model_no` | `style_no` | 款号 |
| `color_no` | `color_no` | 色号 |
| `material` | `frame_material` | 镜框材质 |
| `lens_type` | `lens_type` | 镜片类型 |
| `frame_width` | `frame_width_mm` | 镜框宽度 |
| `lens_width` | `lens_width_mm` | 镜片宽度 |
| `bridge` | `bridge_mm` | 鼻梁宽度 |
| `temple` | `temple_mm` | 镜腿长度 |
| `hero_image` | `hero_image` | 主视觉商品图 |
| `side_image` | `side_image` | 侧面商品图 |
| `detail_image` | `detail_image` | 细节商品图 |

如果你还没有可公开的 PSD，可以先按 [最小 PSD 模板制作教程](../demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) 做一个本机测试模板，再把同样的变量绑定方式迁移到真实模板。

## 工作流

1. 在 Fdesign 中导入 PSD 模板。
2. 在模板配置里创建商品位，例如 `商品位 1`。
3. 把文本变量和图片变量添加到商品位。
4. 上传或参考公开 CSV，把字段绑定到对应变量。
5. 先选择一条记录做单条预览，确认画布、商品位和数据控制台都能联动。
6. 批量选择多条记录，导出 PSD / PSB / PNG / JPEG。

第一次跑通后，界面至少应该出现四个关键区域：

- 左侧 PSD 画布预览。
- 当前图片变量或商品图选择区。
- 右侧商品位和数据绑定区。
- 底部 Excel/CSV 数据控制台。

如果仍停在空态，优先回到 [中文快速试跑](../QUICKSTART_CN.md) 和 [中文排障清单](../TROUBLESHOOTING_CN.md) 检查模板入库、商品位创建和后端健康状态。

## 导出结果

这个案例的导出目标不是生成云端图片，而是在本机 Photoshop 链路里保留可继续编辑和交付的文件：

- `PSD`：适合继续编辑和交付源文件。
- `PSB`：适合大尺寸或复杂模板的兜底导出。
- `PNG` / `JPEG`：适合预览、上传或交给运营检查。

如果你只想先验证字段绑定，可以先导出 PNG 或 JPEG；等字段、图片和画布都正确后，再尝试 PSD / PSB。

## 可公开反馈什么

适合公开到 Issue 或 Discussion 的内容：

- 净化后的字段名和变量名。
- 用假数据复现的 CSV / JSON 映射。
- 不含真实商品和敏感业务信息的工作台截图。
- Photoshop 导出失败的净化错误摘要。
- 模板变量识别、图片匹配、导出稳定性相关的最小复现步骤。

不要公开：

- 私有 PSD 原文件。
- 真实商品图、敏感业务资料或内部沟通记录。
- 店铺后台、账号、token、cookie 或支付信息。
- 授权不清的字体和图片素材。

## 下一步

- 第一次试跑：看 [中文快速试跑](../QUICKSTART_CN.md)。
- 从零做测试 PSD：看 [最小 PSD 模板制作教程](../demo-kit/MINIMAL_PSD_TEMPLATE_CN.md)。
- 卡在安装、端口、图片匹配或 Photoshop 导出：看 [中文排障清单](../TROUBLESHOOTING_CN.md)。
- 想提交自己的净化案例：看 [净化案例提交指南](../SHOWCASE_GUIDE.md)。
