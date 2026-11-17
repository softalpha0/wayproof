// Report builder (C-9): turns run.json into the Proof Report (FR-50, FR-51, FR-53, FR-54).
// - report.html: ONE self-contained file (no scripts, no external fonts or images) that works offline,
//   laid out after docs/03 S-04 (report), S-05 (check detail, as expandable sections) and S-06 (corrected guide).
// - report.md: the same facts in Markdown, including the corrected guide.
// Every piece of text that came from a website, Kane or Claude is escaped (it is untrusted).
// Rules: dated (BR-12) · every verdict links to Kane evidence (BR-8) · no personal data or keys (BR-7)
// · never claims a guide is "safe" (docs/03 §8) · status never by colour alone (NFR-5).

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { explainScore, score } from "../domain/score.ts";
import { VERDICT_INFO, VERDICTS, type Verdict } from "../domain/verdict.ts";
import type { AttemptRecord, CheckRecord, RunRecord, RunStore } from "../loop/record.ts";

const REPO_URL = "https://github.com/softalpha0/wayproof";

/** Problems first (S-04), then proven fixes, passes, and steps that were not checked. */
const ORDER: Verdict[] = [
  "needs_human",
  "couldnt_check",
  "not_run_budget",
  "stopped_by_user",
  "verified_fixed",
  "passed",
  "not_checked_wallet",
  "not_checked_outside_domains",
];

const COLOUR: Record<Verdict, string> = {
  passed: "ok",
  verified_fixed: "fixed",
  needs_human: "bad",
  couldnt_check: "warn",
  not_checked_wallet: "muted",
  not_checked_outside_domains: "muted",
  not_run_budget: "muted",
  stopped_by_user: "muted",
};

const ATTEMPT_LABEL: Record<AttemptRecord["kind"], string> = {
  original: "Original guide wording",
  flaky_rerun: "Same check, run again (unstable result)",
  check_rewrite: "Check reworded (guide wording unchanged)",
  after_fix: "Proposed fix, proven by Kane",
  timeout_retry: "Retry with more time",
};

export interface BuiltReport {
  html: string;
  markdown: string;
}

export async function writeReport(store: RunStore, run: RunRecord): Promise<{ htmlPath: string; markdownPath: string }> {
  const { html, markdown } = buildReport(run);
  const dir = store.dir(run.id);
  await mkdir(dir, { recursive: true });
  const htmlPath = join(dir, "report.html");
  const markdownPath = join(dir, "report.md");
  await writeFile(htmlPath, html);
  await writeFile(markdownPath, markdown);
  return { htmlPath, markdownPath };
}

export interface ReportOptions {
  /**
   * Public copy (published website): Kane's sealed evidence packs are NOT linked, because they contain
   * the Kane account's email, username and ids [Observed 17 Nov 2026] (BR-7). Raw output and TestMu links stay.
   */
  publicCopy?: boolean;
  /** Plain-text note shown at the top (e.g. why an earlier run differs). */
  note?: string;
}

export function buildReport(run: RunRecord, options: ReportOptions = {}): BuiltReport {
  return { html: buildHtml(run, options), markdown: buildMarkdown(run, options) };
}

// ---------------------------------------------------------------------------
// shared helpers

export function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Only http(s) links are ever put in an href; anything else becomes plain text. */
function safeHref(url: string | undefined): string | undefined {
  if (!url || url.includes("<redacted")) return undefined; // cleaned fixtures replace share links with a placeholder
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function link(url: string | undefined, label: string): string {
  const href = safeHref(url);
  return href ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label);
}

/** Relative evidence path inside the run folder (never absolute, never leaving the folder). */
function localHref(path: string | undefined): string | undefined {
  if (!path || path.includes("..") || /^[a-z]:|^\//i.test(path)) return undefined;
  return path.split("/").map(encodeURIComponent).join("/");
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `${date}, ${time} (UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""})`;
}

function duration(run: RunRecord): string {
  if (!run.finishedAt) return "—";
  const s = Math.max(0, Math.round((new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime()) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function stepLabel(check: CheckRecord): string {
  const n = check.stepNumbers;
  if (n.length === 0) return "Step";
  return n.length === 1 ? `Step ${n[0]}` : `Steps ${n[0]}–${n[n.length - 1]}`;
}

function sortedChecks(run: RunRecord): CheckRecord[] {
  const rank = (c: CheckRecord) => (c.verdict ? ORDER.indexOf(c.verdict) : ORDER.length);
  return [...run.checks].sort((a, b) => rank(a) - rank(b) || (a.stepNumbers[0] ?? 0) - (b.stepNumbers[0] ?? 0));
}

function counts(run: RunRecord): Map<Verdict, number> {
  const m = new Map<Verdict, number>();
  for (const c of run.checks) if (c.verdict) m.set(c.verdict, (m.get(c.verdict) ?? 0) + 1);
  return m;
}

function headline(run: RunRecord): string {
  if (run.status === "failed") return `This guide could not be checked: ${run.error?.code ?? "error"} — ${run.error?.why ?? ""}`;
  if (run.status === "running") return "This check was interrupted before it finished; the verdicts below are partial.";
  const c = counts(run);
  const checked = (c.get("passed") ?? 0) + (c.get("verified_fixed") ?? 0) + (c.get("needs_human") ?? 0);
  if (checked === 0) return "Kane could not check any step of this guide. See the reasons below.";
  if ((c.get("needs_human") ?? 0) === 0 && (c.get("verified_fixed") ?? 0) === 0) {
    return "Every step Kane checked worked as the guide says."; // BR-11: no invented problems
  }
  const parts: string[] = [];
  if (c.get("verified_fixed")) parts.push(`${c.get("verified_fixed")} step group(s) needed new wording, and Kane proved the fix`);
  if (c.get("needs_human")) parts.push(`${c.get("needs_human")} step group(s) need a human`);
  return `${parts.join("; ")}.`;
}

// ---------------------------------------------------------------------------
// HTML

function buildHtml(run: RunRecord, options: ReportOptions): string {
  const verdicts = run.checks.map((c) => c.verdict).filter((v): v is Verdict => v !== undefined);
  const s = score(verdicts);
  const c = counts(run);
  const title = run.guideTitle ?? run.guideUrl;
  const fixes = run.checks.filter((ch) => ch.verdict === "verified_fixed");

  const countItems = VERDICTS.filter((v) => (c.get(v) ?? 0) > 0)
    .map((v) => `<li class="badge ${COLOUR[v]}"><span aria-hidden="true">${VERDICT_INFO[v].icon}</span> ${escapeHtml(VERDICT_INFO[v].label)} <b>${c.get(v)}</b></li>`)
    .join("");

  const checks = sortedChecks(run).map((ch) => checkHtml(ch, options)).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Proof Report · ${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="top"><a class="brand" href="${REPO_URL}" rel="noopener noreferrer">Wayproof</a><span class="muted">Proof Report</span></header>
<main>
<section class="head">
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Checked <time datetime="${escapeHtml(run.createdAt)}">${escapeHtml(formatDate(run.createdAt))}</time> · ${link(run.guideUrl, run.guideUrl)}</p>
  <p class="lead">${escapeHtml(headline(run))}</p>
  ${options.note ? `<p class="callout">${escapeHtml(options.note)}</p>` : ""}
  <p class="note">Kane CLI followed this guide in a real browser. Wayproof never connects a wallet, signs or sends anything, so steps that need a wallet are marked “Not checked”. This report is a snapshot of ${escapeHtml(formatDate(run.createdAt))}, not live status.</p>
</section>

<section class="summary" aria-label="Summary">
  <div class="score card">
    <div class="label">Score</div>
    ${s.kind === "score" ? `<div class="big">${s.value}<span>/100</span></div>` : `<div class="big none">No score</div>`}
    <div class="small">${escapeHtml(explainScore(s))}</div>
    <div class="small muted">Only Passed, Verified fixed and Needs a human count.</div>
  </div>
  <div class="card counts">
    <ul class="badges">${countItems || "<li class=\"muted\">No steps were found.</li>"}</ul>
    <p class="small muted">Kane runs ${run.kaneRuns} · Kane credits ${round(run.kaneCredits)} · duration ${escapeHtml(duration(run))} · allowed sites: ${escapeHtml(run.allowedDomains.join(", "))}</p>
  </div>
</section>

<section aria-labelledby="checks-h">
  <h2 id="checks-h">Every check</h2>
  <p class="small muted">Problems first. Open a check to see each Kane run, the judge's reason and the evidence.</p>
  ${checks || `<p class="muted">No checks.</p>`}
</section>

<section aria-labelledby="fixed-h">
  <h2 id="fixed-h">Corrected guide</h2>
  ${
    fixes.length === 0
      ? `<p class="muted">${run.status === "finished" && (c.get("needs_human") ?? 0) === 0 ? "No steps needed changes — every checked step worked." : "No fix was proven by Kane for this guide."}</p>`
      : `<p class="small muted">Only wording that Kane followed successfully is shown as corrected. The expected result is never changed.</p>
  <table class="diff"><thead><tr><th scope="col">Step</th><th scope="col">Original</th><th scope="col">Corrected (proven by Kane)</th></tr></thead><tbody>
  ${fixes.map((f) => `<tr><td>${escapeHtml(stepLabel(f))}</td><td><del>${escapeHtml(f.stepText)}</del></td><td><ins>${escapeHtml(f.correctedText)}</ins> <a href="#${escapeHtml(f.id)}">proof →</a></td></tr>`).join("")}
  </tbody></table>`
  }
</section>
</main>
<footer><p class="small muted">Made by <a href="${REPO_URL}" rel="noopener noreferrer">Wayproof</a> with Kane CLI (browser checks) and Claude (reading, judging, fixing). Every verdict links to Kane's own evidence. Run ${escapeHtml(run.id)}.</p></footer>
</body>
</html>
`;
}

function checkHtml(ch: CheckRecord, options: ReportOptions): string {
  const v = ch.verdict;
  const info = v ? VERDICT_INFO[v] : { label: "Not finished", icon: "⏳" };
  const tone = v ? COLOUR[v] : "muted";
  const lastKane = [...ch.attempts].reverse().find((a) => a.kane)?.kane;
  const attempts = ch.attempts.map((a) => attemptHtml(a, options)).join("\n");
  return `<details class="check card" id="${escapeHtml(ch.id)}"${v === "needs_human" || v === "verified_fixed" ? " open" : ""}>
  <summary>
    <span class="badge ${tone}"><span aria-hidden="true">${info.icon}</span> ${escapeHtml(info.label)}</span>
    <span class="steps">${escapeHtml(stepLabel(ch))}</span>
    <span class="text">${escapeHtml(firstLine(ch.stepText))}</span>
    <span class="small muted">${ch.attempts.filter((a) => a.kane).length} Kane run(s)</span>
  </summary>
  <div class="body">
    <p><b>Guide says:</b> ${escapeHtml(ch.stepText).replaceAll("\n", "<br>")}</p>
    <p><b>Expected:</b> ${escapeHtml(ch.expected)} <span class="small muted">(never changed by a fix)</span></p>
    <p><b>Verdict:</b> ${escapeHtml(ch.verdictWhy ?? "")}${ch.errorCode ? ` <code>${escapeHtml(ch.errorCode)}</code>` : ""}</p>
    ${lastKane?.summary ? `<blockquote>Kane: “${escapeHtml(lastKane.summary)}”</blockquote>` : ""}
    ${ch.correctedText ? `<p><b>Corrected wording (proven):</b> <ins>${escapeHtml(ch.correctedText)}</ins></p>` : ""}
    ${attempts ? `<ol class="timeline">${attempts}</ol>` : ""}
  </div>
</details>`;
}

function attemptHtml(a: AttemptRecord, options: ReportOptions): string {
  const k = a.kane;
  const evidence = localHref(k?.evidence);
  const raw = localHref(k?.rawLog);
  return `<li>
  <div class="att-h"><b>Attempt ${a.n}</b> · ${escapeHtml(ATTEMPT_LABEL[a.kind])}${k ? ` · Kane: <b>${escapeHtml(k.outcome)}</b>${k.exitCode !== undefined ? ` (exit ${k.exitCode})` : ""}` : ""}</div>
  ${a.kind === "after_fix" ? `<p><b>Wording tried:</b> ${escapeHtml(a.stepText)}</p>` : ""}
  <p class="small"><b>Objective given to Kane:</b></p><pre>${escapeHtml(a.objective)}</pre>
  ${k ? `<p class="small muted">${escapeHtml(k.why)}${k.credits !== undefined ? ` · ${round(k.credits)} credits` : ""} · ${Math.round(k.durationMs / 1000)} s</p>` : ""}
  ${k?.summary ? `<blockquote>Kane: “${escapeHtml(k.summary)}”</blockquote>` : ""}
  ${k && k.steps.length ? `<ul class="ksteps">${k.steps.map((st) => `<li>${st.status === "failed" ? "✖" : "✔"} ${escapeHtml(st.remark)}</li>`).join("")}</ul>` : ""}
  ${a.judge ? `<p><b>Judge (${escapeHtml(a.judge.model)}):</b> <code>${escapeHtml(a.judge.outcome)}</code> — ${escapeHtml(a.judge.reason)}<br><span class="small">Kane quote: “${escapeHtml(a.judge.quote)}”</span></p>` : ""}
  ${a.fix ? `<p><b>Proposed fix:</b> ${escapeHtml(a.fix.newStepText)} <span class="small muted">— ${escapeHtml(a.fix.rationale)}</span></p>` : ""}
  ${a.error ? `<p class="bad-t"><code>${escapeHtml(a.error.code)}</code> ${escapeHtml(a.error.why)}</p>` : ""}
  ${
    k
      ? `<p class="small evidence">Evidence: ${options.publicCopy ? "Kane's sealed evidence pack is kept private (it contains Kane account details)" : evidence ?`<a href="${evidence}" download>Kane evidence pack</a> (open with <code>kane-cli evidence serve ${escapeHtml(k.evidence)}</code>)` : "Kane evidence pack not saved on this computer"}${raw ? ` · <a href="${raw}">raw Kane output</a>` : ""}${safeHref(k.testUrl) ? ` · ${link(k.testUrl, "Kane run on TestMu ↗")}` : ""}</p>`
      : ""
  }
</li>`;
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 110 ? `${line.slice(0, 107)}…` : line;
}

function round(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

// ---------------------------------------------------------------------------
// Markdown

function buildMarkdown(run: RunRecord, options: ReportOptions): string {
  const verdicts = run.checks.map((c) => c.verdict).filter((v): v is Verdict => v !== undefined);
  const s = score(verdicts);
  const md = (t: unknown) => String(t ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  const lines: string[] = [
    `# Proof Report · ${md(run.guideTitle ?? run.guideUrl)}`,
    "",
    `Checked ${formatDate(run.createdAt)} · <${run.guideUrl}>`,
    "",
    `**${headline(run)}**`,
    "",
    ...(options.note ? [`> ${md(options.note)}`, ""] : []),
    `Score: ${s.kind === "score" ? `${s.value}/100` : "no score"} — ${explainScore(s)}`,
    "",
    `Kane runs ${run.kaneRuns} · Kane credits ${round(run.kaneCredits)} · allowed sites: ${run.allowedDomains.join(", ")}`,
    "",
    "Wayproof never connects a wallet, signs or sends anything; steps that need a wallet are marked “Not checked”.",
    "",
    "| Steps | Verdict | Why | Kane runs |",
    "|---|---|---|---|",
    ...sortedChecks(run).map(
      (c) =>
        `| ${stepLabel(c)} | ${c.verdict ? `${VERDICT_INFO[c.verdict].icon} ${VERDICT_INFO[c.verdict].label}` : "—"} | ${md(c.verdictWhy)} | ${c.attempts.filter((a) => a.kane).length} |`,
    ),
    "",
    "## Corrected guide",
    "",
  ];
  const fixes = run.checks.filter((c) => c.verdict === "verified_fixed");
  if (fixes.length === 0) lines.push("No fix was proven by Kane for this guide.");
  for (const f of fixes) {
    lines.push(`### ${stepLabel(f)}`, "", `- Original: ${md(f.stepText)}`, `- Corrected (proven by Kane): ${md(f.correctedText)}`, `- Expected (unchanged): ${md(f.expected)}`, "");
  }
  lines.push("", `Made by Wayproof (${REPO_URL}) with Kane CLI and Claude. Run ${run.id}.`, "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Style (docs/03 §7 tokens; light and dark; system fonts so the file works offline)

const CSS = `
:root{--bg:#FAFAF7;--surface:#FFFFFF;--line:#E4E4DE;--text:#141716;--muted:#5F6764;--accent:#2F5BEA;--ok:#1E7A46;--fixed:#7A4FD6;--warn:#A86A00;--bad:#C2362B}
@media (prefers-color-scheme:dark){:root{--bg:#0E1110;--surface:#161A19;--line:#2A302E;--text:#ECEFEC;--muted:#9AA3A0;--accent:#7C9BFF;--ok:#4CC383;--fixed:#B49BFF;--warn:#F2B84B;--bad:#FF7A6E}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/24px Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}
a{color:var(--accent)} a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.top{display:flex;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface)}
.brand{font-weight:700;text-decoration:none;color:var(--text)}
main{max-width:960px;margin:0 auto;padding:16px}
h1{font-size:28px;line-height:36px;margin:8px 0}
h2{font-size:22px;line-height:30px;margin:32px 0 8px}
@media (min-width:768px){h1{font-size:36px;line-height:44px}}
.meta,.small{font-size:14px;line-height:20px}
.meta{color:var(--muted);overflow-wrap:anywhere}
.lead{font-size:18px;line-height:28px;font-weight:600}
.callout{font-size:15px;line-height:22px;border:1px solid var(--accent);border-radius:8px;padding:12px 16px;background:var(--surface)}
.note{font-size:14px;line-height:20px;color:var(--muted);border-left:3px solid var(--line);padding-left:12px}
.muted{color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px}
.summary{display:grid;gap:16px;grid-template-columns:1fr}
@media (min-width:768px){.summary{grid-template-columns:240px 1fr}}
.score .label{font-size:14px;color:var(--muted)}
.big{font-size:48px;line-height:56px;font-weight:700}.big span{font-size:20px;color:var(--muted)}.big.none{font-size:28px;line-height:56px}
.badges{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.badge{display:inline-flex;gap:6px;align-items:center;border:1px solid currentColor;border-radius:999px;padding:2px 10px;font-size:14px;line-height:20px;white-space:nowrap}
.badge.ok{color:var(--ok)}.badge.fixed{color:var(--fixed)}.badge.warn{color:var(--warn)}.badge.bad{color:var(--bad)}.badge.muted{color:var(--muted)}
.check{margin:8px 0;padding:0}
.check summary{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:12px 16px;cursor:pointer;min-height:44px}
.check .steps{font-weight:600}.check .text{flex:1 1 240px;min-width:0;overflow-wrap:anywhere}
.check .body{padding:0 16px 16px;border-top:1px solid var(--line)}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);color:var(--text);background:var(--bg);overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/20px "JetBrains Mono",ui-monospace,Consolas,monospace;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;margin:4px 0}
code{font:14px/20px "JetBrains Mono",ui-monospace,Consolas,monospace;overflow-wrap:anywhere}
.timeline{padding-left:20px}.timeline>li{margin:12px 0;padding-left:4px}
.att-h{font-size:15px}
.ksteps{font-size:14px;line-height:20px;padding-left:18px;color:var(--muted)}
.evidence{overflow-wrap:anywhere}
.bad-t{color:var(--bad)}
table.diff{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:8px}
table.diff th,table.diff td{border-top:1px solid var(--line);padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
del{color:var(--muted)} ins{text-decoration:none;color:var(--fixed);font-weight:600}
footer{max-width:960px;margin:32px auto;padding:0 16px}
@media (max-width:480px){table.diff,table.diff tbody,table.diff tr,table.diff td{display:block}table.diff thead{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
