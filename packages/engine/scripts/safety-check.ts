// Hand-testing helper for the safety gate (C-6). Never starts Kane, never spends credits.
// Usage (from the repo root):
//   pnpm --filter @wayproof/engine safety:check "<objective>" <start-url> [--allow domain1,domain2]
// Without --allow, the allowed sites list is just the start URL's own site.

import { gateBeforeRun } from "../src/safety/gate.ts";
import { SAFETY_SENTENCE } from "../src/safety/wallet.ts";

const argv = process.argv.slice(2);
const allowIndex = argv.indexOf("--allow");
const allowArg = allowIndex === -1 ? undefined : argv[allowIndex + 1];
const positional = argv.filter((a, i) => !a.startsWith("--") && !(allowIndex !== -1 && i === allowIndex + 1));
const [objective, url] = positional;

if (!objective || !url) {
  console.error('Usage: pnpm --filter @wayproof/engine safety:check "<objective>" <start-url> [--allow domain1,domain2]');
  console.error(`Tip: a safe objective must contain: ${SAFETY_SENTENCE}`);
  process.exit(2);
}

let allowedDomains: string[];
if (allowArg) {
  allowedDomains = allowArg.split(",").map((d) => d.trim());
} else {
  try {
    allowedDomains = [new URL(url).hostname];
  } catch {
    allowedDomains = [];
  }
}

const decision = gateBeforeRun({ objective, url, allowedDomains });
console.log(`Objective:      ${objective}`);
console.log(`Start URL:      ${url}`);
console.log(`Allowed sites:  ${allowedDomains.join(", ") || "(none)"}`);
console.log("");
if (decision.allowed) {
  console.log("Result:         ALLOWED — Kane may run this.");
} else {
  console.log("Result:         BLOCKED — Kane will not be started.");
  console.log(`Verdict:        ${decision.verdict}${decision.code ? ` (${decision.code})` : ""}`);
  console.log(`Why:            ${decision.why}`);
}
