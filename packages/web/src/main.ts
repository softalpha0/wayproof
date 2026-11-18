// Starts the Wayproof web app on this computer: pnpm web  (then open the address it prints, e.g. http://127.0.0.1:4310)
// Settings (environment or .env):
//   PORT (4310; moves to the next free port if taken) · HOST (127.0.0.1 — only this computer; set 0.0.0.0 on a server)
//   ANTHROPIC_API_KEY, ANTHROPIC_MODEL (required) · Kane must be logged in on this machine
//   WAYPROOF_CREDIT_BUDGET (300 per check)
//   WAYPROOF_ACCESS_CODE_HASHES (comma-separated sha256 of access codes; make one with: pnpm web:hash-code <code>)
//   WAYPROOF_VISITOR_DAILY_RUNS (2) · WAYPROOF_VISITOR_DAILY_PREPARES (10)

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnthropicLlm, checkGuide, DEFAULT_CREDIT_BUDGET, formatEvent, prepareGuide, RunStore } from "@wayproof/engine";
import { createApp } from "./app.ts";
import { PUBLISHED } from "./pages.ts";
import { hashCode, RunManager } from "./runs.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

if (process.argv[2] === "hash-code") {
  const code = process.argv[3];
  if (!code) {
    console.error("Usage: pnpm web:hash-code <code>");
    process.exit(2);
  }
  console.log(hashCode(code));
  process.exit(0);
}

if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));
const model = process.env["ANTHROPIC_MODEL"];
if (!process.env["ANTHROPIC_API_KEY"] || !model) {
  console.error("✖ ERR-CONFIG  ANTHROPIC_API_KEY and ANTHROPIC_MODEL must be set (copy .env.example to .env). Run: pnpm wayproof doctor");
  process.exit(2);
}
const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const llm = new AnthropicLlm({ model });
const store = new RunStore(join(ROOT, ".wayproof", "runs"));
const runs = new RunManager({
  store,
  runGuide: (options, onEvent) => checkGuide(options, { llm, store, onEvent }),
  formatEvent,
  creditBudget: num("WAYPROOF_CREDIT_BUDGET", DEFAULT_CREDIT_BUDGET),
  accessCodeHashes: (process.env["WAYPROOF_ACCESS_CODE_HASHES"] ?? "").split(",").map((h) => h.trim().toLowerCase()).filter((h) => /^[0-9a-f]{64}$/.test(h)),
  visitorDailyRuns: num("WAYPROOF_VISITOR_DAILY_RUNS", 2),
  visitorDailyPrepares: num("WAYPROOF_VISITOR_DAILY_PREPARES", 10),
});

let published: { label: string; url: string }[] = [];
try {
  const site = JSON.parse(readFileSync(join(ROOT, "publish", "site.json"), "utf8")) as { reports: { slug: string; label: string }[] };
  published = site.reports.map((r) => ({ label: r.label, url: `${PUBLISHED}reports/${r.slug}/report.html` }));
} catch {
  // no published list — the home page still links the published site
}

const app = createApp({
  store,
  runs,
  llm,
  prepare: (guideUrl, allowed) => prepareGuide(guideUrl, allowed, { llm }),
  published,
});

/** True if some other program already answers on this port (either address form: 127.0.0.1 or ::1). */
function portBusy(p: number): Promise<boolean> {
  const probe = (address: string) =>
    new Promise<boolean>((done) => {
      const socket = connect({ host: address, port: p });
      socket.setTimeout(500);
      socket.once("connect", () => (socket.destroy(), done(true)));
      socket.once("timeout", () => (socket.destroy(), done(false)));
      socket.once("error", () => done(false));
    });
  return Promise.all([probe("127.0.0.1"), probe("::1")]).then(([a, b]) => a || b);
}

// 4310 by default: 3000 is used by many dev servers (on 18 Nov another project on 3000 answered
// "localhost:3000" in the browser instead of Wayproof). If the port is taken, move to the next free one.
const wanted = num("PORT", 4310);
let port = wanted;
while (await portBusy(port)) port++;
const host = process.env["HOST"] ?? "127.0.0.1";
createServer((req, res) => void app(req, res)).listen(port, host, () => {
  if (port !== wanted) console.log(`Port ${wanted} is already used by another program, so Wayproof uses ${port}.`);
  console.log(`Wayproof web app: http://127.0.0.1:${port}   ← open this address`);
  console.log(runs.codeRequired() ? "Live checks need an access code." : `No access codes set: ${runs.options.visitorDailyRuns} live check(s) per visitor per day.`);
});
