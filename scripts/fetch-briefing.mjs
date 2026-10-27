import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import config from "../config/sources.json" with { type: "json" };
import { fetchFeed } from "./lib/rss.mjs";
import { fetchPsychiatryResearch } from "./lib/pubmed.mjs";
import {
  buildNewsOverview,
  detectCategory,
  detectCountry,
  fallbackMedtechItem,
  fallbackNewsItem,
  fallbackResearchItem,
  mergeEnrichment,
  scoreItem
} from "./lib/analysis.mjs";
import { enrichWithModel } from "./lib/ai.mjs";
import { normalizedTitle, slugify, truncate } from "./lib/text.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const ARCHIVE_DIR = path.join(DATA_DIR, "archive");
const NOW = process.env.BRIEFING_NOW ? new Date(process.env.BRIEFING_NOW) : new Date();
const DATE_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: config.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(NOW);

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha1").update(value).digest("hex").slice(0, 12)}`;
}

function titleBigrams(value) {
  const normalized = normalizedTitle(value);
  const words = normalized.split(" ").filter((word) => word.length > 2);
  return new Set(words.length > 1 ? words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`) : [normalized]);
}

function titleSimilarity(a, b) {
  const left = titleBigrams(a);
  const right = titleBigrams(b);
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((value) => right.has(value)).length;
  return overlap / Math.min(left.size, right.size);
}

function deduplicate(items) {
  const sorted = items.sort((a, b) => scoreItem(b) - scoreItem(a));
  const selected = [];
  for (const item of sorted) {
    const duplicate = selected.find(
      (existing) =>
        existing.url === item.url ||
        normalizedTitle(existing.title) === normalizedTitle(item.title) ||
        titleSimilarity(existing.title, item.title) > 0.72
    );
    if (!duplicate) selected.push(item);
  }
  return selected;
}

function selectBalancedNews(items) {
  const categories = ["politics", "economy", "technology", "culture"];
  const quotas = { politics: 2, economy: 2, technology: 1, culture: 1 };
  const result = [];
  const sourceCounts = new Map();

  for (const category of categories) {
    const candidates = items.filter((item) => item.category === category);
    for (const item of candidates) {
      const sourceCount = sourceCounts.get(item.sourceId) ?? 0;
      if (sourceCount >= 2) continue;
      result.push(item);
      sourceCounts.set(item.sourceId, sourceCount + 1);
      if (result.filter((entry) => entry.category === category).length >= quotas[category]) break;
    }
  }

  if (result.length < 6) {
    for (const item of items) {
      if (result.length >= 6) break;
      if (!result.some((entry) => entry.id === item.id)) result.push(item);
    }
  }

  return result.sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, 6);
}

function selectDiverse(items, key, max) {
  const result = [];
  const counts = new Map();

  for (const item of items) {
    const value = key(item);
    if ((counts.get(value) ?? 0) > 0) continue;
    result.push(item);
    counts.set(value, 1);
    if (result.length >= max) return result;
  }

  for (const item of items) {
    if (result.some((entry) => entry.id === item.id)) continue;
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function prepareNewsItem(item) {
  const category = detectCategory(item);
  const prepared = {
    ...item,
    id: stableId("news", item.url),
    category,
    categoryLabel: {
      politics: "政治与地缘",
      economy: "经济与市场",
      technology: "科技与创新",
      culture: "文化与社会"
    }[category],
    country: detectCountry(item),
    importance: Math.min(5, Math.max(2, Math.round(scoreItem(item))))
  };
  return fallbackNewsItem(prepared);
}

function prepareMedtechItem(item) {
  const prepared = {
    ...item,
    id: stableId("medtech", item.url),
    country: detectCountry(item)
  };
  return fallbackMedtechItem(prepared);
}

function prepareResearchItem(article, index) {
  return {
    ...fallbackResearchItem(article),
    rank: index + 1,
    evidenceLevel: /随机对照|系统综述|Meta/.test(article.studyType) ? "高" : /队列|纵向/.test(article.studyType) ? "中" : "低",
    tags: article.keywords.slice(0, 4)
  };
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readPreviousBriefing() {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, "latest.json"), "utf8"));
  } catch {
    return null;
  }
}

async function updateArchiveIndex() {
  const files = (await fs.readdir(ARCHIVE_DIR).catch(() => []))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse()
    .slice(0, 31);
  const index = files.map((file) => ({ date: file.replace(".json", ""), url: `./data/archive/${file}` }));
  await writeJson(path.join(ARCHIVE_DIR, "index.json"), index);
}

async function main() {
  console.log(`Building briefing for ${DATE_KEY} (${config.timezone})`);
  const previousBriefing = await readPreviousBriefing();

  const feedTasks = config.news.map((source) =>
    fetchFeed(source)
      .then((items) => ({ source: source.name, items }))
      .catch((error) => ({ source: source.name, items: [], error: error.message }))
  );
  const medtechTasks = config.medtech.map((source) =>
    fetchFeed(source)
      .then((items) => ({ source: source.name, items }))
      .catch((error) => ({ source: source.name, items: [], error: error.message }))
  );

  const [newsResults, medtechResults, researchResult] = await Promise.all([
    Promise.all(feedTasks),
    Promise.all(medtechTasks),
    fetchPsychiatryResearch(config.psychiatryJournals, { now: NOW })
      .then((items) => ({ items }))
      .catch((error) => ({
        error: error.message,
        items: []
      }))
  ]);

  const notices = [];
  if (researchResult.error) notices.push(`PubMed 暂时不可用：${truncate(researchResult.error, 160)}`);

  const newsRaw = deduplicate(
    newsResults.flatMap((result) =>
      result.items
        .map(prepareNewsItem)
        .filter((item) => {
          const age = (NOW - new Date(item.publishedAt)) / 3_600_000;
          return age >= -12 && age <= 96;
        })
    )
  );
  const selectedNews = selectBalancedNews(newsRaw);

  let medtech = selectDiverse(
    deduplicate(
      medtechResults.flatMap((result) =>
        result.items.map(prepareMedtechItem).filter((item) => {
          const age = (NOW - new Date(item.publishedAt)) / 3_600_000;
          return age >= -12 && age <= 160;
        })
      )
    ),
    (item) => item.source,
    4
  );

  let research = selectDiverse(
    (researchResult.items ?? []).map(prepareResearchItem),
    (item) => item.journal,
    5
  );
  let medtechAsOf = NOW.toISOString();
  let researchAsOf = NOW.toISOString();

  if (!medtech.length && previousBriefing?.medtech?.length) {
    medtech = previousBriefing.medtech.slice(0, 4);
    medtechAsOf = previousBriefing.medtechAsOf || previousBriefing.generatedAt;
    notices.push("医工资讯本次未取得新内容，暂时保留上一次成功同步的条目。");
  }
  if (!research.length && previousBriefing?.research?.length) {
    research = previousBriefing.research.slice(0, 5);
    researchAsOf = previousBriefing.researchAsOf || previousBriefing.generatedAt;
    notices.push("PubMed 本次未取得新论文，暂时保留上一次成功同步的研究条目。");
  }
  const overview = buildNewsOverview(selectedNews, NOW.toISOString());

  let briefing = {
    schemaVersion: 1,
    generatedAt: NOW.toISOString(),
    briefingDate: DATE_KEY,
    timezone: config.timezone,
    edition: `第 ${DATE_KEY.replaceAll("-", ".")} 期`,
    analysisMode: "rules",
    overview,
    news: selectedNews,
    medtech,
    medtechAsOf,
    research,
    researchAsOf,
    stats: {
      newsSources: new Set(selectedNews.map((item) => item.sourceId)).size,
      countries: new Set(selectedNews.map((item) => item.country)).size,
      researchJournals: new Set(research.map((item) => item.journal)).size,
      medtechSignals: medtech.length
    },
    methodology: {
      news: "来源为公开 RSS；按时效、来源、跨地区影响和主题平衡筛选。相同事件会在标题层面去重。",
      medtech: "通过公开新闻检索聚合医工技能、医疗 AI、器械研发和医学职业动态，再链接到稳定招聘与职业资源入口。",
      research: "通过 PubMed 检索高影响力精神医学期刊池近两个月论文；JCR 分区应以 Clarivate 当年官方数据复核。",
      analysis: "事实摘要来自公开来源或论文摘要；模型分析明确标注为推断。重要决定请阅读原文。"
    },
    notices,
    debug: {
      modelErrors: [],
      failedSources: [...newsResults, ...medtechResults]
        .filter((result) => result.error)
        .map((result) => ({ source: result.source, error: result.error }))
    },
    sourceHealth: [...newsResults, ...medtechResults].map((result) => ({
      source: result.source,
      ok: !result.error,
      count: result.items.length,
      error: result.error ?? ""
    }))
  };

  const modelResult = await enrichWithModel(briefing);
  if (modelResult.enrichment) {
    briefing = mergeEnrichment(briefing, modelResult.enrichment);
    briefing.analysisMode = "ai";
    briefing.analysisProvider = modelResult.provider;
  } else {
    briefing.debug.modelErrors = modelResult.errors;
    notices.push("当前为“基础分析模式”：只展示来源事实与规则化观察清单，不自动补写因果结论。配置模型后会恢复完整分析。");
    briefing.notices = notices;
  }

  if (!briefing.news.length && !briefing.research.length) {
    briefing.notices.push("本次更新未取得任何内容。请检查 GitHub Actions 网络日志，不应覆盖上一次成功版本。");
    const latestPath = path.join(DATA_DIR, "latest.json");
    try {
      const previous = JSON.parse(await fs.readFile(latestPath, "utf8"));
      if (previous.news?.length || previous.research?.length) {
        previous.notices = [
          `最近一次抓取失败：${DATE_KEY}，页面继续展示 ${previous.briefingDate} 的成功版本。`,
          ...(previous.notices ?? [])
        ];
        await writeJson(latestPath, previous);
        console.error("All live sources failed; preserved previous successful briefing.");
        return;
      }
    } catch {
      // No previous briefing to preserve.
    }
  }

  briefing.slug = slugify(`${DATE_KEY}-${briefing.overview.title}`);
  await writeJson(path.join(DATA_DIR, "latest.json"), briefing);
  await writeJson(path.join(ARCHIVE_DIR, `${DATE_KEY}.json`), briefing);
  await updateArchiveIndex();

  console.log(
    `Generated ${briefing.news.length} news, ${briefing.medtech.length} medtech and ${briefing.research.length} research items via ${briefing.analysisMode}.`
  );
  if (briefing.notices.length) console.log(`Notices: ${briefing.notices.join(" | ")}`);
}

main().catch(async (error) => {
  console.error(error);
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    await fs.appendFile(summaryFile, `## Dawn Brief update failed\n\n\`\`\`\n${error.stack}\n\`\`\`\n`);
  }
  process.exitCode = 1;
});
