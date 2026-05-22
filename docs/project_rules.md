# 项目运行要求（给 AI IDE 的依赖清单）

适用范围：`e:\ProjectX\Fdesign\psd-to-ecommerce-new`

## 1) 运行模式约定

- 生产模式（发布包默认）：推荐启动 `start_psd_to_ecommerce_new.bat` 或 `runtime\node\node.exe server/index.js`，后端托管 `dist/`，浏览器访问 `http://127.0.0.1:3001/` 或 `/admin`
- 开发模式（仅仓库开发用）：`npm run dev`（Vite，默认 5173，仅本机调试用）+ `npm run server`（3001，统一对外入口）
- 发布包内不包含 `src/`，因此发布包环境不允许依赖 Vite dev/5173，**对任何用户/测试环境回答时一律以 `http://127.0.0.1:3001` 作为前端入口端口，不直接让用户访问 5173**

## 2) 系统依赖（必须）

- Node.js 运行时（二选一）
  - 方式 A（发布包默认）：使用发布包内置便携 Node（`runtime\node\node.exe`）
    - 验证：`runtime\node\node.exe -v`
  - 方式 B：系统已安装 Node.js（Windows x64，建议 LTS）
    - 验证：`node -v`
  - 说明：发布包已包含 `node_modules/`，运行环境无需 `npm install`

## 3) 系统依赖（按功能需要）

- VC++ 运行库（x64，2015–2022）：sharp 属于原生模块，缺失可能导致服务端启动失败；发布包默认内置 `runtime\vcredist\vc_redist.x64.exe`，启动脚本会尝试安装
- 浏览器（Chrome 或 Edge）：Puppeteer 渲染/截图需要
  - 可通过环境变量指定：`PUPPETEER_EXECUTABLE_PATH=<chrome.exe 或 msedge.exe 路径>`
- Adobe Photoshop：PSD 导出/回写需要
- 字体：模板依赖字体缺失会造成渲染回退或导出视觉不一致（需手动安装；环境自检不再自动安装）

## 4) 发布包自检（最小可用）

在发布包解压目录：

1. 运行 `start_psd_to_ecommerce_new.bat`（推荐）
2. 或手动（优先）：`runtime\node\node.exe server/index.js`
3. 或手动（系统 Node）：`node server/index.js`
4. 浏览器访问：
   - `http://127.0.0.1:3001/health` 预期返回 `{"status":"ok", ...}`
   - `http://127.0.0.1:3001/` 预期返回 200（前端可打开）

## 5) 环境自检脚本

- 发布包启动脚本会先运行：`scripts/env_doctor.ps1`
  - 能检测 node/npm、VC++ 运行库、浏览器、Photoshop，并尝试用 winget 自动安装（若系统支持且允许）

## 6) Windows 启动脚本（BAT）长期约定（避免中文乱码/误执行）

- BAT 文件内容保持纯 ASCII：不要在 `.bat` 里直接写中文 `echo/提示/报错`，否则在不同系统代码页（CP936/UTF-8）下必然出现乱码或被 CMD 误解析为“不是内部或外部命令”
- 需要中文交互时：统一用 PowerShell 输出/Read-Host，并在 PowerShell 内用 `[char]0x....` 拼接中文字符串（BAT 仍保持 ASCII）
- 入口目录处理：先 `set "ROOT=%~dp0"` 再 `cd /d "%ROOT%"`，后续路径拼接一律基于 `ROOT`，避免 `%~dp0logs` 在部分环境被截断或误拼接
- 最小自测：支持 `start_psd_to_ecommerce_new.bat 1 --dry-run`（或 `admin --dry-run`）验证环境检测与模式分支，不启动服务

## 7) PSD 自动填充：配置持久化与诊断约定

- 管理端保存商品位配置时，必须把每个变量的 `computedRule` / `computedRules` 一并落盘到 `output/templates/{templateId}/slot-config.json`，否则重启后规则会丢失，用户端无法按规则回填与预览。
- 普通用户端与管理端在“回填/预览失败”时，不要求用户打开浏览器控制台排查；需要提供页面内可见的诊断信息（例如：已加载商品位数量、已绑定记录数量、命中/写回变量数量、常见错误提示）。

