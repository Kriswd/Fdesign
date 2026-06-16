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

test('开源分发包应包含渠道、链接、文案、30 天计划和指标脚本', () => {
  [
    'docs/launch/distribution_targets.md',
    'docs/launch/utm_links.md',
    'docs/launch/post_templates.md',
    'docs/launch/first_30_days_growth_plan.md',
    'scripts/capture_github_growth_metrics.ps1',
  ].forEach((relPath) => {
    assert.equal(fileExists(relPath), true, `${relPath} should exist`);
  });
});

test('渠道清单应锁定真实增长规则和优先级', () => {
  const targets = readText('docs/launch/distribution_targets.md');

  assert.ok(targets.includes('不买 Star、不拉票、不批量灌水'));
  assert.ok(targets.includes('Hacker News Show HN'));
  assert.ok(targets.includes('Product Hunt'));
  assert.ok(targets.includes('V2EX'));
  assert.ok(targets.includes('掘金'));
  assert.ok(targets.includes('Reddit'));
  assert.ok(targets.includes('GitHub traffic API'));
});

test('UTM 链接应提供可追踪项目页并保留 Product Hunt 例外', () => {
  const links = readText('docs/launch/utm_links.md');

  assert.ok(links.includes('https://kriswd.github.io/Fdesign/?utm_source=v2ex&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=share_creation'));
  assert.ok(links.includes('https://kriswd.github.io/Fdesign/?utm_source=hackernews&utm_medium=show_hn&utm_campaign=fdesign_v3_launch&utm_content=english_launch'));
  assert.ok(links.includes('Product Hunt 的提交 URL 使用 canonical 项目页'));
  assert.ok(links.includes('https://pay.ldxp.cn/shop/FTIWLFHQ'));
});

test('发布文案应覆盖中英文渠道且避免拉票语气', () => {
  const templates = readText('docs/launch/post_templates.md');

  assert.ok(templates.includes('开源了一个本地 Photoshop 工作台'));
  assert.ok(templates.includes('Show HN: Fdesign'));
  assert.ok(templates.includes('Batch ecommerce PSDs from Excel and Photoshop'));
  assert.ok(templates.includes('Disclosure: I am the maker of this project.'));
  assert.ok(templates.includes('不要请朋友 upvote/comment'));
});

test('30 天计划应明确 1000 stars 尚未完成且按真实反馈推进', () => {
  const plan = readText('docs/launch/first_30_days_growth_plan.md');

  assert.ok(plan.includes('当前目标没有完成'));
  assert.ok(plan.includes('GitHub 显示 1000+ stars'));
  assert.ok(plan.includes('Unique clones'));
  assert.ok(plan.includes('如果 Star 增长但 clones/issues 为 0'));
});

test('GitHub 增长指标脚本应采集 Star、流量、Release 和 Pages 状态', () => {
  const script = readText('scripts/capture_github_growth_metrics.ps1');

  assert.ok(script.includes("repos/$Repo/traffic/$Endpoint"));
  assert.ok(script.includes("popular/referrers"));
  assert.ok(script.includes("popular/paths"));
  assert.ok(script.includes("stargazerCount"));
  assert.ok(script.includes("repos/$Repo/pages"));
  assert.ok(script.includes("repos/$Repo/releases/latest"));
  assert.ok(script.includes("output/github-growth-metrics"));
  assert.ok(script.includes("ConvertTo-Json -Depth 30"));
});
