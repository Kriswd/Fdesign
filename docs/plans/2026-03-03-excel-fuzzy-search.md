# Excel 全表模糊搜索 + 自动定位选中（实时）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 上传 Excel 后支持全表字段值模糊搜索，实时筛选并自动定位选中第一条命中行，表格区域内部滚动。

**Architecture:** 在 `DataConsole` 内构建每行搜索索引（拼接全文小写），对输入做防抖后筛选命中行；命中后用 `scrollIntoView` 定位并通过 `onRowSelected` 选中；表格容器设置最大高度并内部滚动。

**Tech Stack:** React, Zustand, Tailwind

---

### Task 1: 为 DataConsole 增加“全表模糊搜索”索引与筛选

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\components\DataConsole.jsx`

**Step 1: 写失败用例（手工验收）**

- 上传包含 1000+ 行的 Excel。
- 在搜索框输入“型号/品牌/任意字段片段”应能筛出命中行（非主键字段也可）。
- 当前版本：只能按主键精确查找且仅显示前 100 行 → FAIL。

**Step 2: 实现索引**

- 用 `useMemo` 生成 `rowIndex`：
  - `{ row, rowIndex, haystackLower }`
  - `haystackLower` = `activeHeaders` 遍历取值，转字符串，拼接成一段文本并 `.toLowerCase()`

**Step 3: 实现筛选规则**

- query 规范化：`trim()` → `toLowerCase()` → 按空白拆 token
- 命中条件：所有 token 都 `includes`（AND）
- `filteredRows`：无 query 时为 `rows`；有 query 时为命中行列表（保持原顺序）

---

### Task 2: 实时搜索防抖与自动定位选中第一条命中行

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\components\DataConsole.jsx`

**Step 1: 防抖**

- 增加 `debouncedQuery` 状态，输入变化后延迟 150ms 更新（`setTimeout` + cleanup）。

**Step 2: 自动选中 + 定位**

- 给每一行 `<tr>` 增加稳定 key（优先使用 `primaryKey` 的值，否则使用 `rowIndex`）。
- 给每一行增加 `ref` 存储（`Map<key, HTMLElement>` 或回调 ref）。
- 当 `debouncedQuery` 变化且 `filteredRows.length>0`：
  - 调用 `onRowSelected(filteredRows[0])`（保持与现有页面联动一致）
  - 对应行执行 `scrollIntoView({ block: 'center' })`

---

### Task 3: 表格区域高度限制与内部滚动

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\components\DataConsole.jsx`

**Step 1: 调整布局**

- 为表格容器加 `max-h`（例如 `max-h-[60vh]`）并确保内部 `overflow-auto` 生效。
- 在搜索结果统计区显示 `命中 X / 总计 Y`，避免用户困惑“只显示部分”。

---

### Task 4: 回归验证

**Files:**
- None

**Step 1: 手工验证**

- 上传 Excel 后输入非主键字段片段：命中、自动选中、自动滚动。
- 清空搜索：恢复全量展示，表格仍在固定区域内滚动。

**Step 2: Run lint**

Run: `npm run lint`
Expected: exit code 0

**Step 3: Run build**

Run: `npm run build`
Expected: exit code 0

