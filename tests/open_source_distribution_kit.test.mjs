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
    'docs/launch/china_growth_playbook.md',
    'docs/launch/china_content_calendar.md',
    'docs/launch/china_post_templates.md',
    'docs/launch/china_growth_scorecard.md',
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
  assert.ok(targets.includes('Fdesign 国内增长作战手册'));
});

test('UTM 链接应提供可追踪项目页并保留 Product Hunt 例外', () => {
  const links = readText('docs/launch/utm_links.md');

  assert.ok(links.includes('https://kriswd.github.io/Fdesign/?utm_source=v2ex&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=share_creation'));
  assert.ok(links.includes('https://kriswd.github.io/Fdesign/?utm_source=hackernews&utm_medium=show_hn&utm_campaign=fdesign_v3_launch&utm_content=english_launch'));
  assert.ok(links.includes('https://kriswd.github.io/Fdesign/?utm_source=zhihu&utm_medium=answer&utm_campaign=fdesign_v3_launch&utm_content=psd_batch_answer'));
  assert.ok(links.includes('https://kriswd.github.io/Fdesign/?utm_source=oschina&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=china_open_source_intro'));
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

test('30 天计划应明确 10,000 stars 长期目标且按真实反馈推进', () => {
  const plan = readText('docs/launch/first_30_days_growth_plan.md');

  assert.ok(plan.includes('当前长期目标没有完成'));
  assert.ok(plan.includes('10,000+ stars'));
  assert.ok(plan.includes('第一阶段里程碑是 1,000 stars'));
  assert.ok(plan.includes('Unique clones'));
  assert.ok(plan.includes('如果 Star 增长但 clones/issues 为 0'));
});

test('国内增长资产应把 10,000 Star 目标拆成可执行渠道动作', () => {
  const playbook = readText('docs/launch/china_growth_playbook.md');
  const calendar = readText('docs/launch/china_content_calendar.md');
  const templates = readText('docs/launch/china_post_templates.md');
  const scorecard = readText('docs/launch/china_growth_scorecard.md');

  assert.ok(playbook.includes('10,000 Star'));
  assert.ok(playbook.includes('0 stars / 2 forks'));
  assert.ok(playbook.includes('V2EX'));
  assert.ok(playbook.includes('掘金'));
  assert.ok(playbook.includes('知乎'));
  assert.ok(playbook.includes('B 站'));
  assert.ok(playbook.includes('小红书'));
  assert.ok(playbook.includes('开源中国 / Gitee / GitCode'));
  assert.ok(playbook.includes('https://www.v2ex.com/go/guide'));
  assert.ok(playbook.includes('https://juejin.cn/post/7602651160465817650'));
  assert.ok(playbook.includes('https://top.xiaohongshu.com/fe/toph5/rules/subject'));
  assert.ok(playbook.includes('https://member.bilibili.com/studio/creative-treaty/q0'));
  assert.ok(calendar.includes('Week 1：冷启动和问题收集'));
  assert.ok(calendar.includes('Week 4：扩大圈层'));
  assert.ok(templates.includes('V2EX 首帖'));
  assert.ok(templates.includes('掘金首文开头'));
  assert.ok(templates.includes('小红书图文'));
  assert.ok(scorecard.includes('质量评分'));
  assert.ok(scorecard.includes('scripts\\capture_github_growth_metrics.ps1'));
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
