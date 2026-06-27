# Fdesign Demo

演示视频：<https://www.bilibili.com/video/BV1YDTA6nEeN/>

## 主工作流截图

![闪图 Fdesign 工作台](../public/screenshots/fdesign-workbench-showcase.png)

这张截图展示了 Fdesign 的核心工作流：左侧是 PSD 画布预览，中间是当前可替换图片变量，右侧是数据绑定与导出入口，底部是 Excel 数据控制台。

## 公开净化案例

如果你想先看更接近电商生产的公开场景，可以从 [公开净化案例库](./showcases/README.md) 开始。当前已有 [电商主图多色号批量导出](./showcases/MAIN_IMAGE_COLOR_VARIANTS_CN.md) 和 [眼镜商品详情页批量套版](./showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md)，使用公开截图和 `docs/demo-kit/` 里的假数据，说明字段、图片变量、商品位和导出格式如何组合。

## 1. 导入 PSD 模板

在工作台导入 PSD 后，Fdesign 会解析模板中的图层、画板、图片变量和文本变量。模板解析结果会进入本地后端管理，方便后续重复使用。

## 2. 绑定数据

上传 Excel 后，可以把商品字段、商品图和规则链绑定到 PSD 变量上。适合批量替换款号、色号、商品图、规格说明、标题文案等重复内容。

## 3. 批量导出

确认绑定后，通过本机 Photoshop 执行导出任务。当前导出格式覆盖 PSD、PSB、PNG 与 JPEG，适合在保留源文件的同时生成可交付图片。

## 常见限制

- 需要 Windows 10/11 x64。
- 需要本机已安装并可被脚本调用的 Adobe Photoshop。
- 仓库不包含 Photoshop、字体、私有模板、商品素材或运行产物。
- 部分复杂 PSD 模板需要先整理图层命名和变量绑定规则。

## 下一步

- 先看 [B站演示视频](https://www.bilibili.com/video/BV1YDTA6nEeN/)，快速理解画布、绑定区和数据控制台如何配合。
- 按 README 的快速开始在本地启动项目。
- 下载或查看 [公开演示包](./demo-kit/README.md)，用净化后的示例数据理解字段映射方式。
- 按 [最小 PSD 模板制作教程](./demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) 先跑通一条记录，再迁移到真实模板。
- 浏览 [公开净化案例库](./showcases/README.md)，查看后续新增的公开安全案例。
- 阅读 [净化案例：电商主图多色号批量导出](./showcases/MAIN_IMAGE_COLOR_VARIANTS_CN.md)，理解同一主图模板如何按款号、色号和图片字段批量导出。
- 阅读 [净化案例：眼镜商品详情页批量套版](./showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md)，理解一个完整电商场景如何拆成字段、图片变量和导出结果。
- 阅读 [PSD 自动填充手册](./USER_MANUAL_PSD_AUTOFILL.md)。
- 分享你的模板案例或问题到 GitHub Issues / Discussions。
