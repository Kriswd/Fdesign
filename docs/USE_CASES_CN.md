# Fdesign 中文适用场景

这页用于判断：你的 PSD 批量作图流程是否适合用 Fdesign 试跑。

Fdesign 解决的是一个很具体的问题：已经有固定或半固定的 PSD 模板，也有 Excel 商品数据和商品图，希望批量替换文本、图片、款号、色号、规格字段，并保留可继续编辑的 PSD / PSB 源文件，同时导出 PNG / JPEG 成品。

## 适合优先试跑的场景

### 1. 电商主图多款号、多色号批量导出

典型输入：

- 一套主图 PSD 模板。
- Excel 中有款号、色号、品牌、品类、年份、规格等字段。
- 商品图按 `款号 + 色号 + 角度` 命名。

Fdesign 可以把 Excel 行、商品图和 PSD 变量绑定成批量任务，适合“同一模板、很多商品记录、重复导出”的流程。

参考案例：[电商主图多色号批量导出](./showcases/MAIN_IMAGE_COLOR_VARIANTS_CN.md)

### 2. 多画板详情页批量导出

典型输入：

- 一个 PSD 文件里包含多个画板，例如首屏、规格、角度图、细节图。
- 不同画板需要复用同一条商品数据。
- 导出时需要按画板拆分文件，或保留 PSD / PSB 源文件。

Fdesign 适合把多画板模板拆成可复用的变量绑定规则，减少逐个画板手工替换。

参考案例：[多画板详情页批量导出](./showcases/MULTI_ARTBOARD_BATCH_EXPORT_CN.md)

### 3. 商品详情页套版和字段组合

典型输入：

- 详情页 PSD 模板中有标题、规格、型号、镜片参数、材质等文本层。
- Excel 中字段较多，需要拼接、映射或过滤特殊值。
- 图片变量和文本变量都需要跟同一条商品记录绑定。

Fdesign 的规则链适合处理字段拼接、特殊值覆盖和值映射这类重复逻辑。

参考案例：[眼镜商品详情页批量套版](./showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md)

### 4. 本机 Photoshop 自动化链路研究

如果你关心的是“浏览器工作台如何调度本机 Photoshop”，Fdesign 也可以作为一个开源参考：

- React 前端负责模板预览、字段绑定和任务配置。
- Node.js 后端负责模板存储、任务管理和导出调度。
- Photoshop JSX / VBS 脚本负责真正写入 PSD、替换图片和导出文件。

可以先读：[架构说明](./ARCHITECTURE.md) 和 [API 开发指南](./API_DEV_GUIDE.md)

## 暂时不适合的场景

- 每次只改一两张图，且不需要保留批量任务。
- 没有固定 PSD 模板，每次版式都完全不同。
- 没有本机 Adobe Photoshop，或希望完全脱离 Photoshop 导出。
- 只需要在线抠图、在线生成图片或纯云端图片服务。
- 需要上传未净化 PSD、真实商品图、账号信息、token 或后台截图来求助。

如果你只是第一次判断方向，建议先用公开演示包试跑，不要直接拿真实模板开始。

## 最小判断路径

1. 先看 [中文上手入口](./START_HERE_CN.md)。
2. 用 [公开演示包](./demo-kit/README.md) 理解 Excel 字段、图片清单和 PSD 变量的关系。
3. 按 [最小 PSD 模板制作教程](./demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) 做一个本机测试模板。
4. 跑通后，再按自己的模板结构迁移字段和图片绑定。
5. 卡住时先查 [中文排障清单](./TROUBLESHOOTING_CN.md)，再提交净化后的 issue 或 discussion。

## 提交反馈时怎么描述

为了让问题能公开讨论，建议只提交这些信息：

- 净化后的 Excel 表头和 2-3 行假数据。
- 图片命名规则示例，例如 `FDX1001-C10-front.png`。
- PSD 图层路径或变量名，例如 `Hero/{img:main}`。
- 期望导出格式，例如 PSD / PSB / PNG / JPEG。
- 最短复现步骤和净化后的错误摘要。

不要提交私有 PSD、真实商品图、账号信息、token、后台截图或未净化字段。

反馈入口：

- [PSD 工作流适配反馈](https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml)
- [中文试跑反馈](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)
- [中文试跑讨论](https://github.com/Kriswd/Fdesign/discussions/8)
- [图片匹配和图层命名样例收集](https://github.com/Kriswd/Fdesign/issues/15)
- [Photoshop 导出失败样例收集](https://github.com/Kriswd/Fdesign/issues/10)
