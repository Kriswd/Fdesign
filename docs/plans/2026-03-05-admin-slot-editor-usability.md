# AdminSlotEditor Usability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 改善管理端商品位配置效率：去冗余信息、定位不改变缩放、按选中顺序追加变量。

**Architecture:** 提取可测试的纯函数（变量排序、画布平移定位参数计算），由 UI 组件调用；在 TemplateCanvas 的 imperative handle 上新增仅平移定位方法并在 AdminSlotEditor 使用。

**Tech Stack:** React, react-zoom-pan-pinch, Node.js test runner (node:test)

---

### Task 1: 变量按选中顺序追加（可测试）

**Files:**
- Create: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\utils\selectionOrder.js`
- Test: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\tests\selection_order.test.js`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminSlotEditor.jsx`

**Step 1: Write failing test**
- 断言：输入变量数组与选中 id 数组，返回按选中顺序的变量列表；过滤不存在 id；去重。

**Step 2: Run test to verify it fails**
- Run: `node --test tests/selection_order.test.js`
- Expected: FAIL（模块不存在）

**Step 3: Implement minimal utility**
- 实现 `orderBySelectedIds(variables, selectedIds)`

**Step 4: Run test to verify it passes**
- Run: `node --test tests/selection_order.test.js`

**Step 5: Wire into AdminSlotEditor**
- `assignVariablesToSlot` 使用 `selectedVariableIds` 顺序追加。

---

### Task 2: 画布定位只平移不改缩放（可测试）

**Files:**
- Create: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\utils\panTransform.js`
- Test: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\tests\pan_transform.test.js`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\components\TemplateCanvas.jsx`
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminSlotEditor.jsx`

**Step 1: Write failing test**
- 断言：给定 viewport、scale、目标中心点，计算 positionX/Y 让目标居中。

**Step 2: Run test to verify it fails**
- Run: `node --test tests/pan_transform.test.js`
- Expected: FAIL（模块不存在）

**Step 3: Implement minimal utility**
- 实现 `computePanToCenter({ viewportWidth, viewportHeight, scale, targetCenterX, targetCenterY })`

**Step 4: Run test to verify it passes**
- Run: `node --test tests/pan_transform.test.js`

**Step 5: Expose panToVariable in TemplateCanvas**
- 在 ref API 上增加 `panToVariable(variableId)`
- 使用当前 scale + viewportSize 计算 setTransform 的 positionX/Y

**Step 6: Use panToVariable in AdminSlotEditor**
- `scrollToVariable` 不再调用 `zoomToVariable`，优先 `panToVariable`

---

### Task 3: 移除商品位变量行冗余提示

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminSlotEditor.jsx`

**Steps:**
- 移除“未绑定字段/无规则”等文字行，仅保留必要控件（下拉/规则按钮/删除）。

---

### Task 4: Verify

**Steps:**
- Run: `node --test`
- Run: `npm run lint`
- Run: `npm run build`
