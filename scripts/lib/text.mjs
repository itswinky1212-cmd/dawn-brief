const namedEntities = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  lt: "<",
  nbsp: " ",
  quot: "\"",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—"
};

export function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name.toLowerCase()] ?? match);
}

export function stripTags(value = "") {
  const decoded = decodeEntities(String(value).replace(/<[^>]*>/g, " "));
  return decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value = "", max = 260) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function firstElement(block = "", tagName = "") {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, "i");
  const match = block.match(pattern);
  return match ? stripTags(match[1]) : "";
}

export function allElements(block = "", tagName = "") {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, "gi");
  return [...block.matchAll(pattern)].map((match) => stripTags(match[1]));
}

export function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizedTitle(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\b(live|breaking|update|latest|exclusive)\b/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
