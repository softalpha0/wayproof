// FR-65 self-verification: Kane checks a page that Wayproof itself made, in a real browser.
// Uses the same adapter and safety gate as every other Kane run. Spends Kane credits (one run).
// Usage (from the repo root):
//   pnpm --filter @wayproof/engine self:check <https-url> "<what the page must show>" <name>
// Saves the cleaned Kane output and a summary to verification/kane/<name>.*

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runKane } from "../src/kane/run.ts";
import { gateBeforeRun } from "../src/safety/gate.ts";
import { SAFETY_SENTENCE } from "../src/safety/wallet.ts";
import { cleanText } from "../src/site/publish.ts";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const [url, mustShow, name] = process.argv.slice(2);
if (!url || !mustShow || !name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: pnpm --filter @wayproof/engine self:check <https-url> "<what the page must show>" <name-with-dashes>');
  process.exit(2);
}

const objective = `${SAFETY_SENTENCE} Open the page and wait for it to load. Do not click any links. Assert that ${mustShow}`;
const allowed = [new URL(url).hostname];
const gate = gateBeforeRun({ objective, url, allowedDomains: allowed });
if (!gate.allowed) {
  console.error(`✖ Safety gate refused: ${gate.why}`);
  process.exit(2);
}

const outDir = join(ROOT, "verification", "kane");
mkdirSync(outDir, { recursive: true });
const tmpLog = join(ROOT, ".wayproof", "self-check", `${name}.ndjson`);
console.log(`Kane is checking ${url} …`);
const r = await runKane({ objective, url, timeoutSeconds: 240, maxSteps: 15 }, { wallClockMs: 300_000, rawLogPath: tmpLog });

writeFileSync(join(outDir, `${name}.ndjson`), cleanText(readFileSync(tmpLog, "utf8")).replace(/https:\/\/test-manager\.lambdatest\.com\/[^"\s]*/g, (m) => m));
const end = r.output.runEnd;
const summary = {
  checked: new Date().toISOString(),
  url,
  objective,
  kaneExitCode: r.exitCode,
  outcome: r.outcome.kind,
  why: r.outcome.why,
  kaneSummary: end?.summary,
  finalState: end?.final_state,
  credits: r.creditsConsumed,
  testUrl: end?.test_url,
  kaneSteps: r.output.progress.filter((p) => p.status !== "running").map((p) => `${p.status === "failed" ? "✖" : "✔"} ${p.remark ?? ""}`),
};
writeFileSync(join(outDir, `${name}.json`), cleanText(JSON.stringify(summary, null, 2)) + "\n");

console.log(`${r.outcome.kind === "passed" ? "✔" : "✖"} ${r.outcome.kind.toUpperCase()} — ${r.outcome.why}`);
if (end?.summary) console.log(`Kane: ${end.summary}`);
console.log(`Saved: verification/kane/${name}.json and .ndjson · credits ${r.creditsConsumed ?? "?"}`);
process.exitCode = r.outcome.kind === "passed" ? 0 : 1;
