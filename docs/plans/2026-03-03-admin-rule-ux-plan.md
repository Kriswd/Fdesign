# 管理端规则与上传交互优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 增强管理端 Excel 拖拽上传、字段搜索与规则文案易用性，并改进启动脚本打开用户端

**Architecture:** 在 AdminSlotEditor 中扩展 Excel 上传卡片与规则弹窗 UI，新增字段搜索输入与模板字符串“傻瓜拼句”交互；在启动脚本中明确打开用户端；文档同步说明模板字符串与 joiner 含义。

**Tech Stack:** React, Vite, Express, 批处理脚本

---

### Task 1: Excel 字段配置支持拖拽上传

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminSlotEditor.jsx`

**Step 1: Write the failing test**

手工验证：拖拽 Excel 文件到“Excel 字段配置”卡片，出现高亮提示并触发解析。

**Step 2: Run test to verify it fails**

当前仅支持点击上传，拖拽无响应。

**Step 3: Write minimal implementation**

为 Excel 卡片增加拖拽区域、状态提示、拖拽解析复用现有 parseExcelFile 逻辑。

**Step 4: Run test to verify it passes**

拖拽 .xlsx/.xls 可成功解析并填充字段列表。

**Step 5: Commit**

不提交（除非用户明确要求）。

---

### Task 2: 字段下拉支持关键词搜索（包含匹配）

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminSlotEditor.jsx`

**Step 1: Write the failing test**

手工验证：在字段下拉顶部输入关键词，列表实时过滤包含项。

**Step 2: Run test to verify it fails**

当前下拉不支持搜索输入。

**Step 3: Write minimal implementation**

在下拉顶部加入输入框，按包含匹配过滤字段。

**Step 4: Run test to verify it passes**

关键词输入后即时过滤，空态提示正确。

**Step 5: Commit**

不提交（除非用户明确要求）。

---

### Task 3: 模板字符串傻瓜化与 joiner 文案优化

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminSlotEditor.jsx`
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\docs\USER_MANUAL_PSD_AUTOFILL.md`

**Step 1: Write the failing test**

手工验证：模板字符串模式下，可通过点击字段按钮插入，且 joiner/连接符说明更易懂。

**Step 2: Run test to verify it fails**

当前需手动写 {{字段名}}，提示技术化。

**Step 3: Write minimal implementation**

新增字段按钮、示例提示、实时预览文本；joiner 改为“中间符号”并示例说明。

**Step 4: Run test to verify it passes**

能不手写花括号完成拼句，文案清晰易懂。

**Step 5: Commit**

不提交（除非用户明确要求）。

---

### Task 4: 启动脚本自动打开用户端

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\start_psd_to_ecommerce_new.bat`
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\启动_生产模式_用户端.bat`

**Step 1: Write the failing test**

手工验证：bat 启动后自动打开用户端页面。

**Step 2: Run test to verify it fails**

当前未自动打开或打开路径不正确。

**Step 3: Write minimal implementation**

在用户端启动脚本中添加 start URL 行。

**Step 4: Run test to verify it passes**

bat 启动后打开默认浏览器并指向用户端 URL。

**Step 5: Commit**

不提交（除非用户明确要求）。

---

### Task 5: 运行校验命令

**Files:**
- Modify: 无

**Step 1: Run lint**

Run: `npm run lint`  
Expected: PASS

**Step 2: Run build**

Run: `npm run build`  
Expected: PASS
