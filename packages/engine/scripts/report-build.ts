// Rebuilds a Proof Report from a saved run.json (FR-63 idea), with no network calls and no credits.
// Usage (from the repo root):
//   pnpm --filter @wayproof/engine report:build <run-folder | path/to/run.json> [--out <folder>]
// Writes report.html and report.md into the run folder (or --out).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildReport } from "../src/report/build.ts";
import type { RunRecord } from "../src/loop/record.ts";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const target = argv.find((a, i) => !a.startsWith("--") && !(outIndex !== -1 && i === outIndex + 1));
if (!target) {
  console.error("Usage: pnpm --filter @wayproof/engine report:build <run-folder | run.json> [--out <folder>]");
  process.exit(2);
}
const base = process.env["INIT_CWD"] ?? process.cwd();
let path = resolve(base, target);
if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "run.json");
if (!existsSync(path)) {
  console.error(`Not found: ${path}`);
  process.exit(2);
}
const run = JSON.parse(readFileSync(path, "utf8")) as RunRecord;
const out = outIndex !== -1 ? resolve(base, argv[outIndex + 1] ?? ".") : dirname(path);
mkdirSync(out, { recursive: true });
const { html, markdown } = buildReport(run);
const name = basename(path) === "run.json" ? "report" : basename(path).replace(/\.json$/, "");
writeFileSync(join(out, `${name}.html`), html);
writeFileSync(join(out, `${name}.md`), markdown);
console.log(`✔ Report written: ${join(out, `${name}.html`)}`);
console.log(`  and:            ${join(out, `${name}.md`)}`);
