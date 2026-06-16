# Fdesign 1000 Star Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved 1000-star growth design into public repository assets, GitHub community surfaces, and verifiable launch material.

**Architecture:** Keep product code unchanged and focus this iteration on public-facing conversion surfaces: README, docs, GitHub templates, repeatable GitHub setup script, labels/issues/release, and launch kit. Use tests to lock the README/asset contract before editing copy, then verify local build/test and remote GitHub state after pushing.

**Tech Stack:** Markdown, GitHub CLI (`gh`), PowerShell, Node `node:test`, existing React/Vite project scripts.

---

## Scope Check

The design covers one connected subsystem: public open-source growth infrastructure for the existing repository. It does not change Photoshop export behavior, frontend runtime behavior, billing, authentication, or packaging logic. Remote GitHub setup is included because README, release, labels, issues, and Discussions are part of one launch funnel.

## File Structure

- Modify: `README.md`  
  Responsible for the repository first screen, quick start, contribution path, shop link as secondary service entry, and bilingual discoverability.
- Create: `docs/DEMO.md`  
  Responsible for a short walkthrough of the real workbench screenshot and the three-step workflow.
- Create: `docs/ROADMAP.md`  
  Responsible for public roadmap phases and contribution-friendly areas.
- Create: `docs/launch/copy-benchmark.md`  
  Responsible for the benchmark notes behind launch copy; use the already inspected GitHub peers and avoid long quotes.
- Create: `docs/launch/Fdesign_V3_launch_kit.md`  
  Responsible for publishable Chinese and English launch copy, staged launch checklist, and measurement cadence.
- Create: `docs/github/release-v3.0.0.md`  
  Responsible for release notes used by `gh release create`.
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`  
  Responsible for bug reports with environment, PSD/export context, and reproduction steps.
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`  
  Responsible for workflow and automation feature requests.
- Create: `.github/ISSUE_TEMPLATE/template_showcase.yml`  
  Responsible for users sharing template/workflow cases.
- Create: `.github/ISSUE_TEMPLATE/config.yml`  
  Responsible for directing questions and custom service requests.
- Create: `.github/DISCUSSION_TEMPLATE/show-and-tell.md`  
  Responsible for a lightweight discussion starter for public examples.
- Create: `scripts/setup_github_growth.ps1`  
  Responsible for idempotent GitHub metadata, label, issue, and Discussions setup through `gh`.
- Create: `tests/open_source_growth_readme.test.mjs`  
  Responsible for locking README, launch docs, GitHub templates, and setup script expectations.
- Modify: `docs/OPEN_SOURCE_CHECKLIST.md`  
  Responsible for marking the new public launch requirements and verification checklist.
- Modify: `CHANGELOG_V3.0.md`  
  Responsible for documenting growth infrastructure in the V3.0 public release notes.
- Modify: `docs/DEV_LOG.md`  
  Responsible for appending the implementation entry and verification commands.
- Create: `openspec/changes/2026-06-16-open-source-growth-implementation.md`  
  Responsible for implementation-level change summary.

## Task 1: Add Growth Contract Tests

**Files:**
- Create: `tests/open_source_growth_readme.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/open_source_growth_readme.test.mjs` with this exact test content:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(relPath) {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.resolve(process.cwd(), relPath));
}

test('README 首屏应采用电商生产结果导向定位', () => {
  const readme = readText('README.md');
  const headline = '把 Excel 商品数据，一键变成批量 PSD 成品';

  assert.ok(readme.includes('# 闪图 Fdesign V3.0'));
  assert.ok(readme.includes(headline));
  assert.ok(readme.includes('Turns Excel product data into batch PSD deliverables'));
  assert.ok(readme.includes('![闪图 Fdesign 工作台](./public/screenshots/fdesign-workbench-showcase.png)'));
  assert.ok(readme.includes('1. 导入 PSD 模板'));
  assert.ok(readme.includes('2. 绑定 Excel 字段与商品图'));
  assert.ok(readme.includes('3. 批量导出 PSD / PSB / PNG / JPEG'));
  assert.ok(readme.includes('如果 Fdesign 帮你少做重复图，欢迎给仓库点一个 Star'));
});

test('README 应把店铺入口保持为次级服务入口', () => {
  const readme = readText('README.md');
  const quickStartIndex = readme.indexOf('## 快速开始');
  const shopIndex = readme.indexOf('## 服务入口');

  assert.ok(quickStartIndex > -1);
  assert.ok(shopIndex > quickStartIndex);
  assert.ok(readme.includes('VITE_SHOP_URL=https://pay.ldxp.cn/shop/FTIWLFHQ'));
  assert.ok(readme.includes('开源功能可直接本地运行；需要模板定制、部署协助或成品服务时，再使用店铺入口。'));
});

test('公开增长文档与发布素材应齐备', () => {
  [
    'docs/DEMO.md',
    'docs/ROADMAP.md',
    'docs/launch/copy-benchmark.md',
    'docs/launch/Fdesign_V3_launch_kit.md',
    'docs/github/release-v3.0.0.md',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  });

  const launchKit = readText('docs/launch/Fdesign_V3_launch_kit.md');
  assert.ok(launchKit.includes('国内电商设计师/运营首发'));
  assert.ok(launchKit.includes('Star 转化复盘'));
  assert.ok(launchKit.includes('English short summary'));

  const benchmark = readText('docs/launch/copy-benchmark.md');
  assert.ok(benchmark.includes('Bjango-Actions'));
  assert.ok(benchmark.includes('Proxyshop'));
  assert.ok(benchmark.includes('Batch Mockup Smart Object Replacement'));
});

test('GitHub 社区入口与设置脚本应可重复执行', () => {
  [
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml',
    '.github/ISSUE_TEMPLATE/template_showcase.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.github/DISCUSSION_TEMPLATE/show-and-tell.md',
    'scripts/setup_github_growth.ps1',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  });

  const setupScript = readText('scripts/setup_github_growth.ps1');
  assert.ok(setupScript.includes('gh repo edit Kriswd/Fdesign'));
  assert.ok(setupScript.includes('--enable-discussions'));
  assert.ok(setupScript.includes('photoshop-automation'));
  assert.ok(setupScript.includes('good first issue'));
  assert.ok(setupScript.includes('gh issue create'));
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm test -- --test-name-pattern "README 首屏|公开增长|GitHub 社区"
```

Expected: FAIL because the new files and README strings do not exist yet.

- [ ] **Step 3: Commit is not allowed in this task**

Do not commit the failing test alone. Keep it staged only after Task 2 passes.

## Task 2: Rewrite README and Add Launch Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/DEMO.md`
- Create: `docs/ROADMAP.md`
- Create: `docs/launch/copy-benchmark.md`
- Create: `docs/launch/Fdesign_V3_launch_kit.md`
- Create: `docs/github/release-v3.0.0.md`
- Modify: `docs/OPEN_SOURCE_CHECKLIST.md`
- Modify: `CHANGELOG_V3.0.md`
- Modify: `docs/DEV_LOG.md`
- Create: `openspec/changes/2026-06-16-open-source-growth-implementation.md`

- [ ] **Step 1: Replace the README top-to-bottom**

Replace `README.md` with a value-led structure using these exact headings in order:

```markdown
# 闪图 Fdesign V3.0

把 Excel 商品数据，一键变成批量 PSD 成品。

Turns Excel product data into batch PSD deliverables through a local Photoshop automation workbench.

[badges]

闪图 Fdesign 是面向电商设计师、运营和自动化开发者的开源 PSD 图像生产工作台。你可以导入 PSD 模板，绑定 Excel 字段、商品图和规则链，再通过本机 Photoshop 批量导出 PSD、PSB、PNG 与 JPEG 成品。

![闪图 Fdesign 工作台](./public/screenshots/fdesign-workbench-showcase.png)

上图展示 PSD 画布预览、商品位绑定、Excel 数据控制台与导出入口的主工作流。

## 三步工作流

1. 导入 PSD 模板
2. 绑定 Excel 字段与商品图
3. 批量导出 PSD / PSB / PNG / JPEG

## 适合谁

## 能力概览

## 运行要求

## 快速开始

## 完整演示

## 贡献方式

## 服务入口

## 目录

## 开发文档

## 验证

## License
```

The `[badges]` block must use Markdown image badges for MIT, V3.0, Photoshop Automation, Windows, React + Node.js. Keep badge URLs from `img.shields.io` only.

- [ ] **Step 2: Add demo walkthrough**

Create `docs/DEMO.md` with sections:

```markdown
# Fdesign Demo

## 主工作流截图
## 1. 导入 PSD 模板
## 2. 绑定数据
## 3. 批量导出
## 常见限制
## 下一步
```

Use the existing screenshot path `../public/screenshots/fdesign-workbench-showcase.png` and explicitly mention Windows + Photoshop.

- [ ] **Step 3: Add public roadmap**

Create `docs/ROADMAP.md` with sections:

```markdown
# Fdesign Roadmap

## Now
## Next
## Later
## Good First Contributions
## How We Decide Priority
```

Include contribution opportunities for README/examples, template-case documentation, quick-start troubleshooting, and launch feedback.

- [ ] **Step 4: Add benchmark notes**

Create `docs/launch/copy-benchmark.md` summarizing patterns from:

- `bjango/Bjango-Actions`
- `lohriialo/photoshop-scripting-python`
- `Investigamer/Proxyshop`
- `joonaspaakko/Batch-Mockup-Smart-Object-Replacement-photoshop-script`
- `alisaitteke/photoshop-mcp`

For each project, record: first-screen proof asset, value proposition style, quick-start clarity, community/support path, and what Fdesign should copy or avoid. Use paraphrase only.

- [ ] **Step 5: Add launch kit**

Create `docs/launch/Fdesign_V3_launch_kit.md` with:

- Chinese long-form post titled `我把电商 PSD 批量作图工作台开源了：Excel 数据一键生成批量 PSD 成品`
- Chinese short community post titled `国内电商设计师/运营首发`
- English short summary titled `English short summary`
- Tracking table titled `Star 转化复盘`
- Publishing cadence for Day 0, Day 1-3, Day 7, Day 14, Day 30

- [ ] **Step 6: Add release notes source**

Create `docs/github/release-v3.0.0.md` with:

- `## 闪图 Fdesign V3.0`
- `## Who should try this`
- `## Highlights`
- `## Requirements`
- `## Quick start`
- `## Known limitations`
- `## Verification`

- [ ] **Step 7: Update existing public docs**

Update `docs/OPEN_SOURCE_CHECKLIST.md`, `CHANGELOG_V3.0.md`, `docs/DEV_LOG.md`, and `openspec/changes/2026-06-16-open-source-growth-implementation.md` to mention README growth positioning, launch kit, GitHub templates, release notes, and GitHub setup script.

- [ ] **Step 8: Run the focused test and confirm it passes**

Run:

```powershell
npm test -- --test-name-pattern "README 首屏|公开增长|GitHub 社区"
```

Expected: PASS for all tests in `tests/open_source_growth_readme.test.mjs`.

## Task 3: Add GitHub Community Templates and Setup Script

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/template_showcase.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/DISCUSSION_TEMPLATE/show-and-tell.md`
- Create: `scripts/setup_github_growth.ps1`

- [ ] **Step 1: Add issue templates**

Create the three issue templates with GitHub Issue Forms YAML. Required fields:

- Bug report: environment, Photoshop version, Node version, reproduction steps, expected result, actual result, logs/screenshots.
- Feature request: workflow pain, current workaround, proposed behavior, target audience, contribution interest.
- Template showcase: template type, input data shape, output formats, screenshot/demo link, reusable lessons.

- [ ] **Step 2: Add issue config**

Create `.github/ISSUE_TEMPLATE/config.yml` with blank issues enabled and contact links:

```yaml
blank_issues_enabled: true
contact_links:
  - name: Discussions
    url: https://github.com/Kriswd/Fdesign/discussions
    about: Ask usage questions, share workflows, and discuss template ideas.
  - name: Optional service shop
    url: https://pay.ldxp.cn/shop/FTIWLFHQ
    about: Use this only for template customization, deployment help, or paid production services.
```

- [ ] **Step 3: Add discussion template**

Create `.github/DISCUSSION_TEMPLATE/show-and-tell.md` with prompts for workflow background, PSD template type, Excel fields, output result, and reusable lessons.

- [ ] **Step 4: Add idempotent GitHub setup script**

Create `scripts/setup_github_growth.ps1` with:

- `Set-StrictMode -Version Latest`
- `$Repo = 'Kriswd/Fdesign'`
- `gh repo edit` with updated description, homepage, `--enable-issues`, `--enable-discussions`, and topics.
- Label creation/upsert for `good first issue`, `help wanted`, `documentation`, `showcase`, `roadmap`, `launch-feedback`.
- Issue creation guarded by title search using `gh issue list --search`.
- Seed issues for roadmap, template showcase request, good first docs task, and launch feedback.

- [ ] **Step 5: Re-run the focused test**

Run:

```powershell
npm test -- --test-name-pattern "GitHub 社区"
```

Expected: PASS.

## Task 4: Run Full Local Verification and Commit

**Files:**
- All files from Tasks 1-3

- [ ] **Step 1: Run lint**

Run:

```powershell
npm run lint
```

Expected: exit code 0.

- [ ] **Step 2: Run build**

Run:

```powershell
npm run build
```

Expected: exit code 0. If Vite still warns about a large chunk, record the warning in `docs/DEV_LOG.md`; it is not a blocker for this docs/GitHub growth release.

- [ ] **Step 3: Run tests**

Run:

```powershell
npm test
```

Expected: exit code 0.

- [ ] **Step 4: Check git diff**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors. Only the intended files should be modified/untracked; local `.superpowers/` visual companion files and unrelated untracked directories must remain unstaged.

- [ ] **Step 5: Commit the implementation**

Run:

```powershell
git add -- README.md docs/DEMO.md docs/ROADMAP.md docs/launch/copy-benchmark.md docs/launch/Fdesign_V3_launch_kit.md docs/github/release-v3.0.0.md .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml .github/ISSUE_TEMPLATE/template_showcase.yml .github/ISSUE_TEMPLATE/config.yml .github/DISCUSSION_TEMPLATE/show-and-tell.md scripts/setup_github_growth.ps1 tests/open_source_growth_readme.test.mjs docs/OPEN_SOURCE_CHECKLIST.md CHANGELOG_V3.0.md docs/DEV_LOG.md openspec/changes/2026-06-16-open-source-growth-implementation.md docs/superpowers/plans/2026-06-16-fdesign-1000-star-growth.md
git commit -m "docs: add open source launch growth assets"
```

Expected: one commit on `main` after the previous design commit.

## Task 5: Push, Apply GitHub Setup, Create Release, and Verify

**Files / Remote State:**
- Local branch: `main`
- Remote repository: `Kriswd/Fdesign`
- GitHub settings: description, homepage, topics, issues, Discussions
- GitHub labels and seed issues
- GitHub release: `v3.0.0`

- [ ] **Step 1: Push local commits**

Run:

```powershell
git push origin main
```

Expected: push succeeds. If GitHub push fails with port 443 timeout/reset, retry the same command once with:

```powershell
$env:HTTP_PROXY='http://127.0.0.1:10808'; $env:HTTPS_PROXY='http://127.0.0.1:10808'; git push origin main
```

- [ ] **Step 2: Apply GitHub growth setup**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_github_growth.ps1
```

Expected: repository description/topics/discussions are updated, labels exist, and seed issues exist exactly once.

- [ ] **Step 3: Create or update the V3.0.0 release**

Run:

```powershell
if (gh release view v3.0.0 -R Kriswd/Fdesign *> $null) {
  gh release edit v3.0.0 -R Kriswd/Fdesign --title 'Fdesign V3.0' --notes-file docs/github/release-v3.0.0.md --latest
} else {
  gh release create v3.0.0 -R Kriswd/Fdesign --target main --title 'Fdesign V3.0' --notes-file docs/github/release-v3.0.0.md --latest
}
```

Expected: release `v3.0.0` exists and points to the latest pushed `main`.

- [ ] **Step 4: Verify remote GitHub state**

Run:

```powershell
gh api repos/Kriswd/Fdesign --jq '{stars:.stargazers_count, forks:.forks_count, description:.description, homepage:.homepage, topics:.topics, discussions:.has_discussions, pushed_at:.pushed_at}'
gh release view v3.0.0 -R Kriswd/Fdesign --json tagName,name,isLatest,url
gh issue list -R Kriswd/Fdesign --limit 20 --json number,title,labels,state
git status --short --branch
git log -1 --oneline --decorate
```

Expected:

- Description mentions Photoshop, Excel/PSD, and ecommerce automation.
- Topics include `photoshop-automation`, `psd-automation`, and `ecommerce-tools`.
- Discussions is true.
- Release `v3.0.0` exists and is latest.
- Seed issues exist with labels.
- Local branch is aligned or ahead only if release/tag fetch changes are pending.

- [ ] **Step 5: Record verification**

Append a final line to `docs/DEV_LOG.md` with the push commit, GitHub setup result, release URL, current star baseline, and test commands. If this creates a post-release docs edit, commit and push it with:

```powershell
git add -- docs/DEV_LOG.md
git commit -m "docs: record open source launch verification"
git push origin main
```

Expected: remote repository contains both implementation and verification records.

## Self-Review Checklist

- Spec coverage: README, GitHub metadata, release, issues/discussions, launch kit, verification, and star baseline are covered.
- Red-flag scan: every task names concrete files, commands, expected results, and exact content where needed.
- Type and file consistency: all paths are repository-relative and all PowerShell/GitHub CLI commands match the inspected `gh` help output.
- Safety: no fake stars, spam, private content, or hidden service-first CTA is introduced.
- Git hygiene: `.superpowers/` and unrelated untracked directories stay unstaged.
