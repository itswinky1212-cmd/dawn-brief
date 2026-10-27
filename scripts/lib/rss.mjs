import { decodeEntities, firstElement, stripTags, truncate } from "./text.mjs";

function extractLink(block) {
  const plain = firstElement(block, "link");
  if (plain) return plain;

  const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return decodeEntities(atom[1]);

  const guid = firstElement(block, "guid");
  return /^https?:\/\//.test(guid) ? guid : "";
}

function extractDate(block) {
  const value =
    firstElement(block, "pubDate") ||
    firstElement(block, "published") ||
    firstElement(block, "updated") ||
    firstElement(block, "dc:date");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function parseFeed(xml, source) {
  const isAtom = /<feed[\s>]/i.test(xml);
  const entryPattern = isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi;
  const blocks = [...xml.matchAll(entryPattern)].map((match) => match[0]);

  return blocks
    .map((block) => {
      const title = stripTags(firstElement(block, "title"));
      const description =
        firstElement(block, "description") ||
        firstElement(block, "summary") ||
        firstElement(block, "content");
      const url = extractLink(block);

      return {
        id: "",
        title,
        description: truncate(description, 900),
        url,
        publishedAt: extractDate(block),
        source: source.name,
        sourceId: source.id,
        category: source.category,
        sourceWeight: source.weight ?? 1
      };
    })
    .filter((item) => item.title && /^https?:\/\//.test(item.url));
}

export async function fetchFeed(source, timeoutMs = 18_000) {
  const response = await fetch(source.url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      "User-Agent": "DawnBriefBot/1.0 (+GitHub Pages daily briefing)"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`${source.name}: HTTP ${response.status}`);
  }

  const xml = await response.text();
  return parseFeed(xml, source);
}
