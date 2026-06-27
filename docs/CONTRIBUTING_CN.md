# Fdesign 中文贡献指南

感谢你愿意改进 Fdesign。这个项目最需要的不是泛泛的建议，而是能帮助后来者复现、试跑和修正的具体反馈。

## 最有价值的贡献

- 按中文快速试跑文档启动项目后，提交清楚的卡点反馈。
- 提供净化后的 PSD 工作流结构，例如字段、变量、图片命名和导出格式。
- 补充公开演示包、FAQ、排障步骤、截图说明或案例库。
- 修复 PSD 解析、Excel 字段绑定、图片匹配、Photoshop 导出和界面交互问题。
- 为已有行为补自动化测试，尤其是导出、模板保存、清理和开源文档检查。

## 第一次反馈怎么提

如果你只是第一次试跑，请优先使用这些入口：

1. 先按 [中文快速试跑](./QUICKSTART_CN.md) 走一遍。
2. 卡住时先看 [中文排障清单](./TROUBLESHOOTING_CN.md)。
3. 仍然跑不通，提交 [中文试跑反馈](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)。
4. 能跑起来但不确定自己的模板结构是否适配，提交 [PSD 工作流适配反馈](https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml)。
5. 不确定是否是 bug，可以先到 [中文试跑讨论](https://github.com/Kriswd/Fdesign/discussions/8) 描述现象。

反馈里尽量写清：

- Fdesign 版本，例如 V3.0。
- Windows、Node.js、npm 和 Photoshop 版本。
- 卡在哪一步，例如安装依赖、后端启动、`/health`、前端页面、图片匹配或 Photoshop 导出。
- 最短复现步骤。
- 期望看到什么，实际发生了什么。
- 脱敏后的错误摘要、终端关键行或截图。

## 净化案例怎么提

如果你想分享自己的模板工作流，请先看 [净化案例提交指南](./SHOWCASE_GUIDE.md) 和 [公开净化案例库](./showcases/README.md)。
还没有整理成完整案例时，先用 [PSD 工作流适配反馈](https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml) 描述结构和卡点。

推荐提供这些信息：

- 模板类型：详情页、主图、活动图、社媒图或多画板导出。
- Excel 字段：字段名、示例假值、哪些字段参与命名或规则链。
- PSD 变量：文本变量、图片变量、商品位绑定关系。
- 图片命名：款号、色号、角度或其它匹配规则。
- 输出格式：PSD、PSB、PNG、JPEG，以及目录命名逻辑。
- 可复用经验：后来者应该从这个案例学到什么。

## 不要公开什么

请不要在 issue、discussion、PR 或截图中提交这些内容：

- 私有 PSD 模板。
- 真实商品图。
- 账号信息、token、密钥、后台截图。
- 字体文件、付费素材或授权不清的图片。
- 敏感业务资料。
- 大体积运行产物、导出包、日志全集或本机绝对路径清单。

如果某个问题必须依赖真实模板才能复现，请先把模板缩成最小结构：只保留变量名、图层层级、假字段和脱敏错误摘要。

## 开发准备

1. 安装 Node.js 18+。
2. 在仓库根目录执行 `npm install`。
3. 参考 `.env.example` 设置本地环境变量。
4. 分别执行 `npm run server` 与 `npm run dev`。

开发访问地址：

- 前端界面：`http://127.0.0.1:3010/`
- 后端健康检查：`http://127.0.0.1:3001/health`

Photoshop 导出链路需要本机已安装可用的 Adobe Photoshop。没有 Photoshop 时，仍可开发前端、解析逻辑和不依赖宿主进程的服务端能力。

## 提交 PR 前检查

至少执行：

```bash
npm run lint
npm run build
npm test
```

涉及真实交互或导出链路时，还需要启动前后端做浏览器和接口回归。若 Photoshop 依赖暂时不可用，请在 PR 说明里写清未覆盖的范围。

## PR 说明建议

请写清：

- 改了什么。
- 影响哪些工作流。
- 如何验证。
- 是否涉及 Photoshop 宿主进程。
- 是否新增或修改公开文档。
- 是否确认没有提交私有素材、运行产物或敏感业务资料。
