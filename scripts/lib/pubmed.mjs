import { allElements, firstElement, stripTags } from "./text.mjs";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function formatPubMedDate(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "/");
}

function monthsAgo(date, months) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

function parsePublicationDate(block, fallback) {
  const articleDate = block.match(/<ArticleDate\b[^>]*>[\s\S]*?<\/ArticleDate>/i)?.[0] ?? "";
  const year =
    firstElement(articleDate, "Year") ||
    firstElement(block.match(/<PubDate\b[^>]*>[\s\S]*?<\/PubDate>/i)?.[0] ?? "", "Year");
  const month =
    firstElement(articleDate, "Month") ||
    firstElement(block.match(/<PubDate\b[^>]*>[\s\S]*?<\/PubDate>/i)?.[0] ?? "", "Month");
  const day =
    firstElement(articleDate, "Day") ||
    firstElement(block.match(/<PubDate\b[^>]*>[\s\S]*?<\/PubDate>/i)?.[0] ?? "", "Day");

  if (!year) return fallback;
  const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const numericMonth = /^\d+$/.test(month) ? Number(month) - 1 : (monthMap[month.slice(0, 3)] ?? 0);
  return new Date(Date.UTC(Number(year), numericMonth, Number(day) || 1)).toISOString();
}

function classifyStudy(title, abstract) {
  const text = `${title} ${abstract}`.toLowerCase();
  if (/randomi[sz]ed|randomised controlled|\brct\b/.test(text)) return "随机对照试验";
  if (/meta-analysis|systematic review/.test(text)) return "系统综述 / Meta 分析";
  if (/cohort|longitudinal|prospective|retrospective/.test(text)) return "队列 / 纵向研究";
  if (/case-control/.test(text)) return "病例对照研究";
  if (/cross-sectional/.test(text)) return "横断面研究";
  if (/genome-wide|mendelian/.test(text)) return "遗传学 / 孟德尔随机化";
  if (/case report|case series/.test(text)) return "病例报告 / 系列";
  if (/review/.test(text)) return "综述";
  return "原始研究";
}

function extractSample(abstract) {
  const matches = [
    ...abstract.matchAll(/\b(?:n\s*=\s*|total of\s+|included\s+|enrolled\s+)([\d,]{2,})\s*(participants|patients|adults|children|individuals|people|cases)?/gi)
  ];
  if (!matches.length) return "";
  const match = matches[0];
  return `${match[1]}${match[2] ? ` ${match[2]}` : ""}`;
}

function parseArticles(xml, fallbackDate) {
  const articles = [...xml.matchAll(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/gi)].map((match) => match[0]);

  return articles
    .map((block) => {
      const pmid = firstElement(block, "PMID");
      const title = firstElement(block, "ArticleTitle");
      const journal = firstElement(block, "Title");
      const abstractParts = allElements(block, "AbstractText");
      const abstract = abstractParts.filter(Boolean).join(" ");
      const doi =
        [...block.matchAll(/<ArticleId\s+IdType=["']doi["'][^>]*>([\s\S]*?)<\/ArticleId>/gi)]
          .map((item) => stripTags(item[1]))
          .find(Boolean) ?? "";
      const publicationTypes = allElements(block, "PublicationType").join("; ");
      const keywords = allElements(block, "Keyword");

      return {
        id: `pmid-${pmid}`,
        pmid,
        title,
        abstract,
        journal,
        doi,
        publicationDate: parsePublicationDate(block, fallbackDate),
        studyType: classifyStudy(title, abstract),
        sample: extractSample(abstract),
        publicationTypes,
        keywords: keywords.slice(0, 6),
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : doi ? `https://doi.org/${doi}` : "",
        journalTier: "高影响力期刊池",
        jcrDisclaimer: "期刊筛选基于高影响力精神医学期刊池；具体 JCR 分区以 Clarivate 当年数据为准。"
      };
    })
    .filter((article) => article.pmid && article.title && article.abstract);
}

async function fetchNcbiResearch(journals, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const from = monthsAgo(now, 2);
  const journalQuery = journals.map((journal) => `"${journal}"[Journal]`).join(" OR ");
  const term = `(${journalQuery}) AND ("${formatPubMedDate(from)}"[Date - Publication] : "${formatPubMedDate(now)}"[Date - Publication])`;
  const search = new URL(`${EUTILS}/esearch.fcgi`);
  search.search = new URLSearchParams({
    db: "pubmed",
    term,
    retmax: "30",
    retmode: "json",
    sort: "pub date",
    tool: "dawn-brief"
  }).toString();

  const searchResponse = await fetch(search, {
    headers: { "User-Agent": "DawnBriefBot/1.0" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!searchResponse.ok) throw new Error(`PubMed search: HTTP ${searchResponse.status}`);

  const searchResult = await searchResponse.json();
  const ids = searchResult.esearchresult?.idlist ?? [];
  if (!ids.length) return [];

  await new Promise((resolve) => setTimeout(resolve, 350));
  const articleUrl = new URL(`${EUTILS}/efetch.fcgi`);
  articleUrl.search = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "xml"
  }).toString();

  const articleResponse = await fetch(articleUrl, {
    headers: { "User-Agent": "DawnBriefBot/1.0" },
    signal: AbortSignal.timeout(25_000)
  });
  if (!articleResponse.ok) throw new Error(`PubMed fetch: HTTP ${articleResponse.status}`);

  return parseArticles(await articleResponse.text(), now.toISOString())
    .sort((a, b) => new Date(b.publicationDate) - new Date(a.publicationDate))
    .slice(0, 24);
}

async function fetchEuropePmcResearch(journals, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const from = monthsAgo(now, 2);
  const journalQuery = journals.map((journal) => `JOURNAL:"${journal}"`).join(" OR ");
  const query = `(${journalQuery}) AND FIRST_PDATE:[${from.toISOString().slice(0, 10)} TO ${now
    .toISOString()
    .slice(0, 10)}]`;
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.search = new URLSearchParams({
    query,
    format: "json",
    pageSize: "30",
    sort: "P_PDATE_D desc",
    resultType: "core"
  }).toString();

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "DawnBriefBot/1.0" },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`Europe PMC: HTTP ${response.status}`);
  const payload = await response.json();

  return (payload.resultList?.result ?? [])
    .map((article) => {
      const title = stripTags(article.title ?? "");
      const abstract = stripTags(article.abstractText ?? "");
      const journal =
        article.journalTitle ||
        article.journalInfo?.journal?.title ||
        journalTitleFromAbbreviation(article.journalInfo?.journal?.medlineAbbreviation);
      const pmid = article.pmid ?? "";
      const doi = article.doi ?? "";
      const publicationTypes = [
        article.pubTypeList?.pubType,
        article.pubType
      ]
        .flat()
        .filter(Boolean)
        .join("; ");

      return {
        id: `pmid-${pmid || article.id}`,
        pmid,
        title,
        abstract,
        journal: normalizeJournalName(journal),
        doi,
        publicationDate: new Date(`${article.firstPublicationDate || now.toISOString().slice(0, 10)}T12:00:00Z`).toISOString(),
        studyType: classifyStudy(title, abstract),
        sample: extractSample(abstract),
        publicationTypes,
        keywords: [
          article.keywordList?.keyword,
          article.meshHeadingList?.meshHeading?.map((heading) => heading.descriptorName)
        ]
          .flat()
          .filter(Boolean)
          .slice(0, 6),
        url: pmid
          ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
          : doi
            ? `https://doi.org/${doi}`
            : `https://europepmc.org/article/${article.source || "MED"}/${article.id}`,
        journalTier: "高影响力期刊池",
        jcrDisclaimer: "期刊筛选基于高影响力精神医学期刊池；具体 JCR 分区以 Clarivate 当年数据为准。"
      };
    })
    .filter((article) => article.title && article.abstract && article.url)
    .sort((a, b) => new Date(b.publicationDate) - new Date(a.publicationDate))
    .slice(0, 24);
}

function journalTitleFromAbbreviation(abbreviation = "") {
  const map = {
    "World Psychiatry": "World Psychiatry",
    "JAMA Psychiatry": "JAMA Psychiatry",
    "Lancet Psychiatry": "Lancet Psychiatry",
    "Mol Psychiatry": "Molecular Psychiatry",
    "Biol Psychiatry": "Biological Psychiatry",
    "Am J Psychiatry": "American Journal of Psychiatry",
    "Transl Psychiatry": "Translational Psychiatry",
    "Br J Psychiatry": "British Journal of Psychiatry",
    "Schizophr Bull": "Schizophrenia Bulletin",
    "NPJ Schizophr": "NPJ Schizophrenia",
    "Psychiatry Clin Neurosci": "Psychiatry and Clinical Neurosciences",
    "Eur Psychiatry": "European Psychiatry",
    "Psychol Med": "Psychological Medicine"
  };
  return map[abbreviation] || abbreviation;
}

function normalizeJournalName(value = "") {
  const lower = String(value).toLowerCase();
  if (lower.startsWith("european psychiatry")) return "European Psychiatry";
  if (lower === "psychological medicine") return "Psychological Medicine";
  if (lower === "molecular psychiatry") return "Molecular Psychiatry";
  if (lower === "biological psychiatry") return "Biological Psychiatry";
  if (lower === "translational psychiatry") return "Translational Psychiatry";
  if (lower === "jama psychiatry") return "JAMA Psychiatry";
  if (lower === "lancet psychiatry" || lower === "the lancet psychiatry") return "Lancet Psychiatry";
  if (lower === "world psychiatry") return "World Psychiatry";
  return value;
}

export async function fetchPsychiatryResearch(journals, options = {}) {
  try {
    const articles = await fetchEuropePmcResearch(journals, options);
    if (articles.length) return articles;
  } catch (error) {
    console.warn(`Europe PMC unavailable, trying NCBI PubMed: ${error.message}`);
  }
  return fetchNcbiResearch(journals, options);
}
