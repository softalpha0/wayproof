// One-off LIVE check of the Claude adapter (owner-approved 17 Nov 2026, about $0.30–0.50).
// Calls the real Claude (ANTHROPIC_MODEL from .env) for: extract on the two approved guides,
// plan for the first Revoke.cash steps, and judge on two real Kane runs.
// Saves Claude's replies to fixtures/claude/ (the guide pages' own text is NOT saved).
// Run from the repo root:  pnpm --filter @wayproof/engine claude:live-check

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnthropicLlm } from "../src/claude/anthropic.ts";
import { extractSteps, judgeRun, planObjective, type GuideStep } from "../src/claude/prompts.ts";
import { parseKaneOutput } from "../src/kane/output.ts";
import { checkUrl } from "../src/safety/domains.ts";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const model = process.env["ANTHROPIC_MODEL"] ?? "";
if (!process.env["ANTHROPIC_API_KEY"]) throw new Error("ANTHROPIC_API_KEY is not set (.env).");
const llm = new AnthropicLlm({ model });
const OUT = join(ROOT, "fixtures", "claude");
mkdirSync(OUT, { recursive: true });

const GUIDES = [
  { id: "revoke", url: "https://revoke.cash/learn/approvals/how-to-revoke-token-approvals", allowed: ["revoke.cash"] },
  {
    id: "uniswap-bridge",
    url: "https://support.uniswap.org/hc/en-us/articles/31092864580877-How-to-bridge-tokens-using-the-Uniswap-web-app",
    allowed: ["support.uniswap.org"],
  },
];

let inTok = 0;
let outTok = 0;
function save(name: string, data: unknown): void {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ recorded: new Date().toISOString(), requestedModel: model, ...(data as object) }, null, 2) + "\n");
}
function tally(r: { usage: { inputTokens: number; outputTokens: number } } | { ok: false; code: string }): void {
  if ("usage" in r) {
    inTok += r.usage.inputTokens;
    outTok += r.usage.outputTokens;
  }
}

// Crude main-text extraction, only for this check (the real fetcher, C-8, comes later).
// Wayproof identifies itself honestly; it never pretends to be a browser to get past a site's defences.
// Zendesk help-centre pages (like Uniswap's) refuse non-browser visitors, so their official public
// article API is used instead: /hc/<locale>/articles/<id> → /api/v2/help_center/<locale>/articles/<id>.json
const USER_AGENT = "Wayproof/0.1 (+https://github.com/softalpha0/wayproof)";
async function pageText(url: string, allowed: string[]): Promise<string> {
  const gate = checkUrl(url, allowed);
  if (!gate.ok) throw new Error(gate.why);
  const zendesk = url.match(/^(https:\/\/[^/]+)\/hc\/([a-z-]+)\/articles\/(\d+)/i);
  const fetchUrl = zendesk ? `${zendesk[1]}/api/v2/help_center/${zendesk[2]}/articles/${zendesk[3]}.json` : url;
  const res = await fetch(fetchUrl, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Fetch ${fetchUrl} → HTTP ${res.status}`);
  let html: string;
  if (zendesk) {
    const json = (await res.json()) as { article?: { title?: string; body?: string } };
    html = `<h1>${json.article?.title ?? ""}</h1>${json.article?.body ?? ""}`;
  } else {
    html = await res.text();
  }
  const body = html.match(/class="article-body[^"]*"[^>]*>([\s\S]*?)Was this article helpful/i) ?? html.match(/<main[\s\S]*?<\/main>/i) ?? html.match(/<article[\s\S]*?<\/article>/i);
  if (body) html = body[0];
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/h\d|\/li|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 30000);
}

const extracted: Record<string, GuideStep[]> = {};
for (const g of GUIDES) {
  // Reuse a reply already recorded (and paid for) instead of asking Claude again.
  const saved = join(OUT, `extract-${g.id}.json`);
  if (existsSync(saved)) {
    const prev = JSON.parse(readFileSync(saved, "utf8")) as { result: { ok: boolean; value?: { steps: GuideStep[] } } };
    if (prev.result.ok && prev.result.value) {
      extracted[g.id] = prev.result.value.steps;
      console.log(`\n=== extract: ${g.id} — reusing the reply saved earlier (${prev.result.value.steps.length} steps, no new cost) ===`);
      continue;
    }
  }
  const text = await pageText(g.url, g.allowed);
  console.log(`\n=== extract: ${g.id} (${text.length} characters of page text) ===`);
  const r = await extractSteps(llm, { guideUrl: g.url, pageText: text });
  tally(r);
  save(`extract-${g.id}`, { prompt: "extract", guideUrl: g.url, result: r });
  if (r.ok) {
    extracted[g.id] = r.value.steps;
    console.log(`model ${r.model}${r.fallbackUsed ? " (FALLBACK)" : ""}, attempts ${r.attempts}, title: ${r.value.title}`);
    for (const s of r.value.steps) console.log(`  ${s.n}. ${s.needsWallet ? "[wallet] " : ""}${s.action}  →  ${s.expected}${s.url ? `  (${s.url})` : ""}`);
  } else console.log(`FAILED: ${r.code} — ${r.why}`);
}

console.log("\n=== plan: first non-wallet Revoke.cash steps ===");
const revokeSteps = (extracted["revoke"] ?? []).filter((s) => !s.needsWallet).slice(0, 3);
if (revokeSteps.length > 0) {
  const r = await planObjective(llm, { steps: revokeSteps, allowedDomains: ["revoke.cash"], startUrlHint: "https://revoke.cash" });
  tally(r);
  save("plan-revoke", { prompt: "plan", steps: revokeSteps, result: r });
  if (r.ok) console.log(`model ${r.model}, attempts ${r.attempts}\n  url: ${r.value.url}\n  objective: ${r.value.objective}\n  expected (copied by code): ${r.value.expected}`);
  else console.log(`FAILED: ${r.code} — ${r.why}`);
} else console.log("skipped: no non-wallet steps extracted");

for (const [fixture, kaneOutcome, expected] of [
  ["uniswap-bridge-assertion-too-strict", "failed", "The page shows an amount of ETH to receive on Base."],
  ["revoke-lookup-pass", "passed", "A list of token approvals is shown."],
] as const) {
  console.log(`\n=== judge: ${fixture} ===`);
  const out = parseKaneOutput(readFileSync(join(ROOT, "fixtures", "kane", `${fixture}.ndjson`), "utf8"));
  const meta = JSON.parse(readFileSync(join(ROOT, "fixtures", "kane", `${fixture}.meta.json`), "utf8")) as { objective: string };
  const r = await judgeRun(llm, {
    objective: meta.objective,
    expected,
    kaneOutcome,
    summary: out.runEnd?.summary ?? "",
    finalState: out.runEnd?.final_state,
    reason: out.runEnd?.reason,
    failingRemark: out.progress.find((p) => p.status === "failed")?.remark,
  });
  tally(r);
  save(`judge-${fixture}`, { prompt: "judge", fixture, kaneOutcome, expected, result: r });
  if (r.ok) console.log(`model ${r.model}, attempts ${r.attempts}\n  outcome: ${r.value.outcome}\n  reason: ${r.value.reason}\n  quote: "${r.value.quote}"`);
  else console.log(`FAILED: ${r.code} — ${r.why}`);
}

console.log(`\nTokens: ${inTok} in, ${outTok} out — about $${((inTok * 4 + outTok * 20) / 1e6).toFixed(3)} at Opus 5.5 prices ($4 / $20 per million).`);
console.log(`Saved Claude's replies in ${OUT}`);
