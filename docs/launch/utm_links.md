# Fdesign V3.0 UTM Links

更新日期：2026-06-16

统一使用 GitHub Pages 项目页承接外部分发，再由项目页引导到 GitHub Star。Product Hunt 等不接受 UTM 的场景使用 canonical URL。

## Canonical Links

| 用途 | 链接 |
| --- | --- |
| 项目页 | https://kriswd.github.io/Fdesign/ |
| GitHub 仓库 | https://github.com/Kriswd/Fdesign |
| V3.0 Release | https://github.com/Kriswd/Fdesign/releases/tag/v3.0.0 |
| Issues | https://github.com/Kriswd/Fdesign/issues |
| Discussions | https://github.com/Kriswd/Fdesign/discussions |
| 店铺服务入口 | https://pay.ldxp.cn/shop/FTIWLFHQ |

## Campaign Links

| 渠道 | 推荐链接 |
| --- | --- |
| README / GitHub | https://kriswd.github.io/Fdesign/?utm_source=github&utm_medium=readme&utm_campaign=fdesign_v3_launch&utm_content=repo_top |
| 国内社群 | https://kriswd.github.io/Fdesign/?utm_source=private_community&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=ecommerce_designers |
| 朋友圈 / 微信短帖 | https://kriswd.github.io/Fdesign/?utm_source=wechat&utm_medium=social&utm_campaign=fdesign_v3_launch&utm_content=short_post |
| V2EX | https://kriswd.github.io/Fdesign/?utm_source=v2ex&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=share_creation |
| 掘金 | https://kriswd.github.io/Fdesign/?utm_source=juejin&utm_medium=article&utm_campaign=fdesign_v3_launch&utm_content=technical_breakdown |
| B 站 | https://kriswd.github.io/Fdesign/?utm_source=bilibili&utm_medium=video&utm_campaign=fdesign_v3_launch&utm_content=workflow_demo |
| 视频号 | https://kriswd.github.io/Fdesign/?utm_source=wechat_channels&utm_medium=video&utm_campaign=fdesign_v3_launch&utm_content=workflow_demo |
| 小红书 | https://kriswd.github.io/Fdesign/?utm_source=xiaohongshu&utm_medium=social&utm_campaign=fdesign_v3_launch&utm_content=designer_workflow |
| 知乎 | https://kriswd.github.io/Fdesign/?utm_source=zhihu&utm_medium=answer&utm_campaign=fdesign_v3_launch&utm_content=psd_batch_answer |
| 开源中国 | https://kriswd.github.io/Fdesign/?utm_source=oschina&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=china_open_source_intro |
| Hacker News | https://kriswd.github.io/Fdesign/?utm_source=hackernews&utm_medium=show_hn&utm_campaign=fdesign_v3_launch&utm_content=english_launch |
| Reddit | https://kriswd.github.io/Fdesign/?utm_source=reddit&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=transparent_maker_post |
| Awesome list PR | https://kriswd.github.io/Fdesign/?utm_source=awesome_list&utm_medium=referral&utm_campaign=fdesign_v3_launch&utm_content=resource_pr |

## Product Hunt Exception

Product Hunt 的提交 URL 使用 canonical 项目页：

https://kriswd.github.io/Fdesign/

原因：Product Hunt 官方准备清单说明主 URL 不接受 shortened links 或 track links。需要区分 Product Hunt 流量时，使用 GitHub traffic referrers、Product Hunt 后台和发布日时间窗口交叉判断。

## Tracking Notes

- `utm_campaign` 固定为 `fdesign_v3_launch`，便于按首轮开源发布聚合。
- `utm_source` 使用平台或社区名，不写个人账号名。
- `utm_medium` 控制在 `readme`、`community`、`article`、`video`、`social`、`show_hn`、`referral`。
- 每次发布后运行 `scripts/capture_github_growth_metrics.ps1` 记录 GitHub 侧 Star、fork、views、clones 和 referrer 数据。
