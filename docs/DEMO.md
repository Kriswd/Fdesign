# Fdesign Demo

## 主工作流截图

![闪图 Fdesign 工作台](../public/screenshots/fdesign-workbench-showcase.png)

这张截图展示了 Fdesign 的核心工作流：左侧是 PSD 画布预览，中间是当前可替换图片变量，右侧是数据绑定与导出入口，底部是 Excel 数据控制台。

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

- 按 README 的快速开始在本地启动项目。
- 阅读 [PSD 自动填充手册](./USER_MANUAL_PSD_AUTOFILL.md)。
- 分享你的模板案例或问题到 GitHub Issues / Discussions。
