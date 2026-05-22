# 画板组按用户上传文件名重命名 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在导出阶段将被替换图片变量所属画板组命名为上传文件名（取同画板第一个替换文件名）。

**Architecture:** 服务端读取 manifest.variables 的 path 提取画板名，结合导出 updates 计算 artboardRenameMap 并传入 Photoshop JSX 脚本；脚本在替换图片后定位该图层所属画板组并重命名。

**Tech Stack:** Node.js + Express，ExtendScript JSX（render_export.jsx），现有模板 manifest。

---

### Task 1: 服务端生成画板重命名映射

**Files:**
- Modify: `server/index.js`（导出任务构建处）
- Modify: `server/utils/templateMeta.js`（如需补充画板名提取辅助方法）
- Test: `tests/server-export-error.test.mjs` 或新增小型验证脚本

**Step 1: Write the failing test**

```javascript
import assert from 'assert';
import { buildArtboardRenameMap } from '../server/utils/templateMeta.js';

const variables = [
  { psId: 101, path: '画板A/组/图层1' },
  { psId: 102, path: '画板A/组/图层2' },
  { psId: 201, path: '画板B/组/图层3' },
];
const updates = [
  { psId: 102, varType: 'img', imagePath: '/x/AA.jpg' },
  { psId: 201, varType: 'img', imagePath: '/x/BB.png' },
];
const out = buildArtboardRenameMap({ variables, updates });
assert.deepStrictEqual(out, { '画板A': 'AA', '画板B': 'BB' });
```

**Step 2: Run test to verify it fails**

Run: `node tests/server-export-error.test.mjs`
Expected: FAIL with “buildArtboardRenameMap is not a function”

**Step 3: Write minimal implementation**

```javascript
export function buildArtboardRenameMap({ variables, updates }) {
  const psIdToArtboard = new Map();
  (Array.isArray(variables) ? variables : []).forEach((v) => {
    const psId = Number(v?.psId);
    if (!Number.isFinite(psId)) return;
    const path = String(v?.path || '');
    const artboard = path.split('/')[0] || '';
    if (artboard) psIdToArtboard.set(psId, artboard);
  });
  const map = {};
  (Array.isArray(updates) ? updates : []).forEach((u) => {
    if (String(u?.varType || '').toLowerCase() !== 'img') return;
    const psId = Number(u?.psId);
    if (!Number.isFinite(psId)) return;
    const artboard = psIdToArtboard.get(psId);
    if (!artboard || map[artboard]) return;
    const raw = String(u?.sourceName || u?.imagePath || u?.imageAbsPath || '');
    const base = raw.split(/[/\\]/).pop() || '';
    const name = base.replace(/\.[^.]+$/, '') || base;
    if (name) map[artboard] = name;
  });
  return map;
}
```

**Step 4: Run test to verify it passes**

Run: `node tests/server-export-error.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add server/utils/templateMeta.js tests/server-export-error.test.mjs
git commit -m "feat: build artboard rename map from updates"
```

---

### Task 2: 导出任务把重命名映射传入 JSX

**Files:**
- Modify: `server/index.js`（构建 render_export 任务 payload）
- Modify: `server/services/photoshopIngest.js`（如任务结构在此统一）
- Test: `tests/server-export-error.test.mjs` 或新增脚本

**Step 1: Write the failing test**

```javascript
import assert from 'assert';
import { buildExportJobPayload } from '../server/services/photoshopIngest.js';
const payload = buildExportJobPayload({ templateId: 'id', updates: [{ psId: 1, varType: 'img', imagePath: '/x/a.jpg' }] });
assert.ok(payload.artboardRenames);
```

**Step 2: Run test to verify it fails**

Run: `node tests/server-export-error.test.mjs`
Expected: FAIL with “artboardRenames missing”

**Step 3: Write minimal implementation**

```javascript
const artboardRenames = buildArtboardRenameMap({ variables: manifest.variables, updates });
job.artboardRenames = artboardRenames;
```

**Step 4: Run test to verify it passes**

Run: `node tests/server-export-error.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add server/index.js server/services/photoshopIngest.js tests/server-export-error.test.mjs
git commit -m "feat: pass artboard rename map to export job"
```

---

### Task 3: Photoshop 脚本重命名画板组

**Files:**
- Modify: `server/photoshop/render_export.jsx`
- Test: 手动导出验证脚本或一键导出流程

**Step 1: Write the failing test**

```javascript
// 使用真实 PSD 进行人工验证
// 1. 导出任务包含 artboardRenames
// 2. 导出 PSD 中画板组名称应变为文件名
```

**Step 2: Run test to verify it fails**

Expected: 画板组名未改变

**Step 3: Write minimal implementation**

```javascript
function renameArtboardGroupByLayer(layer, renameMap, logArr) {
  var parent = layer ? layer.parent : null;
  while (parent && parent.parent) {
    if (parent.artboardEnabled || parent.isArtboardGroup) {
      var key = String(parent.name || "");
      if (renameMap && renameMap.hasOwnProperty(key)) {
        var next = String(renameMap[key] || "");
        if (next) parent.name = next;
      }
      break;
    }
    parent = parent.parent;
  }
}
```

**Step 4: Run test to verify it passes**

Expected: 导出 PSD 画板组名更新为文件名（同画板多图取第一个）

**Step 5: Commit**

```bash
git add server/photoshop/render_export.jsx
git commit -m "feat: rename artboard groups on export"
```

---

### Task 4: 文档与回归

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEV_LOG.md`

**Step 1: Update docs**

```markdown
- 导出时可对画板组命名进行动态替换（来自用户上传文件名）
```

**Step 2: Run lint/build**

Run: `npm run lint`
Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md docs/DEV_LOG.md
git commit -m "docs: document artboard rename on export"
```
