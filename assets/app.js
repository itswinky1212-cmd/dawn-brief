const state = {
  data: null,
  filter: "all",
  query: "",
  saved: new Set(JSON.parse(localStorage.getItem("dawn-brief-saved") || "[]"))
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const chineseDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
});
const shortDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Taipei",
  month: "short",
  day: "numeric"
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function externalLink(text, url, className = "") {
  const link = el("a", className, text);
  const href = safeUrl(url);
  if (href) {
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function relativeAge(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3_600_000));
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-visible"), 1900);
}

function updateSavedCount() {
  $("#saved-count").textContent = String(state.saved.size);
  localStorage.setItem("dawn-brief-saved", JSON.stringify([...state.saved]));
}

function itemKey(item) {
  return item.id || item.url;
}

function saveButton(item) {
  const key = itemKey(item);
  const button = el("button", "save-button");
  button.type = "button";
  button.dataset.saveId = key;
  button.classList.toggle("is-saved", state.saved.has(key));
  button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.5 4.5h11v16L12 17l-5.5 3.5z"/></svg>';
  button.append(document.createTextNode(state.saved.has(key) ? "已收藏" : "收藏"));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.saved.has(key)) {
      state.saved.delete(key);
      toast("已移出稍后阅读");
    } else {
      state.saved.add(key);
      saveItemSnapshot(key, item);
      toast("已加入稍后阅读");
    }
    updateSavedCount();
    button.classList.toggle("is-saved", state.saved.has(key));
    button.lastChild.textContent = state.saved.has(key) ? "已收藏" : "收藏";
  });
  return button;
}

function saveItemSnapshot(key, item) {
  const snapshots = JSON.parse(localStorage.getItem("dawn-brief-saved-items") || "{}");
  const title = item.headlineZh || item.titleZh || item.title;
  snapshots[key] = { title, url: item.url, source: item.source || item.journal || "" };
  localStorage.setItem("dawn-brief-saved-items", JSON.stringify(snapshots));
}

function renderHeader(data) {
  $("#issue-date").textContent = chineseDate.format(new Date(`${data.briefingDate}T12:00:00+08:00`));
  $("#edition-label").textContent = data.edition;
  $("#edition-number").textContent = `NO. ${data.briefingDate.slice(5, 10).replace("-", ".")}`;
  $("#overview-eyebrow").textContent = data.overview?.eyebrow || "今日世界脉搏";
  $("#hero-title").innerHTML = "";
  const title = data.overview?.title || "把世界的变化，变成你的判断。";
  const titleParts = title.split("，");
  if (titleParts.length > 1) {
    $("#hero-title").append(document.createTextNode(`${titleParts[0]}，`), el("br"));
    const emphasis = el("em", "", titleParts.slice(1).join("，"));
    $("#hero-title").append(emphasis);
  } else {
    $("#hero-title").textContent = title;
  }
  $("#overview-summary").textContent = data.overview?.summary || "";
  $("#generated-label").textContent = `发布于 ${formatTime(data.generatedAt)}`;
  $("#live-dot").classList.toggle("is-stale", Date.now() - new Date(data.generatedAt).getTime() > 36 * 3_600_000);
  $("#watch-list").innerHTML = "";
  const watchlist = data.overview?.watchlist?.length
    ? data.overview.watchlist
    : data.news.slice(0, 3).map((item) => `${item.country}：继续关注「${item.headlineZh || item.title}」的后续政策或相关方回应。`);
  for (const text of watchlist.slice(0, 3)) $("#watch-list").append(el("li", "", text));

  const issue = Number(data.briefingDate.slice(5, 7)) * 31 + Number(data.briefingDate.slice(8, 10));
  $("#edition-number").textContent = `NO. ${String(issue).padStart(3, "0")}`;

  renderNotices(data);
}

function renderNotices(data) {
  const panel = $("#notice-panel");
  const health = data.sourceHealth || [];
  const healthy = health.filter((item) => item.ok).length;
  const failed = health.filter((item) => !item.ok);
  const notices = [...(data.notices || [])];
  if (data.analysisMode === "ai" && !notices.length && !failed.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("#notice-summary").textContent =
    data.analysisMode === "ai"
      ? `数据状态 · ${healthy}/${health.length} 个来源正常`
      : "基础分析模式 · 查看说明";
  const list = $("#notice-list");
  list.innerHTML = "";

  if (data.analysisMode !== "ai") {
    const explanation = el("div", "mode-explanation");
    explanation.append(
      el("p", "", "基础分析模式只做筛选与原文整理，不会猜测新闻背后的原因。完整模式会用语言模型生成中文摘要、因果链与生活影响。"),
      el("p", "", "这不是网页运行错误。把 OpenAI API Key 或 GitHub Models 权限配置好后，重新运行每日更新即可。")
    );
    list.append(explanation);
  }

  for (const notice of notices.slice(0, 3)) list.append(el("p", "status-note", notice));

  if (failed.length) {
    const sourceDetails = el("details", "source-details");
    sourceDetails.append(el("summary", "", `${failed.length} 个来源本次未同步`));
    for (const item of failed.slice(0, 8)) {
      sourceDetails.append(el("p", "", `${item.source}：${item.error || "连接失败"}`));
    }
    list.append(sourceDetails);
  }
}

function renderOverview(data) {
  const root = $("#overview-signals");
  root.innerHTML = "";
  const items = data.overview?.items?.length ? data.overview.items : data.news.slice(0, 3);
  for (const [index, item] of items.slice(0, 3).entries()) {
    const card = el("article", "signal-card");
    const meta = el("div", "signal-card-meta");
    meta.append(el("span", "", `${String(index + 1).padStart(2, "0")} / ${item.category || "今日信号"}`), el("span", "", shortDate.format(new Date(data.generatedAt))));
    card.append(meta, el("h3", "", item.title || ""), el("p", "", item.text || ""));
    root.append(card);
  }
}

function renderStats(data) {
  const root = $("#brief-stats");
  root.innerHTML = "";
  const stats = [
    [data.stats?.newsSources || 0, "新闻来源"],
    [data.stats?.countries || 0, "覆盖地区"],
    [data.research.length, "研究论文"],
    [data.medtech.length, "医工信号"]
  ];
  for (const [value, label] of stats) {
    const item = el("div", "stat-item");
    item.append(el("strong", "", String(value)), document.createTextNode(label));
    root.append(item);
  }
}

function renderNews() {
  const data = state.data;
  const grid = $("#news-grid");
  const empty = $("#news-empty");
  grid.innerHTML = "";
  const query = state.query.trim().toLowerCase();
  const filtered = data.news.filter((item) => {
    const categoryMatch = state.filter === "all" || item.category === state.filter;
    const haystack = [item.headlineZh, item.title, item.summaryZh, item.contextZh, item.impactZh, item.source, item.country]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return categoryMatch && (!query || haystack.includes(query));
  });
  empty.hidden = filtered.length > 0;

  for (const [index, item] of filtered.entries()) {
    const card = el("article", "story-card");
    card.style.animationDelay = `${Math.min(index * 45, 280)}ms`;
    const top = el("div", "story-card-top");
    const tags = el("div", "story-tags");
    tags.append(el("span", "tag category", item.categoryLabel), el("span", "tag", item.country));
    const importance = el("span", "importance");
    importance.setAttribute("aria-label", `重要度 ${item.importance || 3} / 5`);
    for (let i = 1; i <= 5; i += 1) importance.append(el("i", i <= (item.importance || 3) ? "on" : ""));
    top.append(tags, importance);

    const title = el("h3", "story-title");
    title.append(externalLink(item.headlineZh || item.title, item.url));
    if (item.headlineZh && item.headlineZh !== item.title) title.append(el("p", "story-original", item.title));
    const summary = el("p", "story-summary", item.summaryZh || item.description);

    const details = el("details", "analysis-block");
    details.append(el("summary", "", "前因后果 / 与你的生活"));
    const content = el("div", "analysis-content");
    for (const [label, text] of [
      ["CAUSE / 因果推断", item.contextZh],
      ["IMPACT / 生活落点", item.impactZh]
    ]) {
      if (!text) continue;
      const block = el("div", "analysis-item");
      block.append(el("strong", "", label), el("p", "", text));
      content.append(block);
    }
    details.append(content);

    const footer = el("div", "story-footer");
    footer.append(
      el("span", "story-source", `${item.source} · ${relativeAge(item.publishedAt)} · ${formatTime(item.publishedAt)}`),
      saveButton(item)
    );
    card.append(top, title, summary, details, footer);
    grid.append(card);
  }
}

function renderMedtech(data) {
  const root = $("#medtech-feed");
  root.innerHTML = "";
  if (!data.medtech.length) {
    root.append(el("p", "empty-state", "今日医工资讯暂时不可用。"));
    return;
  }
  for (const item of data.medtech) {
    const article = el("article", "medtech-item");
    const body = el("div");
    const title = el("h4");
    title.append(externalLink(item.titleZh || item.title, item.url));
    body.append(title, el("p", "", item.takeawayZh || item.description));
    const analysis = el("div", "mini-analysis");
    const skill = el("span");
    skill.append(el("strong", "", "能力信号 · "), document.createTextNode(item.skillZh || ""));
    const career = el("span");
    career.append(el("strong", "", "职业动作 · "), document.createTextNode(item.careerZh || ""));
    analysis.append(skill, career);
    const meta = el("div", "medtech-source");
    meta.append(el("span", "", item.source), el("span", "", relativeAge(item.publishedAt)));
    body.append(analysis, meta);
    const arrow = externalLink("↗", item.url, "medtech-arrow");
    article.append(body, arrow);
    root.append(article);
  }
}

function renderResearch(data) {
  const root = $("#research-list");
  root.innerHTML = "";
  if (!data.research.length) {
    root.append(el("p", "empty-state", "PubMed 今日暂时不可用。"));
    return;
  }
  for (const [index, item] of data.research.entries()) {
    const card = el("article", "paper-card");
    card.style.animationDelay = `${Math.min(index * 50, 300)}ms`;
    const meta = el("div", "paper-meta");
    meta.append(
      el("span", "paper-rank", String(index + 1).padStart(2, "0")),
      el("span", "journal-badge", item.journal),
      el("span", "paper-date", `${item.studyType || "研究"} · ${formatTime(item.publicationDate)}`),
      el("span", "evidence-chip", `证据强度 ${item.evidenceLevel || "待定"}`)
    );

    const content = el("div", "paper-content");
    const title = el("h3");
    title.append(externalLink(item.titleZh || item.title, item.url));
    content.append(title);
    if (item.titleZh && item.titleZh !== item.title) content.append(el("p", "paper-original", item.title));
    content.append(el("p", "paper-summary", item.summaryZh || item.abstract));

    const findings = el("div", "paper-findings");
    for (const [label, text] of [
      ["研究发现", item.resultZh],
      ["临床意义", item.clinicalZh],
      ["限制与警戒", item.caveatZh]
    ]) {
      const block = el("div", "finding-block");
      block.append(el("strong", "", label), el("p", "", text || "请阅读论文原文确认。"));
      findings.append(block);
    }
    content.append(findings);

    const details = el("details", "paper-details");
    details.append(el("summary", "", "PubMed 英文摘要 / METHODS"));
    details.append(el("p", "paper-abstract", `${item.methodZh || ""} ${item.abstract || ""}`.trim()));
    content.append(details);

    const footer = el("div", "paper-footer");
    footer.append(
      el("span", "", `PMID ${item.pmid || "—"}`),
      item.doi ? externalLink(`DOI ${item.doi}`, `https://doi.org/${item.doi}`) : el("span", "", "DOI 未提供"),
      saveButton(item)
    );
    content.append(footer);
    card.append(meta, content);
    root.append(card);
  }
}

async function renderArchive() {
  const root = $("#archive-grid");
  try {
    const response = await fetch("./data/archive/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No archive index");
    const entries = await response.json();
    root.innerHTML = "";
    if (!entries.length) {
      root.append(el("p", "archive-empty", "归档索引将在第一次自动更新后出现。"));
      return;
    }
    for (const entry of entries.slice(0, 12)) {
      const link = el("a", "archive-card");
      link.href = entry.url;
      link.download = `${entry.date}.json`;
      link.append(el("strong", "", entry.date.replaceAll("-", ".")), el("span", "", "JSON 内容快照"), el("em", "", "↓"));
      root.append(link);
    }
  } catch {
    root.innerHTML = "";
    root.append(el("p", "archive-empty", "归档索引将在第一次自动更新后出现。"));
  }
}

function renderSaved() {
  const list = $("#saved-list");
  const snapshots = JSON.parse(localStorage.getItem("dawn-brief-saved-items") || "{}");
  list.innerHTML = "";
  if (!state.saved.size) {
    list.append(el("p", "saved-empty", "还没有收藏。展开新闻或论文后点“收藏”即可。"));
    return;
  }
  for (const key of state.saved) {
    const item = snapshots[key];
    const entry = el("div", "saved-entry");
    const content = el("div");
    if (item?.url) {
      content.append(externalLink(item.title || key, item.url));
    } else {
      content.append(el("strong", "", item?.title || key));
    }
    content.append(el("small", "", item?.source || "已保存条目"));
    const remove = el("button", "saved-remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `移除 ${item?.title || "收藏"}`);
    remove.addEventListener("click", () => {
      state.saved.delete(key);
      updateSavedCount();
      renderSaved();
      renderNews();
      renderResearch(state.data);
    });
    entry.append(content, remove);
    list.append(entry);
  }
}

function setupEvents() {
  $("#news-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    $$(".filter-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    renderNews();
  });

  $("#news-search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderNews();
  });

  $("#theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("dawn-brief-theme", next);
  });

  $("#saved-toggle").addEventListener("click", () => {
    renderSaved();
    $("#saved-dialog").showModal();
  });
  $("#saved-close").addEventListener("click", () => $("#saved-dialog").close());
  $("#saved-dialog").addEventListener("click", (event) => {
    if (event.target === $("#saved-dialog")) $("#saved-dialog").close();
  });
  $("#saved-clear").addEventListener("click", () => {
    state.saved.clear();
    localStorage.removeItem("dawn-brief-saved-items");
    updateSavedCount();
    renderSaved();
    toast("已清空稍后阅读");
  });
}

function setupReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  $$(".reveal").forEach((node) => observer.observe(node));
}

function setNextUpdate() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const label = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(next);
  $("#next-update").textContent = label.replace("/", ".");
}

function showFatalError(error) {
  console.error(error);
  $("#generated-label").textContent = "数据读取失败";
  $("#live-dot").style.background = "var(--accent)";
  $("#notice-panel").hidden = false;
  $("#notice-summary").textContent = "数据读取失败 · 查看说明";
  $("#notice-list").innerHTML = "";
  $("#notice-list").append(
    el("p", "status-note", "今日简报数据暂时无法读取。页面结构仍可浏览；请稍后刷新或查看 GitHub Actions 运行记录。")
  );
  $("#news-grid").innerHTML = "";
  $("#news-grid").append(el("div", "loading-card", "未能加载 data/latest.json"));
  $("#research-list").innerHTML = "";
  $("#research-list").append(el("div", "loading-card", "未能读取 PubMed 数据"));
}

async function init() {
  const preferredTheme = localStorage.getItem("dawn-brief-theme");
  document.documentElement.dataset.theme =
    preferredTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  updateSavedCount();
  setupEvents();
  setupReveal();
  setNextUpdate();

  try {
    const response = await fetch("./data/latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    renderHeader(state.data);
    renderOverview(state.data);
    renderStats(state.data);
    renderNews();
    renderMedtech(state.data);
    renderResearch(state.data);
    renderArchive();
  } catch (error) {
    showFatalError(error);
  }
}

init();
