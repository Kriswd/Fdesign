# Fdesign 国内平台发布模板

更新日期：2026-06-22

使用前检查：截图不含私有信息；不承诺未验证效率数字；不写“评论领取”“加群领取”“限时福利”；项目页和 GitHub 链接只放在平台允许的位置。

## V2EX 首帖

标题：

```text
开源了一个本地 Photoshop 自动化工作台：Excel 商品数据批量生成 PSD/PNG/JPEG
```

正文：

```markdown
最近把 Fdesign V3.0 开源了，想找一些真实的设计/运营/开发场景反馈。

它解决的是一个很具体的问题：同一套电商 PSD 模板，要反复替换款号、色号、商品图和规格字段，再导出 PSD、PSB、PNG 或 JPEG。

工作流：

1. 导入 PSD 模板
2. 绑定 Excel 字段和商品图
3. 调用本机 Photoshop 批量导出

限制也写在前面：

- 只适合 Windows + 本机 Photoshop 的本地流程
- 仓库不包含 Photoshop、模板素材、字体或真实业务数据
- 现在最需要的是首次运行、PSD 模板兼容和导出错误反馈

项目页：https://kriswd.github.io/Fdesign/?utm_source=v2ex&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=china_first_post
GitHub：https://github.com/Kriswd/Fdesign

如果你做过 Photoshop 脚本、电商套图或批量图片生产，欢迎帮忙挑 README、安装步骤或模板兼容问题。
```

## 掘金首文开头

```markdown
电商图片生产里有一类重复劳动很难靠通用 SaaS 解决：团队已经有一套 PSD 模板，素材和字段都在本地，最终还要保留 PSD 源文件。

Fdesign V3.0 是我开源的一个本地 Photoshop 自动化工作台。它把 Excel 商品数据、商品图和 PSD 模板绑定起来，再通过 Node.js 调用本机 Photoshop 批量导出 PSD、PSB、PNG 和 JPEG。

这篇文章不讲“提效多少倍”，只拆解它为什么要本地跑、技术链路怎么组织，以及开源前如何处理私有素材边界。
```

结尾：

```markdown
项目页：https://kriswd.github.io/Fdesign/?utm_source=juejin&utm_medium=article&utm_campaign=fdesign_v3_launch&utm_content=china_technical_intro
GitHub：https://github.com/Kriswd/Fdesign

如果你也在做 Photoshop 自动化、PSD 模板生产或电商批量图，欢迎提 issue。最有价值的反馈不是泛泛建议，而是“哪个 PSD 模板结构跑不通、哪个导出步骤不清楚”。
```

## 知乎回答结构

适合问题：`Photoshop 如何批量替换 PSD 里的商品图和文字？`

```markdown
可以，但要先区分两种情况：

1. 只是批量导出扁平图：动作、脚本或现成批处理工具可能够用。
2. 要把 Excel 字段、商品图和 PSD 模板长期绑定起来，并保留 PSD 源文件：更适合做一个本地自动化工作台。

我开源的 Fdesign V3.0 就是第二种思路。它不上传素材到云端，而是在本机浏览器里预览 PSD、绑定 Excel 字段和商品图，再调用 Photoshop 批量导出 PSD/PSB/PNG/JPEG。

限制：

- 需要 Windows + 本机 Photoshop + Node.js
- 不包含 Photoshop、模板素材或字体
- 模板越复杂，越需要真实案例来补兼容性

项目页：https://kriswd.github.io/Fdesign/?utm_source=zhihu&utm_medium=answer&utm_campaign=fdesign_v3_launch&utm_content=psd_batch_answer
GitHub：https://github.com/Kriswd/Fdesign
```

## B 站视频简介

```text
Fdesign V3.0 已开源：一个本地 Photoshop 自动化工作台。

适合流程：Excel 商品数据 + 商品图 + PSD 模板 -> 批量导出 PSD/PSB/PNG/JPEG。

运行条件：Windows 10/11 + Node.js 18+ + 本机 Photoshop。
项目不包含 Photoshop、模板素材、字体或真实业务数据。

项目页：https://kriswd.github.io/Fdesign/?utm_source=bilibili&utm_medium=video&utm_campaign=fdesign_v3_launch&utm_content=china_workflow_demo
GitHub：https://github.com/Kriswd/Fdesign
```

置顶评论：

```text
如果你要试跑，先看 README 的运行要求。最欢迎反馈的是：首次安装卡在哪一步、PSD 模板哪里不兼容、导出失败有没有清楚报错。
```

## 小红书图文

标题：

```text
电商设计重复套 PSD？我把本地工作台开源了
```

正文：

```text
做电商图最累的不是设计本身，而是同一套 PSD 模板反复替换款号、色号、商品图和规格字段。

Fdesign V3.0 是一个本地 Photoshop 自动化工作台：

1. 导入 PSD 模板
2. 绑定 Excel 字段和商品图
3. 调用本机 Photoshop 批量导出 PSD/PNG/JPEG

它不是云端作图工具，不上传素材；需要 Windows + Photoshop + Node.js。

项目名：Fdesign
关键词：开源、Photoshop 自动化、Excel 批量 PSD

我现在最想收集真实模板场景和首次运行问题。
```

配图建议：

- 第 1 张：工作台全景截图
- 第 2 张：Excel 商品数据
- 第 3 张：PSD 预览和变量绑定
- 第 4 张：导出结果
- 第 5 张：运行条件和开源边界

## 微信社群短帖

```text
我把 Fdesign V3.0 开源了，是一个本地 Photoshop 自动化工作台。

适合这种重复流程：
Excel 商品数据 + 商品图 + PSD 模板 -> 批量导出 PSD/PSB/PNG/JPEG。

它不是云端作图服务，不上传素材；需要 Windows + Photoshop + Node.js。

项目页：https://kriswd.github.io/Fdesign/?utm_source=wechat&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=china_private_group
GitHub：https://github.com/Kriswd/Fdesign

现在最需要真实反馈：首次运行卡在哪、PSD 模板哪里不兼容、导出报错是否清楚。
```

## 开源中国 / 国内开发者社区

标题：

```text
Fdesign V3.0：开源的本地 Photoshop + Excel 批量 PSD 生产工作台
```

正文：

```markdown
Fdesign V3.0 是一个面向电商图片生产的本地 Photoshop 自动化工作台。

核心能力：

- 导入 PSD 模板并识别可替换变量
- 绑定 Excel 商品字段和商品图
- 通过本机 Photoshop 批量导出 PSD、PSB、PNG、JPEG
- 保持素材和输出都在本地

适合：

- 电商设计师和运营
- Photoshop 脚本/自动化开发者
- 需要保留 PSD 源文件的小团队

限制：

- Windows + 本机 Photoshop + Node.js 18+
- 不包含 Photoshop、模板素材、字体或真实业务数据

项目页：https://kriswd.github.io/Fdesign/?utm_source=oschina&utm_medium=community&utm_campaign=fdesign_v3_launch&utm_content=china_open_source_intro
GitHub：https://github.com/Kriswd/Fdesign
```
