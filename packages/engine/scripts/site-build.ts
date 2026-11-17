// Builds the judges' website into site/ from the runs listed in publish/site.json (F-7, FR-65).
// Public copies only: no evidence packs, cleaned raw output, then a privacy scan of EVERY file.
// If anything personal is found, it stops and publishes nothing.
// Extra private words to scan for (e.g. account names) come from the WAYPROOF_PRIVATE_TERMS
// environment variable (comma-separated) so they are never written into the repo.
// Usage (from the repo root):  pnpm --filter @wayproof/engine site:build

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "../src/report/build.ts";
import type { RunRecord } from "../src/loop/record.ts";
import { buildIndexHtml, cleanText, findPersonal, type SiteEntry } from "../src/site/publish.ts";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const REPO_URL = "https://github.com/softalpha0/wayproof";
const config = JSON.parse(readFileSync(join(ROOT, "publish", "site.json"), "utf8")) as {
  reports: { slug: string; group: string; label: string; run: string; note?: string }[];
};
const privateTerms = (process.env["WAYPROOF_PRIVATE_TERMS"] ?? "").split(",").map((t) => t.trim()).filter(Boolean);

const SITE = join(ROOT, "site");
if (existsSync(SITE)) rmSync(SITE, { recursive: true });
mkdirSync(join(SITE, "reports"), { recursive: true });

const entries: SiteEntry[] = [];
for (const r of config.reports) {
  if (!/^[a-z0-9-]+$/.test(r.slug)) throw new Error(`Bad slug: ${r.slug}`);
  const runDir = join(ROOT, r.run);
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")) as RunRecord;
  const out = join(SITE, "reports", r.slug);
  mkdirSync(join(out, "kane"), { recursive: true });

  const { html, markdown } = buildReport(run, { publicCopy: true, ...(r.note ? { note: r.note } : {}) });
  writeFileSync(join(out, "report.html"), cleanText(html));
  writeFileSync(join(out, "report.md"), cleanText(markdown));
  writeFileSync(join(out, "run.json"), cleanText(JSON.stringify(run, null, 2)) + "\n");
  for (const f of readdirSync(join(runDir, "kane")).filter((f) => f.endsWith(".ndjson"))) {
    writeFileSync(join(out, "kane", f), cleanText(readFileSync(join(runDir, "kane", f), "utf8")));
  }
  entries.push({ slug: r.slug, group: r.group, label: r.label, run, ...(r.note ? { note: r.note } : {}) });
}
writeFileSync(join(SITE, "index.html"), buildIndexHtml(entries, REPO_URL));
writeFileSync(join(SITE, ".nojekyll"), "");

// Privacy scan of every file that would be published (BR-7).
const problems: string[] = [];
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
const files = walk(SITE);
for (const file of files) {
  if (file.endsWith(".evidence")) problems.push(`${file}: evidence packs must never be published`);
  const hits = findPersonal(readFileSync(file, "utf8"), privateTerms);
  if (hits.length) problems.push(`${file.slice(SITE.length + 1)}: ${[...new Set(hits)].length} personal item(s) found`);
}

if (problems.length) {
  rmSync(SITE, { recursive: true });
  console.error("✖ Privacy scan failed — nothing was kept:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✔ site/ built: ${entries.length} reports, ${files.length} files. Privacy scan: clean (home paths, emails${privateTerms.length ? `, ${privateTerms.length} private term(s)` : ""}).`);
for (const e of entries) console.log(`  reports/${e.slug}/report.html  — ${e.label}`);
