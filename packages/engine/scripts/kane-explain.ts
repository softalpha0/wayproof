// Hand-testing helper: reads a saved Kane output file and says, in plain words, what the adapter makes of it.
// Usage (from the repo root):
//   pnpm --filter @wayproof/engine kane:explain <path-to.ndjson> [--exit <code>]
// The exit code is read from the matching .meta.json next to the file, unless --exit is given.
// It never starts Kane and never spends credits.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyKaneRun } from "../src/kane/outcome.ts";
import { parseKaneOutput } from "../src/kane/output.ts";

const PLAIN: Record<string, string> = {
  passed: "PASSED: Kane completed it. (The judge still has to confirm the expected result, BR-3.)",
  failed: "FAILED: goes to the judge, which decides: real guide problem, flaky, or a badly worded check.",
  blocked: "BLOCKED: the site stopped Kane (e.g. a bot check). Shown as \"Couldn't check\". Never a guide defect (BR-6).",
  error: "ERROR: Kane couldn't run properly. Shown as \"Couldn't check\" (ERR-KANE). Not a guide problem.",
  timeout: "TIMEOUT: ran out of time. Wayproof retries once, then ERR-KANE-TIMEOUT.",
  stopped_safely: "STOPPED SAFELY: a wallet prompt appeared, so Wayproof stopped Kane (ERR-BOUNDARY, BR-1).",
};

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: pnpm --filter @wayproof/engine kane:explain <path-to.ndjson> [--exit <code>]");
  process.exit(2);
}
// pnpm runs scripts inside packages/engine; INIT_CWD is the folder you ran the command from.
const path = resolve(process.env["INIT_CWD"] ?? process.cwd(), file);
if (!existsSync(path)) {
  console.error(`File not found: ${path}`);
  process.exit(2);
}

let exitCode: number | undefined;
const exitFlag = argv.indexOf("--exit");
if (exitFlag !== -1) {
  exitCode = Number(argv[exitFlag + 1]);
} else {
  const metaPath = path.replace(/\.ndjson$/, ".meta.json");
  if (existsSync(metaPath)) exitCode = (JSON.parse(readFileSync(metaPath, "utf8")) as { exit_code: number }).exit_code;
}
if (exitCode === undefined || Number.isNaN(exitCode)) {
  console.error("No exit code found. Add --exit <code> (0, 1, 2 or 3).");
  process.exit(2);
}

const output = parseKaneOutput(readFileSync(path, "utf8"));
const outcome = classifyKaneRun({ exitCode, output });
const end = output.runEnd;

console.log(`File:            ${path}`);
console.log(`Kane exit code:  ${exitCode}`);
console.log(
  `Kane's run_end:  ${end ? `status=${end.status}, reason=${JSON.stringify(end.reason ?? "")}, reason_code=${end.reason_code ?? "-"}` : "(none)"}`,
);
console.log("");
console.log(`Outcome:         ${outcome.kind.toUpperCase()}`);
console.log(`Why:             ${outcome.why}`);
console.log(`Meaning:         ${PLAIN[outcome.kind]}`);
console.log("");
console.log("Steps Kane reported:");
for (const p of output.progress.filter((p) => p.status !== "running")) {
  console.log(`  ${p.status === "failed" ? "✖" : "✔"} ${p.remark ?? ""}`);
}
if (end?.summary) {
  console.log("");
  console.log("Kane's summary:");
  for (const l of end.summary.split("\n")) console.log(`  ${l}`);
}
console.log("");
console.log(`Credits (Kane's figure): ${end?.credits_consumed ?? "-"}`);
console.log(`Evidence pack:           ${output.evidencePath ?? "-"}`);
console.log(`Unreadable lines:        ${output.badLines}`);
