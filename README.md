# 晨鉴 Dawn Brief

每天早上（台北时间 07:00）自动更新的个人全球简报，聚焦：

- 世界主要国家的政治、经济、文化、科技新闻及前因后果
- 医工交叉技能、医疗科技产业、医学人才招聘与职业转型
- 高影响力精神医学期刊的最新研究

## 自动更新

GitHub Actions 在每天 `23:00 UTC`（台北时间次日 `07:00`）运行：

1. 抓取公开 RSS 新闻，并通过 Europe PMC 获取 PubMed 收录的高影响力精神医学文献；
2. 去重，只保留 6 条世界新闻、4 条医工资讯和 5 篇精神医学论文；
3. 优先使用 GitHub Models 生成中文摘要与可追溯分析；
4. 验证数据，提交 `data/archive/` 历史快照；
5. 发布到 GitHub Pages。

GitHub 的计划任务可能因平台负载延迟数分钟，因此页脚展示的是实际生成时间。

## “基础分析模式”是什么意思

它表示网页已经抓到了新闻，但没有可用的语言模型来翻译、归纳并分析前因后果。此时页面只展示：

- 来源提供的原始标题与短摘要；
- 固定的生活影响观察清单；
- 可展开的来源状态，不会伪造因果结论。

这不是页面故障。自动更新最适合在 GitHub Actions 中运行，那里会使用仓库的 `GITHUB_TOKEN` 和 `models: read` 权限访问 GitHub Models。

如果发布后仍看到“基础分析模式”：

1. 打开仓库的 `Actions`，点开最近一次 `Daily Briefing`；
2. 查看 `Generate daily briefing` 步骤的日志；
3. 确认工作流没有被仓库策略禁用，并且 `models: read` 权限仍存在；
4. 也可以在本地运行 `node scripts/diagnose.mjs` 检查 RSS、PubMed 和密钥状态。

更详细的排查说明见下方“分析模型配置”。

## 分析模型配置

工作流会优先使用仓库的 GitHub Actions 令牌访问 GitHub Models，不需要额外密钥。模型临时不可用时，页面仍会用规则筛选并呈现原文与观察清单，但不会伪造因果解释。

如需更强且更稳定的中文分析，可在仓库 Secrets 中添加：

- `OPENAI_API_KEY`
- 可选 Repository variable：`OPENAI_MODEL`（默认 `gpt-4.1-mini`）

配置 OpenAI 后，工作流会优先使用 OpenAI。

本地调试时，请在当前 PowerShell 窗口设置密钥后再生成。不要把密钥写入网页、JSON 或提交到仓库：

```powershell
$env:OPENAI_API_KEY = "你的密钥"
node scripts/fetch-briefing.mjs
```

只想检查网络和数据源时可以运行：

```powershell
node scripts/diagnose.mjs
```

## 筛选边界

- 新闻只保存短摘要和原始链接，不复制全文。
- “高影响力期刊池”提供的是实用性筛选，不等同于实时查询 Clarivate JCR。正式考核、投稿或晋升用途请以当年 JCR 官方数据复核。
- 自动分析是阅读辅助，不构成医疗、投资或法律建议。

## 本地运行

```bash
node scripts/fetch-briefing.mjs
node scripts/check-data.mjs
node scripts/serve.mjs
```

然后打开 `http://127.0.0.1:4173`。

## 自定义

新闻源、医工检索词和精神医学期刊池位于 [`config/sources.json`](config/sources.json)。可增删 RSS 地址或调整期刊范围。每日内容数量在 `scripts/fetch-briefing.mjs` 中统一控制。
