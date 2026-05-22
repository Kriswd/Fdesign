# 批量出图页面添加任务模版导入导出按钮

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户端批量导出产品图页面(`BatchProductImageTab.jsx`)的任务模版PSD选择区域右侧,添加"导出"和"导入"按钮,支持一键备份和恢复全部任务模版数据

**Architecture:** 后端API已存在且可用(`/api/task-templates/export-all`和`/api/task-templates/import-all`),仅需在前端`BatchProductImageTab.jsx`中添加handler和UI按钮。handler调用已存在的公开API,通过浏览器下载/上传JSON文件实现备份恢复

**Tech Stack:** React, lucide-react, 浏览器File API, 已存在的后端API

---

### Task 1: 添加Download和Upload图标导入

**Files:**
- Modify: `src/pages/Workbench/BatchProductImageTab.jsx:1-5` (顶部import区域)

- [ ] **Step 1: 修改顶部icon导入**

当前代码(第3行):
```javascript
import { Upload, X, Play, Download, Loader2, CheckCircle, AlertCircle, FileImage, Layers, Save, RefreshCw, Trash2, ChevronDown } from 'lucide-react';
```

检查该行,`Download` 和 `Upload` 已经从 lucide-react 导入了。**无需修改**,直接进入下一步。

- [ ] **Step 2: 验证**

确认第3行包含 `Download` 和 `Upload` 两个图标。

---

### Task 2: 添加 handleExportAllTaskTemplates 和 handleImportAllTaskTemplates handlers

**Files:**
- Modify: `src/pages/Workbench/BatchProductImageTab.jsx` (在 `loadTaskTemplates` 回调后面,约第767行附近添加)

- [ ] **Step 1: 找到插入位置**

在文件约第767行附近,找到这段代码:
```javascript
  }, [loadTaskTemplates, taskMode]);

  const loadTaskTemplateDetail = useMemo(() => {
```

- [ ] **Step 2: 在 `loadTaskTemplates` 和 `loadTaskTemplateDetail` 之间插入两个handler**

```javascript
  }, [loadTaskTemplates, taskMode]);

  const handleExportAllTaskTemplates = useCallback(async () => {
    try {
      const resp = await fetch(`${renderServerBaseUrl}/api/task-templates/export-all`, {
        credentials: 'include',
      });
      if (!resp.ok) {
        throw new Error('导出失败');
      }
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `task_templates_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '导出失败';
      alert(`任务模板导出失败: ${msg}`);
    }
  }, [renderServerBaseUrl]);

  const handleImportAllTaskTemplates = useCallback(
    async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      e.target.value = '';
      const confirmed = window.confirm('导入将覆盖当前全部任务模板,确认继续?');
      if (!confirmed) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const resp = await fetch(`${renderServerBaseUrl}/api/task-templates/import-all`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(result.error || result.message || '导入失败');
        }
        alert(`导入成功,共导入 ${result.imported || 0} 个任务模板`);
        // 刷新任务模板列表
        const listResp = await fetch(`${renderServerBaseUrl}/api/task-templates`, {
          credentials: 'include',
        });
        if (listResp.ok) {
          const listData = await listResp.json();
          setTaskTemplates(Array.isArray(listData) ? listData : []);
        }
      } catch (err) {
        const msg = err && err.message ? String(err.message) : '导入失败';
        alert(`任务模板导入失败: ${msg}`);
      }
    },
    [renderServerBaseUrl],
  );

  const loadTaskTemplateDetail = useMemo(() => {
```

- [ ] **Step 3: 验证**

确认:
1. `handleExportAllTaskTemplates` 和 `handleImportAllTaskTemplates` 定义在组件内部
2. 使用了 `useCallback` 包装,依赖项为 `[renderServerBaseUrl]`
3. `renderServerBaseUrl` 是组件props,在函数签名中已存在(第73行)
4. 导出不需要刷新列表(纯下载),导入后自动刷新 `taskTemplates` 状态
5. 使用 `fetch` 而非 `apiClient`,因为批量出图页面没有注入 `apiClient`

---

### Task 3: 在任务模板选择器右侧添加导出/导入按钮

**Files:**
- Modify: `src/pages/Workbench/BatchProductImageTab.jsx` (约第5683-5686行,任务模式切换按钮区域)

- [ ] **Step 1: 找到目标区域**

找到以下代码块(约第5683-5686行):
```jsx
              <button
                type="button"
                onClick={() => setTaskMode('template')}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                  taskMode === 'template' ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                从任务模板
              </button>
            </div>
            {taskMode === 'template' && (
             <div ref={taskTemplateSelectRootRef} className="flex-1 min-w-0 relative">
```

- [ ] **Step 2: 修改布局,添加按钮**

将:
```jsx
              <button
                type="button"
                onClick={() => setTaskMode('template')}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                  taskMode === 'template' ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                从任务模板
              </button>
            </div>
            {taskMode === 'template' && (
             <div ref={taskTemplateSelectRootRef} className="flex-1 min-w-0 relative">
```

修改为:
```jsx
              <button
                type="button"
                onClick={() => setTaskMode('template')}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                  taskMode === 'template' ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                从任务模板
              </button>
            </div>
            {taskMode === 'template' && (
             <div className="flex items-center gap-2">
              <div ref={taskTemplateSelectRootRef} className="flex-1 min-w-0 relative">
```

- [ ] **Step 3: 在选择器后面添加导出/导入按钮**

找到任务模板选择器的闭合部分(约第5780行附近):
```jsx
              </div>
             )}
           </div>
```

修改为:
```jsx
              </div>
             )}
              <button
                type="button"
                onClick={handleExportAllTaskTemplates}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-gray-100 transition-colors shrink-0"
                title="导出全部任务模板"
              >
                <Download className="w-3 h-3" />
                导出
              </button>
              <label
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-gray-100 transition-colors shrink-0 cursor-pointer"
                title="导入任务模板"
              >
                <Upload className="w-3 h-3" />
                导入
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportAllTaskTemplates}
                />
              </label>
             </div>
           </div>
```

- [ ] **Step 4: 验证**

确认:
1. 导出/导入按钮仅在 `taskMode === 'template'` 时显示
2. 按钮使用 `flex items-center gap-2` 包裹,与选择器水平排列
3. 导入按钮使用 `<label>` 包裹隐藏 `<input type="file">`,点击label触发文件选择
4. 按钮样式与页面整体风格一致(小号,半透明背景,hover高亮)
5. 外层新增的 `<div className="flex items-center gap-2">` 必须有对应的闭合 `</div>`

---

### Task 4: 端到端验证

**Files:**
- 无需修改,仅验证

- [ ] **Step 1: 启动后端服务**

```bash
cd E:\ProjectX\Fdesign\psd-to-ecommerce-new
npm run server
```

确认后端启动在 `http://127.0.0.1:3001`

- [ ] **Step 2: 测试后端API**

浏览器访问: `http://127.0.0.1:3001/api/task-templates/export-all`

期望: 返回包含 `version`, `exportedAt`, `nextId`, `templates` 的JSON

- [ ] **Step 3: 启动前端**

```bash
npm run dev
```

访问: `http://127.0.0.1:3010`

- [ ] **Step 4: UI验证**

1. 进入"批量生成产品图"页面
2. 选择"从任务模板"模式
3. 确认任务模板选择器右侧显示[导出][导入]两个按钮
4. 点击"导出"按钮,确认能下载JSON文件
5. 点击"导入"按钮,选择JSON文件,确认弹出确认对话框
6. 确认后确认提示"导入成功,共导入X个任务模板"
7. 确认任务模板列表自动刷新

- [ ] **Step 5: 语法验证**

```bash
npm run lint
```

确认无语法错误

---

### 风险提示

1. **fetch vs apiClient**: 批量出图页面没有注入`apiClient`,所以使用原生`fetch`调用,需确保`renderServerBaseUrl`正确拼接
2. **导入后刷新**: 导入成功后直接更新`taskTemplates`状态,而非调用`loadTaskTemplates()`,避免异步竞态
3. **按钮可见性**: 按钮仅在`taskMode === 'template'`时显示,符合"放在任务模版PSD区域"的需求
