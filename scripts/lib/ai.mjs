function cleanJson(text) {
  const trimmed = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Model response did not contain a JSON object");
  return JSON.parse(trimmed.slice(first, last + 1));
}

function compactNews(item) {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    category: item.categoryLabel,
    country: item.country,
    publishedAt: item.publishedAt,
    excerpt: item.description.slice(0, 520)
  };
}

function compactMedtech(item) {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    publishedAt: item.publishedAt,
    excerpt: item.description.slice(0, 440)
  };
}

function compactResearch(item) {
  return {
    id: item.id,
    pmid: item.pmid,
    title: item.title,
    journal: item.journal,
    studyType: item.studyType,
    sample: item.sample,
    publicationDate: item.publicationDate,
    abstract: item.abstract.slice(0, 1600)
  };
}

function createPrompt(data) {
  return {
    task:
      "为中文读者制作一份可追溯的每日简报。读者关注国际政治经济文化科技、医工交叉、医学职业转型与精神医学研究。严格只依据给定材料；无法从材料确认的原因必须写成“尚不清楚，需观察…”，不得补造事实。",
    rules: [
      "将事实摘要与推断分开。contextZh 解释直接前因、可能的因果链和仍需验证的环节。",
      "impactZh 面向普通读者，写 1-2 个具体生活影响，避免投资、法律或医疗指令。",
      "新闻 importance 为 1-5；只有全球重大、持续影响或多地区联动才给 5。",
      "医工资讯要落到技能、岗位或转行动作；不要把新闻标题包装成确定岗位。",
      "研究必须按论文摘要描述方法、主要发现、临床意义与局限；不得推断摘要未报告的显著性或效应量。",
      "evidenceLevel 只能是 高、中、低。随机试验/高质量系统综述通常高；大样本纵向研究可中高；小样本、横断面、机制研究通常低。",
      "保留给定 id 或 pmid，不要新增条目。中文简洁，各字段尽量控制在 120 个汉字内。",
      "overview.title 是一句今日判断，不能夸张；watchlist 为 2-4 个接下来要观察的具体指标。"
    ],
    outputShape: {
      overview: { eyebrow: "string", title: "string", summary: "string", watchlist: ["string"] },
      news: [{ id: "string", headlineZh: "string", summaryZh: "string", contextZh: "string", impactZh: "string", importance: 1 }],
      medtech: [{ id: "string", titleZh: "string", takeawayZh: "string", skillZh: "string", careerZh: "string" }],
      research: [{
        pmid: "string",
        titleZh: "string",
        summaryZh: "string",
        methodZh: "string",
        resultZh: "string",
        clinicalZh: "string",
        caveatZh: "string",
        evidenceLevel: "中"
      }]
    },
    materials: {
      news: data.news.map(compactNews),
      medtech: data.medtech.map(compactMedtech),
      research: data.research.map(compactResearch)
    }
  };
}

async function postChat(endpoint, apiKey, model, prompt, provider) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 7000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是严谨的国际新闻与医学研究编辑。输出必须是合法 JSON，不得输出 Markdown。" },
        { role: "user", content: JSON.stringify(prompt) }
      ]
    }),
    signal: AbortSignal.timeout(90_000)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${provider}: HTTP ${response.status} ${body.slice(0, 220)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider}: empty model response`);
  return cleanJson(content);
}

export async function enrichWithModel(data, env = process.env) {
  const prompt = createPrompt(data);
  const errors = [];

  if (env.OPENAI_API_KEY) {
    try {
      return {
        provider: "openai",
        enrichment: await postChat(
          "https://api.openai.com/v1/chat/completions",
          env.OPENAI_API_KEY,
          env.OPENAI_MODEL || "gpt-4.1-mini",
          prompt,
          "OpenAI"
        )
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  const githubToken = env.GITHUB_MODELS_TOKEN || env.GITHUB_TOKEN;
  if (githubToken) {
    try {
      return {
        provider: "github-models",
        enrichment: await postChat(
          "https://models.github.ai/inference/chat/completions",
          githubToken,
          env.GITHUB_MODEL || "openai/gpt-4.1-mini",
          prompt,
          "GitHub Models"
        )
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  return { provider: "rules", enrichment: null, errors };
}
