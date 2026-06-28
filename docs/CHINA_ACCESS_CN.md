# Fdesign 国内访问与试跑减阻

这页给第一次从国内社区、朋友转发或 B 站视频进来的用户用。目标很简单：先看懂项目，再跑通公开演示包，最后再决定是否接入自己的 PSD 模板。

如果你已经能正常访问 GitHub、安装依赖并打开本机 Photoshop，可以直接跳到 [中文快速试跑](./QUICKSTART_CN.md)。

## 1. 先看，不急着 clone

如果 GitHub 访问不稳定，先用这些入口判断是否值得继续：

- 项目页：<https://kriswd.github.io/Fdesign/>
- B 站演示视频：<https://www.bilibili.com/video/BV1YDTA6nEeN/>
- 中文上手入口：[START_HERE_CN.md](./START_HERE_CN.md)
- 中文适用场景：[USE_CASES_CN.md](./USE_CASES_CN.md)
- 公开案例库：[docs/showcases](./showcases/README.md)
- 公开演示包：[docs/demo-kit](./demo-kit/README.md)

先确认两件事：

1. 你的流程是否是固定或半固定 PSD 模板批量套数据。
2. 你是否能在本机 Windows + Photoshop 环境中运行导出链路。

如果只是想云端生成新图，或没有本机 Photoshop，这个版本可能不是优先选择。

## 2. GitHub 慢时怎么拿代码

推荐顺序：

1. 优先使用 GitHub 官方仓库：<https://github.com/Kriswd/Fdesign>
2. 如果网页能打开但 `git clone` 慢，可以先在 GitHub 页面下载 ZIP，只用于本地试跑。
3. 如果下载也不稳定，先看 B 站演示、项目页、公开演示包和案例库，等网络稳定后再 clone。

不建议从陌生网盘或不明压缩包下载可执行代码。Fdesign 是本地运行工具，首次试跑请以 GitHub 官方仓库内容为准。

## 3. npm 安装慢时先换镜像

进入项目根目录后，可以先设置 npm 镜像：

```powershell
npm config set registry https://registry.npmmirror.com
npm install
```

如果后续想切回官方源：

```powershell
npm config set registry https://registry.npmjs.org
```

安装失败时，先确认：

- `node -v` 为 18 或更高版本。
- 当前目录能看到 `package.json`。
- 终端对项目目录有写入权限。
- 防火墙、代理或安全软件没有拦截 npm 下载。

## 4. 第一次试跑的最短路径

建议按这个顺序：

1. 看 [B 站演示视频](https://www.bilibili.com/video/BV1YDTA6nEeN/) 或 [工作流 GIF](./assets/fdesign-workflow-demo.gif)。
2. 读 [中文适用场景](./USE_CASES_CN.md)，确认是不是你的 PSD 场景。
3. 打开 [公开演示包](./demo-kit/README.md)，看懂 CSV、字段映射和图片清单。
4. 按 [中文快速试跑](./QUICKSTART_CN.md) 启动后端和前端。
5. 用 [最小 PSD 模板制作教程](./demo-kit/MINIMAL_PSD_TEMPLATE_CN.md) 做一个小模板，先跑一条记录。

不要一开始就拿真实复杂模板压上来。先跑通最小链路，再接入更多变量和批量数据。

## 5. 本机启动检查

后端：

```powershell
npm run server
```

健康检查：

```text
http://127.0.0.1:3001/health
```

前端：

```powershell
npm run dev
```

默认访问：

```text
http://127.0.0.1:3010/
```

如果打不开：

- 后端窗口不要关闭。
- 前端窗口不要关闭。
- 优先使用终端打印出来的本地地址。
- 先确认 3001 / 3010 端口没有被其他程序占用。
- Photoshop 需要能手动打开，且没有卡在登录、更新、授权或弹窗页面。

## 6. 反馈时不要上传原始素材

公开反馈请只给净化信息：

- Windows、Node.js、Photoshop 版本。
- 你卡在哪一步：下载、安装、后端、前端、字段绑定、图片匹配或 Photoshop 导出。
- 最短复现步骤。
- 净化后的字段名、图层路径、图片命名规则和错误摘要。

不要上传私有 PSD、真实商品图、账号信息、token、后台截图或未净化字段。

反馈入口：

- [中文试跑反馈](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)
- [PSD 工作流适配反馈](https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml)
- [中文试跑讨论](https://github.com/Kriswd/Fdesign/discussions/8)
- [中文排障清单](./TROUBLESHOOTING_CN.md)
