# Contributing

感谢你愿意改进闪图 Fdesign。

如果你偏中文阅读，建议先看更完整的 [Fdesign 中文贡献指南](./docs/CONTRIBUTING_CN.md)。它说明了第一次试跑反馈、净化案例提交、公开安全边界和 PR 验证方式。

## 开发准备

1. 安装 Node.js 18+。
2. 在仓库根目录执行 `npm install`。
3. 参考 `.env.example` 设置本地环境变量；后端读取当前 shell 环境，Vite 读取前端 `VITE_` 变量。
4. 分别执行 `npm run server` 与 `npm run dev`。

Photoshop 导出链路需要本机已安装可用的 Adobe Photoshop。没有 Photoshop 时，仍可开发前端、解析逻辑和不依赖宿主进程的服务端能力。

## 提交要求

- 保持变更聚焦，说明影响的工作流和验证方式。
- 新增或修复行为时同步补充自动化测试。
- 修改核心导出、模板保存、认证或清理逻辑时保留结构化日志，便于复盘。
- 不提交模板素材、字体、运行输出、日志、真实环境变量、私有资料或敏感业务资料。

## 验证

提交前至少执行：

```bash
npm run lint
npm run build
npm test
```

涉及真实交互或导出链路时，还需要启动前后端做浏览器和接口回归。若 Photoshop 依赖暂时不可用，请在变更说明里写清未覆盖的范围。
