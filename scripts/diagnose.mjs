import config from "../config/sources.json" with { type: "json" };
import { fetchFeed } from "./lib/rss.mjs";
import { fetchPsychiatryResearch } from "./lib/pubmed.mjs";

console.log(`Node ${process.version}`);
console.log(`Timezone target: ${config.timezone}`);
console.log("");

const sources = [...config.news, ...config.medtech];
const checks = await Promise.all(
  sources.map(async (source) => {
    try {
      const items = await fetchFeed(source);
      return { source: source.name, ok: true, count: items.length };
    } catch (error) {
      return { source: source.name, ok: false, error: error.cause?.code || error.message };
    }
  })
);

for (const check of checks) {
  console.log(
    check.ok
      ? `[OK] ${check.source}: ${check.count} items`
      : `[FAIL] ${check.source}: ${check.error}`
  );
}

let research = [];
try {
  research = await fetchPsychiatryResearch(config.psychiatryJournals);
  console.log(`[OK] PubMed psychiatry pool: ${research.length} articles`);
} catch (error) {
  console.log(`[FAIL] PubMed psychiatry pool: ${error.cause?.code || error.message}`);
}

console.log("");
console.log("Analysis configuration");
console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "present" : "absent"}`);
console.log(`- OPENAI_MODEL: ${process.env.OPENAI_MODEL || "gpt-4.1-mini (default)"}`);
console.log(
  `- GitHub Models token: ${
    process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN ? "present" : "absent"
  }`
);
console.log(`- GITHUB_MODEL: ${process.env.GITHUB_MODEL || "openai/gpt-4.1-mini (default)"}`);
console.log("");

const healthy = checks.filter((check) => check.ok).length;
if (healthy === 0 && research.length === 0) {
  console.log("No live source was reachable. On a local network, check the VPN/proxy and run again.");
  console.log("In GitHub Actions, open the failed step log and verify outbound network access.");
} else {
  console.log("Source check finished. Run `node scripts/fetch-briefing.mjs` to regenerate the page.");
}
