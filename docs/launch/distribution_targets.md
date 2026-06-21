# Fdesign V3.0 Distribution Targets

更新日期：2026-06-16

目标不是刷 Star，而是把 Fdesign 放到真正会遇到“Excel 商品数据 -> 批量 PSD 成品”问题的人面前。所有渠道都按真实价值分发，不买 Star、不拉票、不批量灌水。

## 渠道优先级

| 优先级 | 渠道 | 适合原因 | 发布动作 | 准备材料 | 风险控制 |
| --- | --- | --- | --- | --- | --- |
| P0 | GitHub README / Release / Issues / Discussions | Star 转化发生在 GitHub，入口最短 | 保持 README、Release、种子议题和 Pages 项目页同步 | 截图、Quick start、Roadmap、Release notes | 不把店铺入口放在主 CTA 之前 |
| P0 | 国内电商设计师/运营社群 | 用户痛点最贴近：批量改图、套 PSD、保留源文件 | 先发短帖，收集真实阻塞，再补 README FAQ | `post_templates.md` 的社群短帖，项目页链接 | 不发私有模板，不承诺未验证提效数字 |
| P1 | V2EX 分享创造 / 设计相关节点 | 适合独立开发者展示可运行项目 | 手动发帖，标题说明“开源”和具体工作流 | V2EX 模板、项目页、GitHub 仓库 | 发帖前阅读节点规则；避免诱导分享或刷回复 |
| P1 | 掘金 | 适合技术拆解：React + Node.js + Photoshop 自动化 | 写技术文章，不做硬广 | 掘金文章大纲、架构图、关键代码片段 | 文章主题聚焦实现和开源经验 |
| P1 | B 站 / 视频号 / 小红书 | 产品截图能直观看出工作台价值 | 录 45-90 秒真实工作流演示 | Pages 首屏截图、导入模板到导出的录屏 | 发布结果必须平台侧可验证，不能只看上传成功 |
| P2 | Hacker News Show HN | 适合英文开发者看本地工具和 Photoshop automation | 用 `Show HN:` 标题提交可运行项目 | English summary、GitHub repo、no-signup quick start | 不请朋友 upvote/comment；在线回复技术问题 |
| P2 | Product Hunt | 适合全球产品发现，但需要更完整素材 | 排期 launch，准备 gallery、maker comment | 240x240 图标、2+ gallery、短视频/GIF、first comment | Product Hunt 主 URL 不用 UTM 或短链 |
| P2 | Reddit 相关社区 | 适合具体问题讨论，不适合直接广告 | 只在允许 self-promotion 的社区发，先参与讨论 | 透明 maker 说明、具体技术细节、GitHub 链接 | 遵守 subreddit 规则，避免内容操纵 |
| P3 | Awesome lists / Photoshop scripting 资源汇总 | 长尾搜索和开发者可信度 | 找维护活跃的列表，提交 PR | 一句话定位、repo 链接、截图 | 只投相关列表，不群发 PR |

## 渠道规则摘记

- Hacker News Show HN 要求是“别人能试用的你做的东西”，标题以 `Show HN` 开头，并明确不要请求朋友投票或评论。
- Product Hunt 准备页说明可提前排期，提交需要产品 URL、名称、tagline、描述、图片、gallery、first comment 等；主 URL 不接受短链或 UTM 跟踪链接。
- GitHub traffic API 的 views、clones、referrers、popular paths 都是近 14 天窗口，因此增长数据要至少每周采集一次。
- V2EX 使用指南节点包含平台使用规则和反 spam 主题，发布前先确认目标节点能接受项目展示。
- Reddit 官方规则强调遵守社区规则、真实参与、不要 spam 或内容操纵；每个 subreddit 还会有自己的更细规则。

## 第一轮发布顺序

1. Day 0：GitHub / Pages / Release 已完成后，先发国内电商设计师和运营社群，目标是收集 5 条真实安装或模板问题。
2. Day 1：发 V2EX，标题聚焦“开源 + 本地 Photoshop + Excel 批量 PSD”，正文说明限制条件。
3. Day 2-3：发掘金技术拆解，沉淀“为什么要本地跑 Photoshop 自动化”的搜索内容。
4. Day 4-7：根据反馈补 README FAQ，再考虑 B 站/视频号短演示。
5. Week 2：如果英文 quick start 足够顺，提交 Show HN。
6. Week 3-4：补齐 GIF/视频和 gallery 后再排 Product Hunt。

国内渠道的细化打法见：

- [Fdesign 国内增长作战手册](./china_growth_playbook.md)
- [Fdesign 国内 30 天内容排期](./china_content_calendar.md)
- [Fdesign 国内平台发布模板](./china_post_templates.md)
- [Fdesign 国内增长 Scorecard](./china_growth_scorecard.md)

## 不做的事

- 不购买、交换、诱导或伪造 Star。
- 不用“限时福利”“加群领取模板”等话术把开源项目包装成销售页。
- 不把私有 PSD、付费字体、内部业务资料或真实数据放进截图或案例。
- 不在同一平台重复刷帖；每次发布都要有新内容、新案例或新问题复盘。
