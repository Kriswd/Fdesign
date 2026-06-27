# 净化案例：电商主图多色号批量导出

这个案例用于说明 Fdesign 如何处理同一主图 PSD 模板下的多款号、多色号批量导出。它只使用 `docs/demo-kit/` 中的假数据和 SVG 演示图，不包含私有 PSD、真实商品图、账号后台或运行产物。

![闪图 Fdesign 工作台截图](../../public/screenshots/fdesign-workbench-showcase.png)

## 场景

同一套电商主图模板通常会复用固定版式，只替换这些内容：

- 款号、色号、系列、年份。
- 商品标题和一句短说明。
- 正面主图、侧面图或细节图。
- 导出文件夹和文件名，例如按 `style_no-color_no` 归档。

Fdesign 的价值在于先把 PSD 图层变量和 Excel 字段绑定好，再对多行数据重复执行同一套导出规则。

## 输入数据

示例 CSV 来自 [sample-products.csv](../demo-kit/sample-products.csv)，其中同一款号可以有多个色号：

| sku | style_no | color_no | title | hero_image |
| --- | --- | --- | --- | --- |
| FDX1001-C10 | FDX1001 | C10 | FDX1001 C10 Optical Frame | images/FDX1001-C10-front.svg |
| FDX1001-C20 | FDX1001 | C20 | FDX1001 C20 Optical Frame | images/FDX1001-C20-front.svg |
| FDX1002-C10 | FDX1002 | C10 | FDX1002 C10 Sunglasses | images/FDX1002-C10-front.svg |
| FDX1002-C30 | FDX1002 | C30 | FDX1002 C30 Sunglasses | images/FDX1002-C30-front.svg |

示例图片来自 [image-manifest.json](../demo-kit/image-manifest.json)。文件名里同时带有款号、色号和角度，便于图片匹配和排查。

## PSD 模板结构

这个案例可以用一个最小主图 PSD 来复现：

| PSD 变量 | 类型 | 数据来源 | 用途 |
| --- | --- | --- | --- |
| `title` | 文本 | `title` | 主标题 |
| `model_no` | 文本 | `style_no` | 款号 |
| `color_no` | 文本 | `color_no` | 色号 |
| `subtitle` | 文本 | `subtitle` | 副标题或短说明 |
| `hero_image` | 图片 | `hero_image` | 主视觉商品图 |

字段映射可参考 [field-map.example.json](../demo-kit/field-map.example.json)。如果你还没有 PSD 模板，先按 [最小 PSD 模板制作教程](../demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) 做一个本机测试模板，再把 `hero_image` 放大成主图版式。

## 图片匹配

主图场景建议让图片文件名至少包含三段信息：

```text
FDX1001-C10-front.svg
FDX1001-C20-front.svg
FDX1002-C10-front.svg
FDX1002-C30-front.svg
```

这样一行 Excel 数据能通过 `style_no + color_no + hero_image` 对应到唯一图片。若同一款号和色号存在多个角度，建议在字段里明确使用 `hero_image`、`side_image`、`detail_image`，不要只依赖模糊文件名。

## 导出命名

公开演示包中的 `outputNaming` 是：

```json
{
  "folder": "{style_no}-{color_no}",
  "file": "{sku}-{title}"
}
```

套到上面的数据后，可以得到这样的归档结构：

```text
FDX1001-C10/
  FDX1001-C10-FDX1001 C10 Optical Frame.png
  FDX1001-C10-FDX1001 C10 Optical Frame.psd
FDX1001-C20/
  FDX1001-C20-FDX1001 C20 Optical Frame.png
  FDX1001-C20-FDX1001 C20 Optical Frame.psd
```

如果导出文件名用于后续平台上传，可以先只保留 `sku` 或 `style_no-color_no`，减少长标题带来的路径和字符问题。

## 工作流

1. 导入主图 PSD 模板。
2. 把 `title`、`model_no`、`color_no`、`subtitle` 和 `hero_image` 加入同一个商品位。
3. 上传或参考公开 CSV，绑定文本字段和主图字段。
4. 先选择 `FDX1001-C10` 单条预览，确认主图位置、文字长度和色号都正确。
5. 再选择同款不同色号，例如 `FDX1001-C10` 和 `FDX1001-C20`，检查图片是否跟着色号切换。
6. 批量导出 PNG/JPEG 预览；确认无误后再导出 PSD 或 PSB。

## 常见错误

| 问题 | 建议排查 |
| --- | --- |
| 同款不同色号导出了同一张图 | 检查 `hero_image` 字段是否每行不同，图片文件名是否包含色号。 |
| 图片匹配到了侧面图或细节图 | 在 CSV 中拆分 `hero_image`、`side_image`、`detail_image`，不要让一个字段混用多角度。 |
| 标题过长遮住商品图 | 在 PSD 中预留文本框宽度，或用规则链把标题拆成主标题和副标题。 |
| 文件名太长 | 输出命名先使用 `sku`，把标题放在画面文字或导出清单里。 |
| 导出 PSD 慢 | 先用 PNG/JPEG 验证字段和图片，再批量导出 PSD/PSB。 |

## 可公开反馈什么

适合公开到 Issue 或 Discussion 的内容：

- 净化后的字段名、变量名和图片命名规则。
- 用假数据复现的 CSV / JSON 映射。
- 不含真实商品和未净化资料的工作台截图。
- 图片匹配错误的最小复现说明。
- 导出格式、命名规则和路径结构建议。

不要公开：

- 私有 PSD 原文件。
- 真实商品图、未净化字段或内部沟通记录。
- 店铺后台、账号、token、cookie 或支付信息。
- 授权不清的字体和图片素材。

## 下一步

- 看完整详情页场景：[眼镜商品详情页批量套版](./EYEWEAR_DETAIL_WORKFLOW_CN.md)。
- 看公开演示数据：[公开演示包](../demo-kit/README.md)。
- 从零做测试 PSD：[最小 PSD 模板制作教程](../demo-kit/MINIMAL_PSD_TEMPLATE_CN.md)。
- 提交自己的净化案例：[净化案例提交指南](../SHOWCASE_GUIDE.md)。
