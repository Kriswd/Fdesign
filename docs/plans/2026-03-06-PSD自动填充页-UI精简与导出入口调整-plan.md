# PSD 自动填充页 UI 精简与导出入口调整 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 隐藏历史切片/导出区，将“导出修改后的PSD”入口移到数据绑定区，并简化数据绑定信息展示。

**Architecture:** 仅修改 `PsdAutoFillTab.jsx` 的 UI 渲染与文案逻辑，不改导出/绑定的数据流；保留原导出函数，仅调整入口位置并隐藏旧区域。

**Tech Stack:** React, TailwindCSS, Vite, lucide-react

---

### Task 1: 隐藏底部“切片与导出”区域

**Files:**
- Modify: `src/pages/Workbench/PsdAutoFillTab.jsx`

**Step 1: 找到“第三行：切片与导出”卡片 JSX 并整体停止渲染**
- 方式：直接删除该 JSX 或用条件包裹为 `false && (...)`（推荐删除 JSX，保留 handler 不动）。

**Step 2: 本地手动验证**
- 页面底部不再出现“切片与导出”卡片。

### Task 2: 将“导出修改后的PSD”按钮移到“数据绑定”区域

**Files:**
- Modify: `src/pages/Workbench/PsdAutoFillTab.jsx`

**Step 1: 在“数据绑定”标题行右侧新增按钮**
- 复用现有 `handleExportByPhotoshop` 回调。
- 按钮禁用：`exporting` 时禁用；无 `templateId` 时不显示（或显示但禁用，二选一，保持与现状一致）。

**Step 2: 移除旧位置的导出按钮**
- 因为 Task 1 已隐藏整块，确保旧入口不再显示即可。

**Step 3: 本地手动验证**
- 数据绑定卡片能看到导出按钮并可触发导出。

### Task 3: 移除画布头部“图层数统计”

**Files:**
- Modify: `src/pages/Workbench/PsdAutoFillTab.jsx`

**Step 1: 删除 `psdData.layers?.length` 徽标**
- 确保画布头部不再出现“0 图层”。

### Task 4: 数据绑定区商品位信息简化

**Files:**
- Modify: `src/pages/Workbench/PsdAutoFillTab.jsx`

**Step 1: 商品位标题显示用户命名**
- 从 `slot.name` 读取，显示 `商品位{idx+1} · {slot.name}`（name 为空则省略）。

**Step 2: 去除困惑性行号/序号展示**
- 列表中不再显示 “第 N 行”。
- pendingRow 区域不再回退显示 “第 N 行”。
- 下拉 option 不再包含 `n -` 前缀：优先显示主键值，其次第一列值，兜底显示 `第 {n} 行`（仅下拉中作为兜底）。

**Step 3: 本地手动验证**
- 商品位卡片不再出现多套编号信息。
- 绑定状态对用户可理解（主键/第一列优先展示）。

### Task 5: 校验与构建

**Files:**
- N/A

**Step 1: 运行 lint**
- Run: `npm run lint`
- Expected: exit code 0

**Step 2: 运行 build**
- Run: `npm run build`
- Expected: exit code 0
