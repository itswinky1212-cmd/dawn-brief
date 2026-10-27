import fs from "node:fs/promises";

const data = JSON.parse(await fs.readFile(new URL("../data/latest.json", import.meta.url), "utf8"));
const required = ["briefingDate", "generatedAt", "overview", "news", "medtech", "research", "methodology"];
for (const field of required) {
  if (!(field in data)) throw new Error(`Missing required field: ${field}`);
}
if (!Array.isArray(data.news) || !Array.isArray(data.medtech) || !Array.isArray(data.research)) {
  throw new Error("Content collections must be arrays");
}
for (const item of [...data.news, ...data.medtech, ...data.research]) {
  if (!item.url || !/^https?:\/\//.test(item.url)) throw new Error(`Invalid item URL: ${item.title}`);
}
console.log(
  `Data OK: ${data.news.length} news, ${data.medtech.length} medtech, ${data.research.length} research items.`
);
