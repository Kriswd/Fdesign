# Fdesign 中文快速试跑

这份文档面向第一次打开 Fdesign 的国内用户，目标是在 10 分钟内判断三件事：

1. 项目是否能在本机启动。
2. 后端和前端是否能互相访问。
3. 公开演示包的字段映射是否看得懂。

它不要求你一开始就拿真实 PSD 模板测试。真实模板、真实商品图和客户数据请先留在本地，等基础链路跑通后再逐步接入。

## 1. 运行前检查

请先确认：

- Windows 10/11 x64。
- Node.js 18 或更高版本。
- 本机已安装 Adobe Photoshop，并且可以正常手动打开。
- 仓库路径不要放在权限很高或同步盘冲突明显的位置，建议先放在普通英文路径，例如 `D:\Projects\Fdesign`。

检查命令：

```powershell
node -v
npm -v
```

如果国内网络安装依赖较慢，可以先使用镜像源：

```powershell
npm config set registry https://registry.npmmirror.com
```

## 2. 下载并安装依赖

```powershell
git clone https://github.com/Kriswd/Fdesign.git
cd Fdesign
npm install
```

如果 `npm install` 失败，先记录完整错误，再确认：

- Node.js 版本是否满足要求。
- 当前目录是否有写入权限。
- 防火墙或代理是否拦截 npm 下载。
- 终端是否在项目根目录，也就是能看到 `package.json` 的目录。

## 3. 启动后端

打开第一个 PowerShell 窗口：

```powershell
npm run server
```

后端默认健康检查地址：

```text
http://127.0.0.1:3001/health
```

浏览器打开后应该能看到 JSON 响应，并包含版本信息。当前开源版本应显示 `3.0`。

## 4. 启动前端

保留后端窗口不要关闭，再打开第二个 PowerShell 窗口：

```powershell
cd Fdesign
npm run dev
```

前端默认访问地址：

```text
http://127.0.0.1:3010/
```

如果端口被占用，先关闭旧的本地服务，或根据终端提示使用新的端口。

## 5. 先看公开演示包

第一次不要急着上传真实模板。建议先打开：

- [公开演示包](./demo-kit/README.md)
- [示例 CSV](./demo-kit/sample-products.csv)
- [字段映射示例](./demo-kit/field-map.example.json)
- [图片清单](./demo-kit/image-manifest.json)

重点看懂这条关系：

```text
Excel 列 -> PSD 文本变量 / 图片变量 -> 导出命名
```

演示包只包含净化数据和 SVG 示例图，不包含私有 PSD 模板、真实商品素材或导出产物。

## 6. 用简化 PSD 跑一条记录

基础服务启动后，建议自己做一个很小的 PSD 测试模板：

- 一个文本变量，例如款号。
- 一个文本变量，例如色号。
- 一个图片占位层，例如主图。
- 先只跑一条 Excel 记录。

单条记录能稳定导出后，再增加更多变量、规则链和批量数据。

## 7. 常见卡点

### 后端健康检查打不开

- 确认 `npm run server` 窗口没有报错。
- 确认访问的是 `http://127.0.0.1:3001/health`。
- 确认 3001 端口没有被其它程序占用。

### 前端页面打不开

- 确认 `npm run dev` 窗口还在运行。
- 优先使用终端打印出的本地地址。
- 如果浏览器缓存异常，换无痕窗口或刷新页面。

### Photoshop 导出失败

- 先手动打开 Photoshop，确认它没有卡在登录、更新、弹窗或授权页面。
- 确认 PSD 文件没有被其它程序锁定。
- 确认导出目录可写。
- 复杂模板先减到最小变量集合，只跑一条记录。

### 图片匹配失败

- 检查 Excel 中的图片路径是否真实存在。
- 检查款号、色号、角度命名是否和图片文件名一致。
- 检查 PSD 图片变量是否绑定到了正确字段。

## 8. 反馈方式

如果你愿意反馈，请优先提供净化后的信息：

- Windows、Node.js、Photoshop 版本。
- 最短复现步骤。
- 净化后的字段名、变量名、错误提示。
- 不包含真实商品图、客户数据、账号信息、订单信息或私有 PSD 的截图。

反馈入口：

- [提交中文试跑反馈](https://github.com/Kriswd/Fdesign/issues/new?template=quickstart_feedback.yml)
- [GitHub Issues](https://github.com/Kriswd/Fdesign/issues)
- [FAQ](./FAQ.md)
