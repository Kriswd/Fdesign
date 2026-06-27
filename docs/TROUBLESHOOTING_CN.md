# Fdesign 中文排障清单

这份清单面向第一次在 Windows + Photoshop 环境里试跑 Fdesign 的用户。排查顺序建议从“项目能否启动”到“Photoshop 能否导出”，每一步只确认一个问题，避免一上来就把真实 PSD、真实商品图和整张 Excel 全部接进来。

如果你还没有启动过项目，请先按 [中文快速试跑](./QUICKSTART_CN.md) 完成最小链路，再回到这里定位卡点。

## 1. npm install 失败

先确认当前目录能看到 `package.json`，再检查 Node.js 版本：

```powershell
node -v
npm -v
```

常见处理：

- Node.js 版本低于 18 时，先升级 Node.js。
- 国内网络下载依赖慢时，可以临时使用 npm 镜像：

```powershell
npm config set registry https://registry.npmmirror.com
```

- 如果报权限错误，把仓库移动到普通工作目录，例如 `D:\Projects\Fdesign`，不要放在系统目录、同步盘冲突目录或中文层级很深的位置。
- 如果是依赖缓存异常，先关闭正在运行的 dev/server 窗口，再执行 `npm cache verify` 后重试。

## 2. 后端健康检查打不开

启动后端：

```powershell
npm run server
```

再访问：

```text
http://127.0.0.1:3001/health
```

排查顺序：

- 终端是否停留在项目根目录。
- 终端是否已经打印后端监听地址。
- 3001 端口是否被其它程序占用。
- Windows 防火墙或安全软件是否拦截了本机 Node.js 服务。
- `.env` 或当前 shell 环境变量里是否配置了异常端口、异常 CORS 来源或过短的 `ADMIN_AUTH_SECRET`。

健康检查正常时，响应里应该能看到版本信息，当前 V3.0 公开版应显示 `3.0`。

## 3. 前端页面打不开

保持后端窗口运行，再打开第二个 PowerShell：

```powershell
npm run dev
```

默认访问：

```text
http://127.0.0.1:3010/
```

排查顺序：

- 优先使用 Vite 终端打印出的实际地址。
- 如果 3010 被占用，先关掉旧服务，或按终端提示访问新的端口。
- 浏览器缓存异常时，换无痕窗口或强制刷新。
- 前端能打开但接口失败时，先回到 `http://127.0.0.1:3001/health` 确认后端还在。

## 4. 公开演示包看不懂

先打开这些文件：

- [公开演示包 README](./demo-kit/README.md)
- [示例 CSV](./demo-kit/sample-products.csv)
- [字段映射示例](./demo-kit/field-map.example.json)
- [图片清单](./demo-kit/image-manifest.json)

只需要先看懂这条关系：

```text
Excel 列 -> PSD 文本变量 / 图片变量 -> 商品图片路径 -> 导出命名
```

演示包不包含真实 PSD 模板。建议你自己建一个最小 PSD：两个文本变量、一个图片占位层、一条 Excel 记录。最小模板能跑通后，再接入真实模板。

## 5. 图片匹配失败

优先检查数据，不要先改代码：

- Excel 里的图片路径是否真实存在。
- 路径是否使用了当前电脑能访问的绝对路径或相对路径。
- 图片文件名里的款号、色号、角度是否和 Excel 字段一致。
- PSD 图片变量是否绑定到正确字段。
- 同一张图是否被多个变量复用，但参考线或裁切规则不同。

如果要提 issue，请贴净化后的字段名、图片命名样例和失败提示，不要上传真实商品图或客户素材。

## 6. Photoshop 导出失败

先手动打开 Photoshop，确认它没有卡在登录、更新、授权、插件弹窗或文件恢复弹窗上。

再检查：

- PSD 文件没有被其它程序锁定。
- PSD 路径和导出目录可读写。
- 导出目录不要放在需要管理员权限的系统目录。
- 先只跑一条记录，确认最小模板能导出。
- 复杂模板先减少变量数量，再逐步加回文本变量、图片变量和规则链。

如果错误信息里有 job id、日志路径、Photoshop 错误码或导出文件名，请保留净化后的摘要。不要公开私有 PSD、客户资料、订单、报价、账号信息或授权不清的图片。

## 7. 提交反馈前准备什么

建议复制这些信息：

- Windows 版本。
- Node.js 和 npm 版本。
- Photoshop 版本。
- 你执行的启动命令。
- 后端 `/health` 是否可访问。
- 最短复现步骤。
- 净化后的字段名、变量名、文件名样例和错误摘要。

反馈入口：

- [中文试跑反馈模板](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)
- [GitHub Issues](https://github.com/Kriswd/Fdesign/issues)
- [中文试跑讨论](https://github.com/Kriswd/Fdesign/discussions/8)

