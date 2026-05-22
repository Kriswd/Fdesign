# 任务模版导出/导入功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理后台任务模版页面增加"导出"和"导入"按钮,支持一键备份和恢复全部任务模版数据

**Architecture:** 后端新增2个REST API(导出/导入),前端在AdminTaskTemplateTab顶部增加2个按钮,通过浏览器下载/上传JSON文件实现备份恢复

**Tech Stack:** Node.js/Express, React, 浏览器File API

---

### Task 1: 后端 service 层 - exportAll / importAll 方法

**Files:**
- Modify: `server/services/taskTemplateService.js` (在 `list()` 方法后面添加新方法)

- [ ] **Step 1: 添加 `exportAll()` 方法**

在 `taskTemplateService.js` 的 `list()` 方法后面(约第570行附近)添加:

```javascript
  /**
   * 导出全部任务模版为完整JSON数据
   * @returns {Object} 包含version, exportedAt, nextId, templates
   */
  exportAll() {
    const db = this.readDb();
    const templates = Array.isArray(db.templates) ? db.templates : [];
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      nextId: db.nextId || 1,
      templates: templates.map((t) => ({
        id: Number(t?.id || 0),
        name: String(t?.name || ''),
        createdAt: String(t?.createdAt || ''),
        updatedAt: String(t?.updatedAt || ''),
        items: Array.isArray(t?.items) ? t.items : [],
      })),
    };
  }
```

- [ ] **Step 2: 添加 `importAll(data)` 方法**

在 `exportAll()` 方法后面添加:

```javascript
  /**
   * 导入备份数据,覆盖全部已有任务模版
   * @param {Object} data - 导出的JSON数据
   * @returns {Object} { success: boolean, imported: number }
   */
  importAll(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('导入数据格式无效');
    }
    const templates = data.templates;
    if (!Array.isArray(templates)) {
      throw new Error('缺少 templates 数组');
    }

    // 校验每个模版数据
    for (let i = 0; i < templates.length; i += 1) {
      const t = templates[i];
      const tid = Number(t?.id);
      if (!Number.isInteger(tid) || tid < 0) {
        throw new Error(`模版 #${i} 的 id 无效: ${tid}`);
      }
      const name = String(t?.name || '').trim();
      if (!name) {
        throw new Error(`模版 #${i} 的 name 不能为空`);
      }
      const items = Array.isArray(t?.items) ? t.items : [];
      if (items.length > 50) {
        throw new Error(`模版 "${name}" 的 PSD 数量超过上限(50)`);
      }
      for (let j = 0; j < items.length; j += 1) {
        const it = items[j];
        const templateId = String(it?.templateId || '').trim();
        if (!templateId) {
          throw new Error(`模版 "${name}" 的第 ${j + 1} 个 item 缺少 templateId`);
        }
        if (!isSafeTemplateId(templateId)) {
          throw new Error(`模版 "${name}" 的 templateId 格式无效: ${templateId}`);
        }
      }
    }

    // 校验通过后,备份当前数据并覆盖
    const normalizedTemplates = templates.map((t) => {
      const items = Array.isArray(t?.items) ? t.items : [];
      return {
        id: Number(t.id),
        name: String(t.name),
        createdAt: String(t.createdAt || new Date().toISOString()),
        updatedAt: String(t.updatedAt || new Date().toISOString()),
        items,
      };
    });

    const nextId = Number.isInteger(Number(data.nextId)) && data.nextId > 0
      ? data.nextId
      : Math.max(0, ...normalizedTemplates.map((t) => t.id)) + 1;

    const newDb = {
      nextId,
      templates: normalizedTemplates,
    };

    this.writeDb(newDb);
    return { success: true, imported: normalizedTemplates.length };
  }
```

- [ ] **Step 3: 验证**

确认 `taskTemplateService.js` 文件没有语法错误,`isSafeTemplateId` 函数在该文件顶部已存在(第13行左右)。

---

### Task 2: 后端 API 路由 - export-all / import-all

**Files:**
- Modify: `server/index.js` (在现有 task-templates 路由后面添加,约第856行附近)

- [ ] **Step 1: 添加导出路由**

在现有 `task-templates` 路由区域(不需要admin认证的公开路由)添加:

```javascript
// 导出全部任务模版(不需要admin认证)
app.get('/api/task-templates/export-all', async (req, res) => {
  try {
    const data = taskTemplateService.exportAll();
    res.json(data);
  } catch (e) {
    console.error('[error][export-all]', e.message);
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: 添加导入路由**

紧接着添加:

```javascript
// 导入全部任务模版(不需要admin认证)
app.post('/api/task-templates/import-all', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: '请求体必须是JSON对象' });
    }
    const result = taskTemplateService.importAll(data);
    res.json(result);
  } catch (e) {
    console.error('[error][import-all]', e.message);
    res.status(400).json({ error: e.message });
  }
});
```

- [ ] **Step 3: 验证**

确认路由位置在现有 task-templates 路由块内,不与其他路由冲突。

---

### Task 3: 前端 UI - 导出按钮和下载逻辑

**Files:**
- Modify: `src/pages/AdminTaskTemplateTab.jsx` (约第1058行附近的header区域)

- [ ] **Step 1: 在header区域添加导出和导入按钮**

找到现有代码(约第1058-1068行):

```jsx
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-100 tracking-tight">任务模板</div>
            <div className="mt-2 text-xs text-gray-500">
              第一步上传 PSD 或选择已有任务模板；第二步进入配置页绑定参考线并保存。
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={refreshTaskTemplates}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新列表
            </button>
          </div>
        </div>
```

修改为:

```jsx
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-gray-100 tracking-tight">任务模板</div>
            <div className="mt-2 text-xs text-gray-500">
              第一步上传 PSD 或选择已有任务模板；第二步进入配置页绑定参考线并保存。
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
            >
              <Download className="w-4 h-4" />
              导出
            </button>
            <label
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              导入
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportAll}
              />
            </label>
            <button
              type="button"
              onClick={refreshTaskTemplates}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新列表
            </button>
          </div>
        </div>
```

- [ ] **Step 2: 在文件顶部添加 `Download` 图标导入**

修改文件顶部imports(第2行左右),在现有导入中增加 `Download`:

```javascript
import { ArrowLeft, ArrowLeftRight, Check, ChevronDown, Download, Plus, RefreshCw, Save, Search, Trash2, Upload } from 'lucide-react';
```

- [ ] **Step 3: 添加 `handleExportAll` 和 `handleImportAll` handler**

在 `refreshTaskTemplates` 回调后面(约第270行附近)添加:

```javascript
  const handleExportAll = useCallback(async () => {
    try {
      const { res: resp } = await apiClient.fetchWithFallback('/api/task-templates/export-all', {
        credentials: 'include',
      });
      if (!resp.ok) {
        throw new Error('导出失败');
      }
      const data = await resp.json();
      // 触发浏览器下载
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
      alert(buildUserErrorText(e, '导出失败'));
    }
  }, [apiClient, buildUserErrorText]);

  const handleImportAll = useCallback(
    async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      // 重置input,允许重复选择同一文件
      e.target.value = '';

      const confirmed = window.confirm('导入将覆盖当前全部任务模版,确认继续?');
      if (!confirmed) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const { res: resp } = await apiClient.fetchWithFallback('/api/task-templates/import-all', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(result.error || result.message || '导入失败');
        }
        alert(`导入成功,共导入 ${result.imported || 0} 个任务模版`);
        await refreshTaskTemplates();
      } catch (e) {
        alert(buildUserErrorText(e, '导入失败'));
      }
    },
    [apiClient, buildUserErrorText, refreshTaskTemplates],
  );
```

- [ ] **Step 4: 在组件的 return 前面添加这两个handler的依赖**

确认 `handleExportAll` 和 `handleImportAll` 在组件return前定义,且使用了正确的 `useCallback` 依赖。

- [ ] **Step 5: 验证**

确认 JSX 中引用的 `handleExportAll` 和 `handleImportAll` 与定义的函数名完全一致。确认 `Download` 图标已从 lucide-react 正确导入。

---

### Task 4: 验证和测试

**Files:**
- 无需修改,仅验证

- [ ] **Step 1: 启动后端服务**

```bash
cd E:\ProjectX\Fdesign\psd-to-ecommerce-new
npm run server
```

- [ ] **Step 2: 测试导出API**

浏览器访问: `http://127.0.0.1:3001/api/task-templates/export-all`

期望: 返回包含 `version`, `exportedAt`, `nextId`, `templates` 的JSON

- [ ] **Step 3: 测试导入API**

使用 curl 或 Postman:
```bash
curl -X POST http://127.0.0.1:3001/api/task-templates/import-all \
  -H "Content-Type: application/json" \
  -d '{"version":"1.0","nextId":2,"templates":[]}'
```

期望: `{"success":true,"imported":0}`

- [ ] **Step 4: 前端UI验证**

启动前端:
```bash
npm run dev
```

访问管理后台 → 任务模版页面,确认:
1. 顶部显示三个按钮: [导出] [导入] [刷新列表]
2. 点击"导出"能下载JSON文件
3. 点击"导入"能选择文件并弹出确认对话框
4. 导入成功后列表自动刷新
