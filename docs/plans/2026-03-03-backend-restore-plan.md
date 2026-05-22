# 后端回滚恢复与兼容合并 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从备份恢复后端认证与导出能力，并与现有功能兼容

**Architecture:** 以备份版 photoshopIngest.js 作为单一来源恢复核心导出链路；在 index.js 做精确合并以引入管理员认证与安全配置，同时保持关键导出/入库接口匿名可用；slotConfigService 增强 align 字段校验以保持数据一致性。

**Tech Stack:** Node.js, Express, Photoshop ExtendScript 调度, Sharp

---

### Task 1: 替换 photoshopIngest.js 为备份版本

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\photoshopIngest.js`

**Step 1: Write the failing test**

手工验证点（无现成测试框架）：调用 export 与 batch-export 时支持远程图片、对齐、bundlePsd、export-variable-images。

**Step 2: Run test to verify it fails**

基于现网功能缺失进行对照验证，记录当前无法完成的行为。

**Step 3: Write minimal implementation**

将备份版 `psd-to-ecommerce-new-backcup/server/services/photoshopIngest.js` 全量替换到当前文件。

**Step 4: Run test to verify it passes**

使用后端自测脚本或接口调用，验证上述能力恢复。

**Step 5: Commit**

不提交（除非用户明确要求）。

---

### Task 2: 合并 index.js 的认证与安全配置

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\index.js`

**Step 1: Write the failing test**

手工验证点：
1) 未登录访问管理接口返回 401  
2) 允许匿名访问的导出/入库接口保持可用  
3) CORS 不符合规则时返回 403  

**Step 2: Run test to verify it fails**

当前版本缺失管理员认证与动态 CORS，验证现状不满足要求。

**Step 3: Write minimal implementation**

从备份版合并以下内容：
- trust proxy 设置
- 动态 CORS 校验与安全头
- admin 认证函数、cookie 策略、登录限流
- 认证 API：`/api/admin/me`、`/api/admin/login`、`/api/admin/logout`、`/api/admin/change-password`
- 管理类接口加 `requireAdmin`
- 新增端点 `/api/template/export-variable-images`
- `batch-export` 增加 `bundlePsd` 支持

**Step 4: Run test to verify it passes**

用 curl 或前端调用验证接口权限与可用性。

**Step 5: Commit**

不提交（除非用户明确要求）。

---

### Task 3: 合并 slotConfigService align 校验

**Files:**
- Modify: `e:\ProjectX\Fdesign\psd-to-ecommerce-new\server\services\slotConfigService.js`

**Step 1: Write the failing test**

手工验证点：slot 变量的 align 字段只允许 left/center/right，其它值置空。

**Step 2: Run test to verify it fails**

当前版本无 align 归一化，验证写入异常值仍保留。

**Step 3: Write minimal implementation**

引入备份版 align 字段规范化逻辑。

**Step 4: Run test to verify it passes**

保存 slot-config 后读取检查 align 结果。

**Step 5: Commit**

不提交（除非用户明确要求）。

---

### Task 4: 运行校验命令

**Files:**
- Modify: 无

**Step 1: Run lint**

Run: `npm run lint`  
Expected: PASS

**Step 2: Run build**

Run: `npm run build`  
Expected: PASS
