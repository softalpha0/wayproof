// Hand-testing helper: asks the REAL Claude judge (FR-22) about a saved Kane run.
// Costs about one US cent per run (Claude only; no Kane credits). Uses ANTHROPIC_API_KEY / ANTHROPIC_MODEL from .env.
// Usage (from the repo root):
//   pnpm --filter @wayproof/engine claude:judge <path-to.ndjson> "<expected result>"

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnthropicLlm } from "../src/claude/anthropic.ts";
import { judgeRun } from "../src/claude/prompts.ts";
import { classifyKaneRun } from "../src/kane/outcome.ts";
import { parseKaneOutput } from "../src/kane/output.ts";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

const [file, expected] = process.argv.slice(2);
if (!file || !expected) {
  console.error('Usage: pnpm --filter @wayproof/engine claude:judge <path-to.ndjson> "<expected result>"');
  process.exit(2);
}
const path = resolve(process.env["INIT_CWD"] ?? process.cwd(), file);
const metaPath = path.replace(/\.ndjson$/, ".meta.json");
if (!existsSync(path) || !existsSync(metaPath)) {
  console.error(`Need both ${path} and its .meta.json`);
  process.exit(2);
}
const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { objective: string; exit_code: number };
const output = parseKaneOutput(readFileSync(path, "utf8"));
const kane = classifyKaneRun({ exitCode: meta.exit_code, output });

console.log(`Kane outcome: ${kane.kind.toUpperCase()} — ${kane.why}`);
if (kane.kind !== "passed" && kane.kind !== "failed") {
  console.log("This run never reaches the judge: it is shown as \"Couldn't check\" (BR-6). No Claude call made.");
  process.exit(0);
}

const r = await judgeRun(new AnthropicLlm({ model: process.env["ANTHROPIC_MODEL"] ?? "" }), {
  objective: meta.objective,
  expected,
  kaneOutcome: kane.kind,
  summary: output.runEnd?.summary ?? "",
  finalState: output.runEnd?.final_state,
  reason: output.runEnd?.reason,
  failingRemark: output.progress.find((p) => p.status === "failed")?.remark,
});

if (!r.ok) {
  console.log(`Judge: ${r.code} — ${r.why}`);
  process.exit(1);
}
console.log(`Judge (${r.model}${r.fallbackUsed ? ", fallback model" : ""}, ${r.attempts} attempt${r.attempts > 1 ? "s" : ""}):`);
console.log(`  outcome: ${r.value.outcome}`);
console.log(`  reason:  ${r.value.reason}`);
console.log(`  quote:   "${r.value.quote}"  (checked: really in Kane's output)`);
console.log(`  cost:    about $${((r.usage.inputTokens * 4 + r.usage.outputTokens * 20) / 1e6).toFixed(4)}`);
