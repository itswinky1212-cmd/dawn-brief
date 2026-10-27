import { truncate } from "./text.mjs";

const CATEGORY_LABELS = {
  politics: "政治与地缘",
  economy: "经济与市场",
  technology: "科技与创新",
  culture: "文化与社会"
};

const CATEGORY_LIFE_IMPACT = {
  politics: "关注签证、跨境出行、监管与公共政策变化；若涉及冲突或贸易措施，先核对官方公告，再调整旅行与长期计划。",
  economy: "留意汇率、利率、能源与食品价格的传导。短期新闻不宜作为投资依据，应先观察政策和市场是否形成连续趋势。",
  technology: "重点判断它是否改变工作工具、数据合规或技能需求；同时检查隐私、误差与供应商依赖等落地风险。",
  culture: "观察它如何改变教育、媒体、社会规范与公共讨论；文化议题常通过政策和平台规则间接影响日常生活。"
};

const COUNTRY_RULES = [
  ["美国", /\b(U\.S\.|US|United States|America|White House|Congress|Washington|Trump|Biden)\b/i],
  ["中国", /\b(China|Chinese|Beijing|Xi Jinping)\b/i],
  ["欧洲", /\b(Europe|European Union|EU|Brussels|Germany|France|Italy|Spain)\b/i],
  ["英国", /\b(Britain|British|UK|United Kingdom|London)\b/i],
  ["日本", /\b(Japan|Japanese|Tokyo)\b/i],
  ["韩国", /\b(Korea|Korean|Seoul)\b/i],
  ["印度", /\b(India|Indian|Delhi|Mumbai)\b/i],
  ["俄罗斯", /\b(Russia|Russian|Moscow|Kremlin|Putin)\b/i],
  ["乌克兰", /\b(Ukraine|Ukrainian|Kyiv|Zelensky)\b/i],
  ["中东", /\b(Middle East|Israel|Gaza|Palestin|Iran|Lebanon|Syria|Saudi)\b/i],
  ["亚太", /\b(Asia|Asia-Pacific|Pacific|Australia|ASEAN)\b/i],
  ["非洲", /\b(Africa|African|Nigeria|Kenya|Ethiopia|South Africa)\b/i],
  ["拉美", /\b(Latin America|Brazil|Mexico|Argentina|Chile|Colombia)\b/i]
];

const CATEGORY_RULES = [
  ["economy", /\b(market|econom|inflation|interest rate|central bank|trade|tariff|GDP|jobs|unemploy|oil|price|business|company|bank|currency)\b/i],
  ["technology", /\b(AI|artificial intelligence|technology|tech|chip|semiconductor|cyber|robot|software|internet|quantum|space)\b/i],
  ["culture", /\b(culture|art|film|music|book|museum|festival|media|religion|education|sport)\b/i],
  ["politics", /\b(election|government|president|minister|parliament|war|military|diplomat|policy|law|court|protest|summit|sanction)\b/i]
];

const PRIORITY_RULES = /\b(war|invasion|ceasefire|election|tariff|sanction|central bank|interest rate|nuclear|AI|semiconductor|pandemic|outbreak|privacy|safety)\b/i;

export function detectCategory(item) {
  const text = `${item.title} ${item.description}`;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return item.category && CATEGORY_LABELS[item.category] ? item.category : "politics";
}

export function detectCountry(item) {
  const text = `${item.title} ${item.description}`;
  const matches = COUNTRY_RULES.map(([country, pattern]) => {
    const match = text.match(pattern);
    return match ? { country, index: match.index ?? Number.MAX_SAFE_INTEGER } : null;
  })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);
  return matches[0]?.country ?? "全球";
}

export function scoreItem(item) {
  const published = new Date(item.publishedAt).getTime();
  const ageHours = Math.max(0, (Date.now() - published) / 3_600_000);
  const recency = Math.max(0.2, 1 - ageHours / 72);
  const priority = PRIORITY_RULES.test(`${item.title} ${item.description}`) ? 1.2 : 1;
  const descriptionDepth = Math.min(1.2, 0.7 + item.description.length / 700);
  return (item.sourceWeight ?? 1) * recency * priority * descriptionDepth;
}

export function fallbackNewsItem(item) {
  return {
    ...item,
    categoryLabel: CATEGORY_LABELS[item.category],
    headlineZh: item.title,
    summaryZh: truncate(item.description || "原文未提供摘要，请打开来源阅读。", 210),
    contextZh: "当前未启用语言模型，无法在可靠约束下自动推断前因后果。请结合原文中的时间线、政策主体与相关方回应进行判断。",
    impactZh: CATEGORY_LIFE_IMPACT[item.category],
    analysisMode: "rules"
  };
}

export function buildNewsOverview(news, generatedAt) {
  const top = news.slice(0, 3);
  const summaries = top.map((item) => ({
    title: item.headlineZh || item.title,
    text: item.summaryZh || truncate(item.description, 120),
    source: item.source,
    category: item.categoryLabel || CATEGORY_LABELS[item.category]
  }));

  return {
    eyebrow: "今日世界脉搏",
    title: "今天，只看真正重要的。",
    summary:
      "本版按来源可靠性、时效性、跨地区影响和与医疗职业读者的相关性排序。新闻摘要与推断分开呈现，重要决定仍应回到原始来源。",
    generatedAt,
    items: summaries
  };
}

export function fallbackMedtechItem(item) {
  return {
    ...item,
    titleZh: item.title,
    takeawayZh: truncate(item.description || "打开原文查看最新行业信息。", 190),
    skillZh: "优先核对岗位要求中的数据分析、法规事务、临床验证、系统工程或跨团队沟通能力。",
    careerZh: "可把这条信息转化为一次职业信息访谈、岗位关键词搜索，或一个小型可展示项目。",
    analysisMode: "rules"
  };
}

export function fallbackResearchItem(article) {
  return {
    ...article,
    titleZh: article.title,
    summaryZh: truncate(article.abstract, 260),
    methodZh: `${article.studyType}${article.sample ? `，样本信息：${article.sample}` : ""}。`,
    resultZh: "请阅读论文摘要与全文，优先查看主要结局、效应量与置信区间；系统未启用模型时不会推断具体结果。",
    clinicalZh: "先判断研究人群、干预或暴露、对照和结局是否适用于你的临床场景，不要仅凭一则新闻改变诊疗。",
    caveatZh: "观察性结果通常不能证明因果；单中心、小样本或短期随访均会限制外推。请核对预注册、偏倚风险和同期评论。",
    analysisMode: "rules"
  };
}

export function mergeEnrichment(base, enrichment) {
  const newsById = new Map((enrichment.news ?? []).map((item) => [item.id, item]));
  const medtechById = new Map((enrichment.medtech ?? []).map((item) => [item.id, item]));
  const researchById = new Map((enrichment.research ?? []).map((item) => [item.id || item.pmid, item]));

  const news = base.news.map((item) => {
    const result = newsById.get(item.id);
    return result
      ? {
          ...item,
          headlineZh: result.headlineZh?.trim() || item.headlineZh,
          summaryZh: result.summaryZh?.trim() || item.summaryZh,
          contextZh: result.contextZh?.trim() || item.contextZh,
          impactZh: result.impactZh?.trim() || item.impactZh,
          importance: Math.min(5, Math.max(1, Number(result.importance) || item.importance)),
          analysisMode: "ai"
        }
      : item;
  });

  const medtech = base.medtech.map((item) => {
    const result = medtechById.get(item.id);
    return result
      ? {
          ...item,
          titleZh: result.titleZh?.trim() || item.titleZh,
          takeawayZh: result.takeawayZh?.trim() || item.takeawayZh,
          skillZh: result.skillZh?.trim() || item.skillZh,
          careerZh: result.careerZh?.trim() || item.careerZh,
          analysisMode: "ai"
        }
      : item;
  });

  const research = base.research.map((item) => {
    const result = researchById.get(item.pmid) || researchById.get(item.id);
    return result
      ? {
          ...item,
          titleZh: result.titleZh?.trim() || item.titleZh,
          summaryZh: result.summaryZh?.trim() || item.summaryZh,
          methodZh: result.methodZh?.trim() || item.methodZh,
          resultZh: result.resultZh?.trim() || item.resultZh,
          clinicalZh: result.clinicalZh?.trim() || item.clinicalZh,
          caveatZh: result.caveatZh?.trim() || item.caveatZh,
          evidenceLevel: ["高", "中", "低"].includes(result.evidenceLevel) ? result.evidenceLevel : item.evidenceLevel,
          analysisMode: "ai"
        }
      : item;
  });

  const overviewResult = enrichment.overview;
  const overview = overviewResult?.title
    ? {
        ...base.overview,
        eyebrow: overviewResult.eyebrow?.trim() || base.overview.eyebrow,
        title: overviewResult.title.trim(),
        summary: overviewResult.summary?.trim() || base.overview.summary,
        watchlist: Array.isArray(overviewResult.watchlist)
          ? overviewResult.watchlist.filter((value) => typeof value === "string").slice(0, 4)
          : []
      }
    : base.overview;

  return { ...base, overview, news, medtech, research };
}
