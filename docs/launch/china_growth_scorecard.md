# Fdesign 国内增长 Scorecard

更新日期：2026-06-22

每次国内发布后，用这张表判断渠道质量。目标不是“哪个平台数据最大”，而是哪个平台带来真实 Star、clone、issue、discussion 和可公开案例。

## 指标定义

| 指标 | 好信号 | 坏信号 |
| --- | --- | --- |
| Stars | 发布后 24-72 小时自然增长 | 只有熟人点赞，没有 clone/issue |
| Unique views | 渠道 referrer 明显增加 | 阅读高但 GitHub 无访问 |
| Unique clones | 有人开始试跑 | 只有浏览没有行动 |
| Issues / Discussions | 问题具体，能定位到模板/安装/导出 | 只有泛泛夸奖 |
| 评论质量 | 反馈包含真实场景和限制 | 只问“有没有成品/能不能代做” |
| 二次传播 | 有人主动转给设计/运营/开发同事 | 需要反复催互动 |

## 发布记录表

| 日期 | 渠道 | 内容 | 链接 | Stars + | Views + | Clones + | Issues/Discussions + | 质量评分 | 下一步 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-06-22 | 基线 | 未发布 | https://github.com/Kriswd/Fdesign | 0 | 待采集 | 待采集 | 0 | - | 补国内发布包 |

质量评分：

- 5：带来 Star、clone、issue，并出现真实模板场景。
- 4：带来 Star 和 clone，有具体问题。
- 3：带来访问和少量 Star，但反馈少。
- 2：只有平台内互动，GitHub 无明显变化。
- 1：平台反感、删帖、限流或无关流量。

## 每周复盘命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\capture_github_growth_metrics.ps1
```

复盘后要回答：

- 本周哪个国内渠道带来最多 clone？
- 哪个内容让用户真正理解“Excel -> PSD -> Photoshop 导出”？
- README/FAQ 哪个问题被反复问？
- 下周应该补示例包、视频、技术文章，还是兼容性？
