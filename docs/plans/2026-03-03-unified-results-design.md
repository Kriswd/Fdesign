# 统一结果列表（PNG/JPG/PSD 同行展示）设计

**目标**

批量生成结果列表对同一“PSD/模板 + 产品图”的导出结果只展示一行，行内以格式徽标展示 PNG/JPG/PSD 的独立状态与下载入口，避免当前 PNG 结果追加成新行导致“看起来既单独又合并”的交互混乱。

**现状问题（根因）**

- PSD/JPG 导出会先生成 `generationResults` 任务行（每行包含 `formatResults`）。
- PNG（无PSD抠图合成）完成后通过 `setGenerationResults(prev => [...prev, ...pngRows])` 直接追加新行。
- 同一任务被拆成两行，导致：
  - 列表中同一产品图出现两次，用户难以判断它们的关系；
  - 多格式导出时下载入口分散，错误信息难追踪；
  - “一键打包下载”统计也容易被误解。

**设计决策**

- 采用方案 A：**单行多格式**。
- 结果行的唯一键：`(psdId, imgId)`，其中：
  - fresh 模式：`psdId` 为前端 PSD 条目 id；
  - template 模式：`psdId` 为模板 templateId（`templateKey`）。
- PNG/JPG/PSD 的导出结果都写入同一行的 `formatResults`：
  - `formatResults.png | .jpeg | .psd` 分别维护 `{ status, url, error }`。
- 列表渲染策略：
  - 如果行内只有一种格式成功/失败，显示“下载单张”按钮；
  - 如果行内存在多格式，则展示格式徽标（每个徽标自带下载按钮/状态）。
  - 允许在多格式模式下显示一条精简错误摘要（优先展示 PSD 的错误）。

**非目标**

- 不改变服务端导出流程与导出能力；
- 不引入新的数据模型或持久化；
- 不在本次变更中重做“合并PSD”逻辑（bundle 模式保持现有行为）。

