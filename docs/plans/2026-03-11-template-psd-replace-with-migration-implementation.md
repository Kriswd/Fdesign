# PSD Replace With Config Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理端支持“替换源 PSD 并继承配置”，尽可能保留商品位、字段映射与规则。

**Architecture:** 新增 server API `/api/template/:id/replace-psd`：读取旧 manifest+slot-config，运行变量映射迁移算法，覆盖模板目录下 source.psd/manifest.json 并写回迁移后的 slot-config.json；管理端 AdminSlotEditor 增加替换按钮并展示迁移报告。

**Tech Stack:** Node/Express, React, node:test

---

### Task 1: 实现变量映射迁移算法（纯函数）

**Files:**
- Create: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\utils\templateMigration.js`
- Test: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\utils\templateMigration.test.js`

**Step 1: 写 failing test（覆盖 psId 变化但 key 相同的迁移）**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSlotConfig } from './templateMigration.js';

test('migrateSlotConfig should migrate by key when psId changes', () => {
  const oldVars = [
    { id: '1', psId: 10, key: 'title', varType: 'text', path: 'A/B' },
    { id: '2', psId: 11, key: 'img1', varType: 'img', path: 'A/C' },
  ];
  const newVars = [
    { id: 'n1', psId: 110, key: 'title', varType: 'text', path: 'A/B' },
    { id: 'n2', psId: 111, key: 'img1', varType: 'img', path: 'A/C' },
  ];
  const oldConfig = {
    templateId: 't',
    version: 1,
    fieldDefinitions: [{ key: 'TITLE', label: '标题', type: 'text' }],
    ignoredVariableIds: ['2'],
    ignoredFieldKeys: [],
    slots: [
      {
        id: 's1',
        name: 'S1',
        variables: [
          { id: '1', psId: 10, type: 'text', excelFieldKey: 'TITLE', computedRule: 'x', computedRules: [] },
          { id: '2', psId: 11, type: 'img', excelFieldKey: 'PIC', computedRule: null, computedRules: [{ type: 'concatFields', fieldKeys: ['A'] }] },
        ],
      },
    ],
  };

  const out = migrateSlotConfig({ oldVars, newVars, oldConfig, templateId: 't' });
  assert.equal(out.config.slots[0].variables[0].psId, 110);
  assert.equal(out.config.slots[0].variables[0].excelFieldKey, 'TITLE');
  assert.equal(out.config.slots[0].variables[1].psId, 111);
  assert.deepEqual(out.config.ignoredVariableIds, ['n2']);
  assert.equal(out.report.matchedBy.key, 2);
});
```

**Step 2: 实现 migrateSlotConfig（最小可行）**

实现：
- 输入：`oldVars/newVars/oldConfig/templateId`
- 输出：`{ config, report, mapping }`
- 匹配优先级：psId -> key+varType -> path+varType -> bbox(中心点+面积) -> name（低置信度）
- 一对一占用：newVar 被匹配后从候选池移除

**Step 3: 跑 test 并确保 pass**

Run: `node --test server/utils/templateMigration.test.js`
Expected: PASS

---

### Task 2: 实现服务端 replace API（覆盖 PSD 并写回 slot-config）

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\index.js`
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\photoshopIngest.js`（如需要复用 ingest）
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\slotConfigService.js`（如需要 helper）
- Create/Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\utils\templateMigration.js`

**Step 1: 写 failing API test（可选，如果现有无测试框架则跳过）**

**Step 2: 新增路由**
- `POST /api/template/:id/replace-psd`（requireAdmin）
- 接受 formData `psd`
- 读取旧 manifest/slot-config（在覆盖前）
- 调用 ingest 流程把新 PSD 写入同一 templateDir（覆盖 source.psd/manifest.json/预览）
- 读取新 manifest.variables
- 执行迁移并写回 slot-config.json
- 返回 `{ success, templateId, migrationReport }`

**Step 3: 手工验证**
- 用已有模板替换 PSD
- 确认 config 仍然存在且 psId 更新

---

### Task 3: 管理端 AdminSlotEditor 增加替换入口与报告展示

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\src\pages\AdminSlotEditor.jsx`

**Step 1: 添加按钮与 file input**
- “替换源 PSD（继承配置）”
- 上传后调用 `POST /api/template/${templateId}/replace-psd`

**Step 2: 成功后刷新数据**
- 重新加载 template + config（复用现有 load 逻辑）

**Step 3: 展示 migrationReport**
- 以弹窗或面板显示 matchedBy/unmatched/conflicts/ambiguous 的数量与前几条

---

### Task 4: 全量验证

**Step 1: node tests**
- `node --test src/utils/exportZipLayout.test.mjs tests/exportZipLayout.test.mjs`
- `node --test server/utils/templateMigration.test.js`

**Step 2: lint/build**
- `npm run lint`
- `npm run build`

