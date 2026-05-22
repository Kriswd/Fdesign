# 京东/天猫 Zip 按“型号 + 色号”分层 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 京东/天猫导出的压缩包中，PNG 与 JPG 在最下级按“型号 + 色号”（如 `BL7213 A61`）建立子文件夹归类存放。

**Architecture:** 仅调整前端打包下载的 zip 路径生成规则（`buildZipEntry`），不改导出接口与后端产物；对京东/天猫的 PNG/JPG 在现有目录结构中插入 `型号 色号` 一层。`PSD/PSB` 继续放在 zip 根目录。

**Tech Stack:** React（Vite），JSZip，Node test runner（`node --test`）

---

### Task 1: 调整 zip 路径规则（京东/天猫插入“型号 色号”目录）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\utils\exportZipLayout.js`

**Step 1: 写 failing test（先约束期望行为）**

在 `src/utils/exportZipLayout.test.mjs` 追加用例：
- 京东 PNG：`京东/PNG产品图/BL7213 A61/x.png`
- 京东 JPG + App：`京东/App/BL7213 A61/x.jpg`
- 天猫 PNG：`天猫/PNG产品图/BL7213 A61/x.png`
- 天猫 JPG + PC：`天猫/PC/BL7213 A61/x.jpg`
- 京东/天猫 JPG 仍保持“无法判断 PC/App 就 skip”（避免“其他”目录出现）

示例：

```js
import { buildZipEntry } from './exportZipLayout.js';
import assert from 'node:assert/strict';

const entry = buildZipEntry({
  psdName: '京东APP主图规范(三视图).psd',
  imgName: 'BL7213_A61_45.jpg',
  resultFormat: 'jpeg',
  defaultFileName: 'x.jpg',
});
assert.equal(entry.skip, false);
assert.equal(entry.relativePath, '京东/App/BL7213 A61/x.jpg');
```

**Step 2: 运行测试，确认失败**

Run:
- `node --test src/utils/exportZipLayout.test.mjs`

Expected:
- FAIL，提示路径不包含 `BL7213 A61` 子目录

**Step 3: 最小实现**

在 `buildZipEntry` 的 `platformKey === 'jd' || platformKey === 'tmall'` 分支：
- 计算 `key = sanitizeZipPathSegment(parseModelColorKey(imgName))`
- `fmt === 'png'`：返回 `${safePlatform}/PNG产品图/${key}/${fileName}`
- `fmt === 'jpeg'`：保持 App/PC 判定逻辑，但在其后插入 `${key}`：`${safePlatform}/${sub}/${key}/${fileName}`
- 继续保留：`sub === '其他'` 时 `skip: true`

**Step 4: 运行测试，确认通过**

Run:
- `node --test src/utils/exportZipLayout.test.mjs`

Expected:
- PASS

---

### Task 2: 回归打包下载与工程校验

**Files:**
- (No code) 验证与构建

**Step 1: 运行 lint**

Run:
- `npm run lint`

Expected:
- Exit code 0

**Step 2: 运行 build**

Run:
- `npm run build`

Expected:
- Exit code 0

**Step 3: 手工验证**

在页面做一次批量导出后点击“打包下载”，检查 zip 内路径：
- `京东/PNG产品图/BL7213 A61/...png`
- `京东/App/BL7213 A61/...jpg` 或 `京东/PC/BL7213 A61/...jpg`
- `天猫/PNG产品图/BL7213 A61/...png`
- `天猫/App|PC/BL7213 A61/...jpg`
- `PSD/PSB` 位于 zip 根目录（不在平台文件夹内）

---

### Task 3: 防回归（确保未来改动不破坏目录结构）

**Files:**
- Modify: `E:\ProjectX\Fdesign\psd-to-ecommerce-new\src\utils\exportZipLayout.test.mjs`

**Step 1: 增加覆盖面**

补充至少 1 个用例覆盖：
- `imgName` 不含色号时（仅型号）目录名退化为 `BL7213`
- `imgName` 无法识别型号时目录名为 `未识别型号`

**Step 2: 运行测试**

Run:
- `node --test src/utils/exportZipLayout.test.mjs`

Expected:
- PASS

