# 闪图 Fdesign V3.0

闪图 Fdesign 是一个基于 React、Node.js 与 Photoshop 自动化的 PSD 图像生产工作台，覆盖模板解析、变量绑定、批量替换、成品导出与任务模板管理。

## 产品截图

![闪图 Fdesign 工作台](./public/screenshots/fdesign-workbench-showcase.png)

上图展示 PSD 画布预览、商品位绑定、Excel 数据控制台与导出入口的主工作流。

## 能力概览

- 在浏览器中解析 PSD 模板并管理可替换变量。
- 结合 Excel、图片变量和规则链生成批量任务。
- 通过 Node.js 调度 Photoshop 完成 PSD、PSB、PNG 与 JPEG 导出。
- 提供模板配置、任务模板和运行数据的本地管理能力。

## 运行要求

- Node.js 18+
- Windows 10/11 x64
- 本机已安装且可被脚本调用的 Adobe Photoshop

仓库只包含应用代码，不分发 Photoshop、字体、模板素材或运行产物。

## 快速开始

```bash
npm install
npm run server
npm run dev
```

开发访问地址：

- 前端界面：`http://127.0.0.1:3010/`
- 后端健康检查：`http://127.0.0.1:3001/health`

后端读取当前 shell 中的环境变量；前端本地变量可参考 `.env.example`。生产模式启用后台会话前，请先设置足够长的 `ADMIN_AUTH_SECRET` 并收紧允许访问的来源。

## 店铺入口

首页顶部支持展示“选购服务”入口。公开仓库不会硬编码私有店铺地址，部署或发布前在环境变量中配置即可：

```env
VITE_SHOP_URL=https://your-shop.example
VITE_SHOP_LINK_LABEL=选购服务
```

未设置 `VITE_SHOP_URL` 时，顶部店铺入口会自动隐藏，避免开源版本误导用户访问错误链接。

## 目录

- `src/`：React 前端
- `server/`：后端 API、模板存储与 Photoshop 调度
- `server/photoshop/`：Photoshop JSX/VBS 脚本
- `tests/`：Node 测试和浏览器烟测
- `docs/`：架构、API 与使用说明

## 开发文档

- [架构说明](./docs/ARCHITECTURE.md)
- [API 开发指南](./docs/API_DEV_GUIDE.md)
- [PSD 自动填充手册](./docs/USER_MANUAL_PSD_AUTOFILL.md)
- [开源检查清单](./docs/OPEN_SOURCE_CHECKLIST.md)
- [贡献指南](./CONTRIBUTING.md)
- [安全上报](./SECURITY.md)

## 验证

```bash
npm run lint
npm run build
npm test
```

涉及 Photoshop 宿主进程、导出结果或真实页面交互时，还需要启动前后端做端到端回归。

## License

本项目基于 [MIT License](./LICENSE) 发布。
