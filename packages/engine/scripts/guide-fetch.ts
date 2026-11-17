// Hand-testing helper for the guide fetcher (C-8). Free: it only downloads the page (no Kane, no Claude).
// Usage (from the repo root):
//   pnpm --filter @wayproof/engine guide:fetch <guide-url> [--allow domain1,domain2]
// Without --allow, the allowed sites list is the guide's own site.

import { fetchGuide } from "../src/fetch/guide.ts";

const argv = process.argv.slice(2);
const allowIndex = argv.indexOf("--allow");
const url = argv.find((a, i) => !a.startsWith("--") && !(allowIndex !== -1 && i === allowIndex + 1));
if (!url) {
  console.error("Usage: pnpm --filter @wayproof/engine guide:fetch <guide-url> [--allow domain1,domain2]");
  process.exit(2);
}
let allowed: string[] = [];
if (allowIndex !== -1) allowed = (argv[allowIndex + 1] ?? "").split(",").map((d) => d.trim());
else {
  try {
    allowed = [new URL(url).hostname];
  } catch {
    allowed = [];
  }
}

const r = await fetchGuide(url, { allowedDomains: allowed });
if (!r.ok) {
  console.log(`✖ ${r.code}  ${r.why}`);
  process.exit(1);
}
const lines = r.text.split("\n");
console.log(`✔ Fetched via ${r.via}`);
console.log(`  From:   ${r.finalUrl}`);
console.log(`  Title:  ${r.title}`);
console.log(`  Text:   ${r.text.length} characters, ${lines.length} lines`);
console.log("  First lines:");
for (const l of lines.slice(0, 15)) console.log(`    ${l}`);
