# 无 PSD 批量抠图（Cutout No PSD）方案与可还原手册

**目标**：把“产品图 + 通道 TGA”批量抠图导出透明 PNG 的链路固化为可复验、可排障、可手工还原的方案，避免未来改动导致回归后无法快速恢复。

---

## 1. 成功标准（必须同时满足）

1) **导出 PNG 必须带透明通道（RGBA）**
- 复验：`node scripts/check_png_alpha.mjs <output_png>` 输出 `channels: 4` 且 `hasAlpha: true`。

2) **黑色区域应为透明，而非黑底像素**
- 解释：图片查看器里看到黑底不代表透明；必须以 RGBA/alpha 统计为准。

3) **抠图结果文件必须可追踪**
- 每次执行必须生成：
  - `output/cutout_no_psd/cutout_no_psd_<ts>/job_cutout_<ts>.json`
  - `.../job_cutout_<ts>.json.vbs.log`
  - `.../job_cutout_<ts>.json.task_<i>.log`（至少 task_0）
  - `.../result_cutout_<ts>.json`

---

## 2. 入口与数据协议

### 2.1 前端入口
- 页面：[CutoutNoPsdTab.jsx](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/src/pages/Workbench/CutoutNoPsdTab.jsx)

### 2.2 后端接口
- 上传产品图：`POST /api/assets/upload-images`
- 上传通道图（TGA）：`POST /api/assets/upload-channel-masks`
- 批量抠图（无PSD）：`POST /api/cutout/batch-no-psd`

### 2.3 批量抠图 payload（关键字段）

```json
{
  "images": [
    { "imagePath": "E:\\...\\output\\assets\\images\\...\\xxx.jpg", "storedName": "...", "sourceName": "BA7079B30正.jpg" }
  ],
  "channels": [
    { "storedName": "1772..._BA7079B30正_VRay 线框颜色.tga", "sourceName": "BA7079B30正_VRay 线框颜色.tga" }
  ],
  "resizeMode": "exact"
}
```

---

## 3. 关键实现与不可变约束（回归时按此还原）

### 3.1 Photoshop 侧（抠图脚本）
- 文件：[cutout_batch.jsx](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/server/photoshop/cutout_batch.jsx)

**必须保持的铁律（不要“优化”掉）**
1) **必须存在 JSON polyfill**（至少 `JSON.stringify`）
- 目的：在某些 PS/ExtendScript 环境里 `JSON` 不完整；缺失会导致 `resultPath` 写文件失败，表现为“结果文件未生成/仍占位”。

2) **必须统一路径分隔符为 `/`**
- 目的：ExtendScript 的 `File()` 在部分情况下对 `\\`/编码敏感，统一为 `/` 能显著减少不可复现错误。
- 表征：应存在 `normalizeFsPath()` 并在 `productPath/channelPath/outputPath/jobPath/resultPath` 入口使用。

3) **必须采用“透明新文档承载”导出方案**
- 不要依赖“创建图层蒙版 Action”（兼容性风险高）。
- 正确做法：从通道生成 selection 后，将 selection 内容复制到 **新建透明文档**，再导出 PNG。
- 关键点：应存在类似 `newTransparentDocLike()`，并使用 `DocumentFill.TRANSPARENT` 创建 RGBA 目标。

### 3.2 Photoshop 调度（VBS）
- 文件：[run_job.vbs](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/server/photoshop/run_job.vbs)

**必须保持的铁律**
1) **必须通过 wrapper JSX 注入 `__FDESIGN_JOB_PATH` 并执行脚本**
- 目的：部分 PS 版本/COM 调用下 `DoJavaScriptFile(..., Array(jobPath), ...)` 传参不稳定，导致 JSX `arguments[0]` 为空。
- 表征：VBS 会创建一个临时 wrapper `.jsx`，内容包含：
  - `var __FDESIGN_JOB_PATH = '<jobPath>';`
  - `$.evalFile('<tmpJsxPath>');`

### 3.3 后端（接口与结果/日志）
- 文件：[server/index.js](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/server/index.js)

**必须保持的铁律**
1) `resultPath` **先预写占位**（避免 ENOENT）
2) 若 `resultPath` 仍是 placeholder 或不存在，响应应返回：
   - `jobPath`、`resultPath`
   - `debug.stdout/stderr`
   - `debug.vbsLog`、`debug.task0Log`

---

## 4. 复验步骤（最快路径）

### 4.1 执行一次抠图
1) 前端上传产品图 + 通道 TGA
2) 点击“开始批量抠图”
3) 在 `output/cutout_no_psd/` 找到最新目录，确认输出 PNG 与 result JSON 存在

### 4.2 验证 PNG 透明通道

```bash
node scripts/check_png_alpha.mjs "E:\ProjectX\Fdesign\psd-to-ecommerce-new\output\cutout_no_psd\cutout_no_psd_xxx\0001_xxx_cutout.png"
```

预期：
- `channels: 4`
- `hasAlpha: true`

---

## 5. 排障与定位（按层排查）

### 5.1 结果仍为 placeholder / 接口报“未生成结果文件”
优先看：
1) `.../job_*.json.vbs.log`（确认 VBS 是否运行了正确脚本、tmpJsxPath 是否生成）
2) `.../job_*.json.task_0.log`（若不存在，说明 JSX 根本没跑起来）

### 5.2 导出 PNG 没有 alpha（channels=3）
说明“透明新文档承载”方案被破坏：
- 检查 [cutout_batch.jsx](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/server/photoshop/cutout_batch.jsx) 是否仍使用 `DocumentFill.TRANSPARENT` 创建输出文档并粘贴后导出。

### 5.3 Photoshop 报“常规 Photoshop 错误…程序错误”
这是典型的“某些 Action/蒙版 API 不兼容”表现：
- 不要回到“创建图层蒙版 Action”的方案。
- 保持本方案的“selection copy → paste 到透明新文档”。

---

## 6. 手工还原 Checklist（不依赖 Git）

当发现抠图回归时，按以下顺序逐项核对并恢复：

1) [cutout_batch.jsx](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/server/photoshop/cutout_batch.jsx)
- 存在 `normalizeFsPath()`
- 存在 `JSON.stringify` polyfill
- 存在透明新文档创建（`DocumentFill.TRANSPARENT`）
- 导出路径是把 selection 复制到透明新文档后导出（而不是直接导出原图层/黑底）

2) [run_job.vbs](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/server/photoshop/run_job.vbs)
- 存在 wrapper jsx 写入逻辑
- wrapper 包含 `__FDESIGN_JOB_PATH` 和 `$.evalFile(...)`
- 用 `DoJavaScriptFile(wrapPath, Array(), 1)` 执行 wrapper

3) [server/index.js](file:///E:/ProjectX/Fdesign/psd-to-ecommerce-new/server/index.js)
- `/api/cutout/batch-no-psd` 在调用 Photoshop 前预写 `resultPath` 占位
- placeholder 未被覆盖时，响应包含 `jobPath/resultPath/debug`

4) 用 4.2 的命令验证 `channels: 4`

