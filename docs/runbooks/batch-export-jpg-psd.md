# 批量生成产品图导出（JPG / PSD）端到端实现方案（可维护手册）

适用范围：`psd-to-ecommerce-new` 当前批量导出链路（任务模板 → 批量生成产品图 → 导出 JPG / 导出 PSD 合并包）。

本文目标：当未来有人改坏了导出，只要按本文逐段核对（协议 → 对齐 → Photoshop 执行 → 导出落盘），就能**一次性定位根因并恢复到正确实现**，避免“盲改两天”。

---

## 0. 术语与不变量（必须保持）

### 0.1 输出不变量
- **JPG**：输出数量 = 用户上传产品图数量；背景为白色；每张是“模板 PSD 渲染结果 + 覆盖后的产品图”。
- **PSD（bundle）**：输出 1 个 PSD；模板 PSD 的原始结构不被破坏；每张产品图作为新增叠加层（建议每图一个分组）覆盖到对应图片变量位置；对齐规则与 JPG 一致。

### 0.2 对齐不变量（JPG 与 PSD 必须完全一致）
- 产品图内部“商品主体”的**左右边缘**对齐到用户绑定的两条竖向参考线（leftX / rightX）。
- 商品主体在图片变量区域内**上下居中**（以变量层的放置矩形为基准）。

### 0.3 关键工程原则（本链路能稳定交付的原因）
1. **对齐发生在进入 Photoshop 之前**：把用户产品图处理成“已对齐到参考线”的中间图（aligned image），避免 PS 内部裁切/缩放带来不可控误差。
2. **Photoshop 只做两件事**：把 aligned image 替换到目标图层，并且把几何放置恢复到替换前矩形（fit）。
3. **导出脚本必须处理模板层级陷阱**：模板图片变量层若自带 Layer Mask / 剪贴组，替换后会产生“残缺”。导出过程必须在副本上移除影响输出的 mask（不修改源 PSD）。

---

## 1) 端到端链路总览

### 1.1 前端入口（任务模板批量生成）
核心文件：
- [BatchProductImageTab.jsx](file:///e:/ProjectX/Fdesign/psd-to-ecommerce-new/src/pages/Workbench/BatchProductImageTab.jsx)

流程要点：
1. 用户上传 N 张产品图，绑定参考线（guidePick）。
2. 前端把每张产品图转成一组 `updates[]`（文本/图片变量），形成 `tasks[]`。
3. 调用后端接口：`POST /api/template/batch-export`（JPG 多文件或 PSD bundle）。

前端请求字段关键点（必须保障）：
- `templateId`
- `tasks: [{ label, format, quality, updates: [...] }]`
- PSD 合并导出：`bundlePsd: true` 且 `format: 'psd'`

注意：
- **JPG/PSD 不依赖 channels（通道图）**。通道图仅用于 PNG 抠图链路。

### 1.2 后端 API 入口
核心文件：
- [index.js](file:///e:/ProjectX/Fdesign/psd-to-ecommerce-new/server/index.js)

关键路由：
- `POST /api/template/batch-export`

职责：
- 解析请求体、调用 `PhotoshopIngestService` 执行。
- 成功响应中返回 `scriptBuild`（用于确认 Photoshop 脚本版本是否生效）。

### 1.3 后端服务层（协议转换 + 文件落盘 + 调度 Photoshop）
核心文件：
- [photoshopIngest.js](file:///e:/ProjectX/Fdesign/psd-to-ecommerce-new/server/services/photoshopIngest.js)

关键入口：
- `exportTemplateBatch(...)`：多文件导出（JPG/PNG/单 PSD）
- `exportTemplateBatchBundlePsd(...)`：合并 PSD 导出（输出 1 个 PSD）

职责：
1. 读取模板目录：`output/templates/{templateId}/source.psd` + `manifest.json`。
2. `normalizeClientUpdates(...)`：
   - 校验每条 update 的合法性（psId、imagePath 是否在允许目录）。
   - 为图片 update 计算目标矩形（x/y/width/height）与参考线（guidePick）。
   - 生成 aligned image：写入 `output/templates/{templateId}/inputs/`。
   - 产出 “Photoshop 可执行更新协议” updates（含 imageAbsPath / imagePath / rect）。
3. 生成 job 文件：`output/templates/{templateId}/exports/job_batch_*.json` 或 `job_bundle_*.json`。
4. 通过 `run_job.vbs` 启动 Photoshop 执行 `render_export.jsx`，等待 `result_*.json`。

---

## 2) 数据协议：tasks / updates（最容易被改坏）

### 2.1 前端提交的 update（clientUpdates）
图片 update（简化）：
```json
{
  "varType": "img",
  "psId": 783,
  "sourceName": "BA7079B90 正",
  "imagePath": "output/assets/images/....jpg",
  "guidePick": { "leftX": 100, "rightX": 500 }
}
```

文本 update（简化）：
```json
{
  "varType": "text",
  "psId": 123,
  "value": "文本内容"
}
```

关键不变量：
- `psId` 必须可定位到 Photoshop 里的目标层（是唯一可靠键）。
- `guidePick` 对 JPG/PSD 生效：用于 aligned image 的主体左右边缘对齐。

### 2.2 后端归一化后的 update（Photoshop updates）
图片 update 归一化后必须包含：
- `imageAbsPath` 或可解析的 `imagePath`
- `x/y/width/height`（目标放置矩形）

且 aligned image 的文件落点：
- `output/templates/{templateId}/inputs/img_psId_{psId}_{ts}.png`

---

## 3) 对齐算法（为什么能对齐）

核心实现：
- [SharpImageProcessor.alignWhiteBackgroundImage](file:///e:/ProjectX/Fdesign/psd-to-ecommerce-new/server/services/sharpProcessor.js)

算法目标：
- 输入：用户产品图（通常白底 JPG）、目标矩形 rect、参考线 guidePick（leftX/rightX）
- 输出：大小为 rect 尺寸的 PNG（aligned image），其中商品主体 bbox 左右边缘对齐到 guidePick span，垂直居中。

关键步骤（概念级）：
1. **扫描主体 bbox**：在白底图里找到“非白像素”区域作为主体边界（bounds）。
2. **计算目标 span**：`span = guidePick.rightX - guidePick.leftX`，约束主体最终宽度。
3. **缩放与放置**：
   - 把主体缩放到 span 对齐，并算出 `targetLeft` 使主体左边缘对齐 `guidePick.leftX`。
   - 垂直方向按目标矩形居中（top）。
4. 输出为 PNG（保证进入 Photoshop 时信息更稳定）。

对齐调试输出（必须保留）：
- 每次对齐会在 inputs 目录落一个 JSON：
  - `*_align_debug_*.json`
- 该 JSON 必须包含：`rect / manualGuides / debug.bounds / debug.placement`

如果对齐错了，优先看：
1. inputs 目录里的 aligned PNG 是否已经错（如果已错，问题在对齐算法/guidePick/rect）。
2. aligned PNG 正确但最终输出错（问题在 Photoshop 执行：mask、fit、导出方式）。

---

## 4) Photoshop 执行（render_export.jsx）——稳定性的核心

核心文件：
- [render_export.jsx](file:///e:/ProjectX/Fdesign/psd-to-ecommerce-new/server/photoshop/render_export.jsx)

### 4.1 运行模式
- `mode: 'batch'`：每个 task 复制一份 doc，应用 updates，导出单文件（JPG/PNG/PSD）。
- `mode: 'psd-bundle'`：打开模板、复制 doc、每个 task 创建分组并把变量层复制进组内再更新，导出 1 个 PSD。

### 4.2 图片替换必须做的 3 件事（缺一不可）
1. **移除 Layer Mask（导出副本）**
   - 模板图片变量层可能自带 user mask，会导致替换后“残缺”。
   - 解决：在选中目标层后，检测 `hasUserMask`，若为 true，则删除 mask（不应用）。
2. **replacePlacedContents**
   - 把 aligned image 替换进智能对象层。
3. **fitLayerToRect**
   - 替换后必须把图层拟合回替换前 bounds（或 updates 提供的 rect），保证几何放置稳定。

### 4.3 为什么必须移除 user mask（典型故障复盘）
症状：
- JPG 位置/左右对齐看起来正确，但眼镜桥位/中间部分缺失。
- PSD 打开后叠加层内容被裁掉/不完整。

根因：
- 目标图片变量层存在 `Layer Mask`，mask 会裁切替换后的内容。

证据链（定位用）：
- `job_batch_*.json.task_0.log` 里会打印 `maskInfo.hasUserMask`。
- aligned PNG 在 inputs 里是完整的，但最终输出缺失 → 说明裁切发生在 Photoshop 层级。

### 4.4 版本确认（避免“是不是没生效/有缓存”）
必须同时满足两条之一即可确认：
- API 成功响应返回 `scriptBuild`
- job 对应 `.task_0.log` 第 1 行 `SCRIPT_BUILD: ...`

---

## 5) 文件落点（调试必看）

模板目录：
- `output/templates/{templateId}/source.psd`
- `output/templates/{templateId}/manifest.json`

对齐中间产物：
- `output/templates/{templateId}/inputs/img_psId_{psId}_*.png`
- `output/templates/{templateId}/inputs/*_align_debug_*.json`

导出任务与日志：
- `output/templates/{templateId}/exports/job_batch_*.json`
- `output/templates/{templateId}/exports/result_batch_*.json`
- `output/templates/{templateId}/exports/job_batch_*.json.task_0.log`

---

## 6) 故障排查（按证据走，不要盲改）

### 6.1 “对齐不对/左右没对齐”
1. 找到本次导出 batchDir 对应 inputs 中的 aligned PNG。
2. 如果 aligned PNG 已经不对：
   - 检查 guidePick 是否为空/错误（前端绑定）
   - 检查 rect 是否为 0 或异常（后端 normalize）
   - 检查 `*_align_debug_*.json` 中 bounds 是否识别到主体

### 6.2 “对齐看起来对，但残缺/被裁掉”
1. aligned PNG 是否完整（inputs 里看）。
2. 看 `.task_0.log` 里的 `maskInfo.hasUserMask`：
   - true：mask 裁切导致，必须在导出副本移除 mask。
   - false：继续检查是否存在剪贴组（isClipping）/其他复合裁切结构。

### 6.3 “导出位置错乱/缩放异常”
1. `.task_0.log` 看 `beforeRect / afterRect` 是否一致。
2. 若不一致：fit 没生效或 rect 取错；优先确保 “替换前 bounds → replace → fit 回原 bounds” 的闭环存在。

---

## 7) 回归用例（每次改动必须跑）
1. JPG：单图导出（正面），检查左右对齐与桥位完整。
2. JPG：三图导出（正/侧/45），检查数量、对齐一致、白底。
3. PSD bundle：三图合并 PSD，检查：
   - 原始层未被隐藏/破坏
   - 新增分组覆盖正确
   - 每张图完整无残缺

