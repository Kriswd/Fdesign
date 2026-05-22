# 画板 PSD 导出整体偏移修复 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在单文件 PSD 导出链路中，彻底避免画板模板在图片替换后出现整批画板整体下移、文本再被 `stable_text_restore` 二次补偿的混合偏移问题，并为未来回归提供最快速的定位与修复路径。

**Architecture:** 本问题不是前端 `updates[]` 坐标传错，而是 Photoshop JSX 在图片替换分支里过早回放图层层级/画板位置，导致“临时置入后的大尺寸智能对象”在错误时机参与几何计算，污染后续画板空间。正确做法是：先完成 `replacePlacedContents`，再把副本图层恢复到原父级/兄弟位置，并且仅在画板稳态模式开启时回放原画板矩形位置；随后再走 `desiredRect` 选择与 `fitLayerToRect`。回归保护依赖 `tests/artboard_export_stability.test.mjs` 的顺序断言，以及真实导出日志中的几何字段。

**Tech Stack:** Node.js + Express、Photoshop ExtendScript ES3（`render_export.jsx`）、`node:test`、真实导出日志与 PSD 工件。

---

## 背景结论（未来排障时先看这段）

历史现场证明，这个问题有两个层次：

1. **第一层根因：图片替换链路在错误时机回放图层位置**
   - 失败样本日志会出现大量：
     - `artboardOffset=...,1024`
     - `desiredRectRejected=update_distance_1024`
     - `stableRectAlignSource=raw_x_raw_plus_artboard_y`
   - 同一批 `updates[]` 在成功样本中，对应位置通常是：
     - `artboardOffset=...,0` 或原始真实画板 top
     - `desiredRectSource=update`
     - 不会系统性出现 `update_distance_1024`

2. **第二层症状：文本稳态回放在错误几何基础上继续补偿**
   - 失败样本尾部会出现大量：
     - `stable_text_restored psId=... dx=0 dy=-1024`
   - 这不是最初根因，而是前面画板空间已经被污染后，文本稳态回放做出的二次补偿。

**因此，修复顺序必须是：先修图片替换时机，再看文本。**

---

### Task 1: 先用日志确认是不是同一类回归

**Files:**
- Read: `server/photoshop/render_export.jsx`
- Read: `server/services/photoshopIngest.js`
- Read: 最新 `exports/job_*.json.log`
- Read: 最新 `exports/job_*.json`
- Read: 最新 `exports/result_*.json`
- Optional: 对比导出的 `.psd/.psb` 与 source PSD

**Step 1: 读取失败日志中的关键字段**

重点搜索这些关键词：

```text
artboardOffset=
desiredRectRejected=update_distance_1024
stableRectAlignSource=raw_x_raw_plus_artboard_y
stable_text_restored psId=
mode=single
updatedText=
updatedImage=
```

**Step 2: 对照成功样本或上一份正常导出**

成功样本与失败样本必须做同位点对照，至少对比 1 个图片层和 1 个文本层。

**推荐对照规则：**
- 同一 `psId` 在成功样本里如果 `updateRectRaw` 与 `beforeRect` 一致，那么失败样本不应突然变成 `desiredRectRejected=update_distance_1024`
- 同一画板第一行元素若成功样本 `artboardOffset=...,0`，失败样本若变成 `...,1024`，说明画板空间已经被整体下推
- 如果尾部出现大量 `stable_text_restored ... dy=-1024`，不要先改文本逻辑，先追图片替换顺序

**Step 3: 记录结论**

把结论写成一句明确假设：

```text
我认为根因是：图片替换时，副本图层在 replacePlacedContents 之前就执行了位置/画板回放，导致临时大尺寸智能对象污染画板几何；因为失败样本出现系统性 artboardOffset +1024 与 desiredRectRejected=update_distance_1024，而成功样本没有。
```

**Step 4: 人工验证这一步是否完成**

完成标准：你已经能回答“为什么是图片链路先坏，而不是文本链路先坏”。

**Step 5: Commit（仅在你真的做了新的辅助脚本时）**

```bash
git add <diagnostic-script-if-any>
git commit -m "test: add artboard offset diagnostic helper"
```

---

### Task 2: 先写失败测试，锁死正确顺序

**Files:**
- Modify: `tests/artboard_export_stability.test.mjs`
- Test: `tests/artboard_export_stability.test.mjs`

**Step 1: Write the failing test**

把下面这个测试加入 `tests/artboard_export_stability.test.mjs`：

```javascript
test('render_export 图片替换应在回到画板前完成置入，避免临时大图把后续画板整体下推', () => {
  const p = path.resolve(process.cwd(), 'server/photoshop/render_export.jsx');
  const content = fs.readFileSync(p, 'utf8');
  const imgBlockStart = content.indexOf('} else if (u && u.varType === "img") {');
  assert.notEqual(imgBlockStart, -1, 'missing image update block');
  const replaceIdx = content.indexOf('replacePlacedContents(imgPath);', imgBlockStart);
  const restorePlacementIdx = content.indexOf('restoreLayerPlacement(smartTarget, placeInfo);', imgBlockStart);
  assert.notEqual(replaceIdx, -1, 'missing replacePlacedContents');
  assert.notEqual(restorePlacementIdx, -1, 'missing restoreLayerPlacement');
  assert.ok(replaceIdx < restorePlacementIdx, 'expected image replacement before restoring artboard placement');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/artboard_export_stability.test.mjs
```

Expected: FAIL with `expected image replacement before restoring artboard placement`

**Step 3: 不要改测试，让它保持失败证据**

只有在你确认失败原因确实来自顺序不对时，才能进入下一步。

**Step 4: 记录 red 阶段结果**

最少记录：

```text
FAIL: replacePlacedContents 在 restoreLayerPlacement 之后
```

**Step 5: Commit（可选，若团队习惯红测提交）**

```bash
git add tests/artboard_export_stability.test.mjs
git commit -m "test: capture artboard offset regression order"
```

---

### Task 3: 在 JSX 图片分支里做最小修复

**Files:**
- Modify: `server/photoshop/render_export.jsx`
- Test: `tests/artboard_export_stability.test.mjs`

**Step 1: 找到唯一允许修改的位置**

目标函数：
- `applyUpdatesToDoc(workDoc, updates, logArr, artboardRenames, updateOptions)`

目标分支：
- `} else if (u && u.varType === "img") {`

**Step 2: 只改图片替换顺序，不要顺手重构别的逻辑**

错误顺序（回归版本）是：

```javascript
isolateR = isolateSmartObjectLayer(smartTarget);
smartTarget = isolateR && isolateR.layer ? isolateR.layer : smartTarget;
restoreLayerPlacement(smartTarget, placeInfo);
if (preserveArtboardTextPosition) {
  restoreLayerArtboardPosition(smartTarget, placeRectBeforeIsolate, logArr, "img_update[" + String(i) + "]");
}
replacePlacedContents(imgPath);
```

正确顺序必须改成：

```javascript
isolateR = isolateSmartObjectLayer(smartTarget);
smartTarget = isolateR && isolateR.layer ? isolateR.layer : smartTarget;
workDoc.activeLayer = smartTarget;
replacePlacedContents(imgPath);
restoreLayerPlacement(smartTarget, placeInfo);
if (preserveArtboardTextPosition) {
  restoreLayerArtboardPosition(smartTarget, placeRectBeforeIsolate, logArr, "img_update[" + String(i) + "]");
}
try { if (target && target !== smartTarget) target.remove(); } catch (eRmDup) {}
```

**Step 3: 为什么必须这样改**

- `replacePlacedContents(imgPath)` 之后，Photoshop 才知道最终置入内容的真实 bounds
- 如果在置入前就回放层级/位置，临时超大内容可能改变画板内几何参考
- `restoreLayerPlacement(...)` 的职责是恢复父级与兄弟顺序，不应该提前到置图前执行
- `restoreLayerArtboardPosition(...)` 只在 `preserveArtboardTextPosition === true` 时执行，避免非画板模式走额外几何回放

**Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/artboard_export_stability.test.mjs
```

Expected: PASS，且新增顺序测试通过

**Step 5: Commit**

```bash
git add server/photoshop/render_export.jsx tests/artboard_export_stability.test.mjs
git commit -m "fix: restore image layer placement after replace"
```

---

### Task 4: 验证普通导出与画板稳态模式的边界

**Files:**
- Read: `server/services/photoshopIngest.js`
- Read: `server/photoshop/render_export.jsx`
- Test: `tests/artboard_export_stability.test.mjs`

**Step 1: 确认画板稳态开关只在特定条件下开启**

在 `server/services/photoshopIngest.js` 里确认这几个事实：

```javascript
const shouldUseContentEdgeAlignment =
  isPsdAutoFill === true &&
  hasClientUpdates &&
  (clientUpdates || []).some((u) => String(u?.varType || '').toLowerCase() === 'img');

const hasArtboardTemplate = detectTemplateHasArtboard({ manifest, psdPath });
const enableArtboardStableExport = shouldUseContentEdgeAlignment && hasArtboardTemplate;
```

以及：

```javascript
preserveArtboardTextPosition: enableArtboardStableExport,
mode: 'single',
```

**Step 2: 确认 JSX 只在显式开关开启时做画板稳态动作**

在 `server/photoshop/render_export.jsx` 里确认：

```javascript
var preserveArtboardTextPosition = job.preserveArtboardTextPosition === true;
```

只有这个布尔值为 `true` 时，才会进入：
- `captureStableTextBounds(...)`
- `captureStableUpdateRects(...)`
- `restoreStableTextBounds(...)`
- `restoreLayerArtboardPosition(...)`

**Step 3: 明确边界结论**

未来如果有人问“普通 PSD 导出会不会受画板模式影响”，标准答案是：

```text
画板稳态开关本身不会影响普通非画板/非 PSD 自动填充导出，因为 preserveArtboardTextPosition 只在“PSD 自动填充 + 有图片 clientUpdates + 模板含 artboard”时开启。
```

但要同时补一句：

```text
这次真正修复的“replace 之后再 restore placement”是单文件图片替换分支的通用正确顺序，不是 artboard-only hack；它会影响所有 single 图片替换导出，但这是更安全的通用修复，不是额外副作用链路。
```

**Step 4: 运行现有回归测试**

Run:

```bash
node --test tests/artboard_export_stability.test.mjs
```

Expected: PASS

**Step 5: Commit（如果你额外补了边界测试）**

```bash
git add tests/artboard_export_stability.test.mjs
git commit -m "test: document artboard stable export boundaries"
```

---

### Task 5: 用真实导出再次确认修复对了

**Files:**
- Read: 最新 `exports/job_*.json.log`
- Read: 最新 `exports/result_*.json`
- Optional: 导出 PSD 与 source PSD

**Step 1: 重新导出同一模板**

优先使用之前出过问题的模板和同类输入。

**Step 2: 检查日志是否还出现系统性 1024 偏移**

重点看：

```text
desiredRectRejected=update_distance_1024
stable_text_restored psId=... dy=-1024
artboardOffset=...,1024
```

**Step 3: 用结果文件确认导出文档诊断正常**

看 `result_*.json` 的：
- `ok`
- `warnings`
- `errors`
- `diagnostics.widthPx`
- `diagnostics.heightPx`
- `scriptBuild`

如果这是同一份 source PSD，而失败样本曾把高度从 `7859` 撑大到 `8689/8883`，那么健康样本应恢复到合理原值范围。

**Step 4: 人工打开导出 PSD/PSB spot check**

至少抽查：
- 一个原本出现 `desiredRectRejected=update_distance_1024` 的图片层
- 一个原本出现 `stable_text_restored dy=-1024` 的文本层
- 一个未更新但之前跟着整体下移的装饰层/LOGO/图片层

**Step 5: Commit（如需记录真实验证辅助脚本）**

```bash
git add <verification-helper-if-any>
git commit -m "test: verify artboard export offset fix with real job"
```

---

## 未来再回归时，最快排查顺序

1. 先跑：

```bash
node --test tests/artboard_export_stability.test.mjs
```

2. 如果顺序测试失败，先修 `render_export.jsx` 图片分支顺序，别先碰文本逻辑
3. 如果顺序测试通过，但真实导出仍偏：
   - 对比 `job_*.json.log` 的 `artboardOffset=` 与 `desiredRectRejected=`
   - 看失败样本是不是又回到了 `+1024` 模式
4. 如果图片正常但文本还偏，再检查：
   - `text_update[...] anchorPosDistance=`
   - `stable_text_restored psId=... dy=...`
   - `desiredRectSource=stableSnapshot`
5. 永远不要先删除 `stable_text_restore`，那通常只是在掩盖前面的几何污染

---

## 本次修复的最小真相（给未来维护者）

- **不是** 前端 `updates[]` 坐标错
- **不是** 先要改文本回放
- **不是** 画板 rename 导致
- **是** 图片替换分支里，`replacePlacedContents` 与 `restoreLayerPlacement/restoreLayerArtboardPosition` 的顺序错了
- 修复点只有一个：`server/photoshop/render_export.jsx` 的 `applyUpdatesToDoc()` 图片分支
- 保护网只有一个：`tests/artboard_export_stability.test.mjs` 的顺序回归测试

---

## 参考命令清单

```bash
node --test tests/artboard_export_stability.test.mjs
node --test tests/server-export-error.test.mjs
npm run test
```

如果要定位日志：

```bash
# 用 Claude Code 的 Grep/Read 直接查，不要手工盲翻整个大日志
# 关键字：
# desiredRectRejected=update_distance_1024
# stable_text_restored
# artboardOffset=
# stableRectAlignSource=
```

---

## 相关文件索引

- `server/photoshop/render_export.jsx`
- `server/services/photoshopIngest.js`
- `tests/artboard_export_stability.test.mjs`
- `docs/ARCHITECTURE.md`

---

Plan complete and saved to `docs/plans/2026-03-24-artboard-export-offset-repair-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
