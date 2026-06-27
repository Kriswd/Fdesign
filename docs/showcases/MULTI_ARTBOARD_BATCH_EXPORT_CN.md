# 净化案例：多画板详情页批量导出

这个案例用于说明 Fdesign 如何处理一个 PSD 文件里包含多个画板的批量导出场景。它只使用 `docs/demo-kit/` 中的假字段、SVG 演示图和公开工作台截图，不包含私有 PSD、真实商品图、账号后台或运行产物。

![闪图 Fdesign 工作台截图](../../public/screenshots/fdesign-workbench-showcase.png)

## 场景

一个详情页或活动图 PSD 往往不是单张画面，而是多个画板组成的一组输出。例如：

- `Hero`：首屏主视觉，包含标题、款号、主图。
- `Specs`：规格信息，包含材质、尺寸、重量。
- `Angles`：多角度展示，包含正面图、侧面图、细节图。

这些画板通常使用同一行 Excel 数据驱动。Fdesign 的重点不是把多个画板拆成多个项目，而是在同一模板里把画板、文本变量、图片变量和导出命名统一管理。

## 输入数据

示例 CSV 来自 [sample-products.csv](../demo-kit/sample-products.csv)：

| sku | style_no | color_no | title | frame_material | hero_image | side_image | detail_image |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FDX1001-C10 | FDX1001 | C10 | FDX1001 C10 Optical Frame | acetate | images/FDX1001-C10-front.svg | images/FDX1001-C10-side.svg | images/FDX1001-C10-detail.svg |
| FDX1001-C20 | FDX1001 | C20 | FDX1001 C20 Optical Frame | acetate | images/FDX1001-C20-front.svg | images/FDX1001-C20-side.svg | images/FDX1001-C20-detail.svg |

同一行数据可以同时驱动多个画板。多画板场景最重要的是字段命名要稳定，图片字段要按用途拆开。

## 画板组织

可以用下面的公开安全结构理解一个多画板 PSD：

```text
FDX Detail Template.psd
  Hero
    title
    model_no
    color_no
    hero_image
  Specs
    material
    lens_type
    frame_width
    lens_width
    bridge
    temple
    weight
  Angles
    side_image
    detail_image
    subtitle
```

建议让画板名保持语义清楚，例如 `Hero`、`Specs`、`Angles`，再通过导出命名把款号、色号和画板用途组合起来。不要把大量不可复用的临时说明写进画板名。

## 变量归属

| 画板 | PSD 变量 | 数据来源 | 用途 |
| --- | --- | --- | --- |
| `Hero` | `title` | `title` | 首屏标题 |
| `Hero` | `model_no` | `style_no` | 款号 |
| `Hero` | `color_no` | `color_no` | 色号 |
| `Hero` | `hero_image` | `hero_image` | 首屏主图 |
| `Specs` | `material` | `frame_material` | 材质 |
| `Specs` | `lens_type` | `lens_type` | 镜片类型 |
| `Specs` | `frame_width` | `frame_width_mm` | 镜框宽度 |
| `Specs` | `lens_width` | `lens_width_mm` | 镜片宽度 |
| `Specs` | `bridge` | `bridge_mm` | 鼻梁宽度 |
| `Specs` | `temple` | `temple_mm` | 镜腿长度 |
| `Specs` | `weight` | `weight_g` | 重量 |
| `Angles` | `side_image` | `side_image` | 侧面图 |
| `Angles` | `detail_image` | `detail_image` | 细节图 |
| `Angles` | `subtitle` | `subtitle` | 补充说明 |

字段映射可参考 [field-map.example.json](../demo-kit/field-map.example.json)。第一次试跑时，建议让变量名和字段名尽量接近，减少排查成本。

## 导出命名

多画板导出建议把画板用途加入文件名，便于后续检查：

```text
FDX1001-C10/
  FDX1001-C10-Hero.png
  FDX1001-C10-Specs.png
  FDX1001-C10-Angles.png
  FDX1001-C10-source.psd
FDX1001-C20/
  FDX1001-C20-Hero.png
  FDX1001-C20-Specs.png
  FDX1001-C20-Angles.png
  FDX1001-C20-source.psd
```

如果需要保留可编辑文件，可以同时导出 PSD / PSB。若只想检查画面是否正确，先导出 PNG / JPEG 更快。

## 工作流

1. 在 Photoshop 中整理好画板层级，确保每个可替换图层有稳定名称。
2. 在 Fdesign 中导入 PSD，让模板解析出画板、文本变量和图片变量。
3. 创建商品位，把同一行数据要驱动的变量加入同一个商品位。
4. 绑定文本字段：标题、款号、色号、规格字段。
5. 绑定图片字段：`hero_image`、`side_image`、`detail_image`。
6. 先选择一条数据预览，检查三个画板是否都被同一行数据驱动。
7. 批量选择多条数据，先导出 PNG/JPEG 检查，再导出 PSD/PSB。

## 常见错误

| 问题 | 建议排查 |
| --- | --- |
| 某个画板没有更新 | 检查该画板里的变量是否加入商品位，字段映射是否缺失。 |
| 画板命名和导出文件对不上 | 先把画板名简化为 `Hero`、`Specs`、`Angles` 这类稳定名称，再用输出命名加款号和色号。 |
| 多角度图片互相串了 | 在 CSV 中拆分 `hero_image`、`side_image`、`detail_image`，不要让同一个图片字段承担多个用途。 |
| 文本替换后位置漂移 | 在 PSD 中检查文本框尺寸、对齐方式和是否存在复杂效果。 |
| 批量导出慢 | 先导出 PNG/JPEG 验证，再导出 PSD/PSB；大尺寸模板可以分批运行。 |

## 可公开反馈什么

适合公开到 Issue 或 Discussion 的内容：

- 净化后的画板名、变量名和字段名。
- 用假数据复现的 CSV / JSON 映射。
- 不含真实商品和未净化资料的工作台截图。
- 某个画板未更新、命名不一致或图片匹配错误的最小复现说明。
- 期望的导出格式和文件命名结构。

不要公开：

- 私有 PSD 原文件。
- 真实商品图、未净化字段或内部沟通记录。
- 店铺后台、账号、token、cookie 或支付信息。
- 授权不清的字体和图片素材。

## 下一步

- 看主图多色号场景：[电商主图多色号批量导出](./MAIN_IMAGE_COLOR_VARIANTS_CN.md)。
- 看完整详情页字段场景：[眼镜商品详情页批量套版](./EYEWEAR_DETAIL_WORKFLOW_CN.md)。
- 看公开演示数据：[公开演示包](../demo-kit/README.md)。
- 从零做测试 PSD：[最小 PSD 模板制作教程](../demo-kit/MINIMAL_PSD_TEMPLATE_CN.md)。
- 提交自己的净化案例：[净化案例提交指南](../SHOWCASE_GUIDE.md)。
