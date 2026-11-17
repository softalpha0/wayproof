// Server-rendered screens (docs/02 §4, docs/03): S-01 Home, S-02 Set up check, S-03 Live check,
// S-07 Access code (inline on S-02), S-08 Error, S-09 How it works. No page needs JavaScript except the
// live updates on S-03 (/static/live.js). All text from websites or Claude is escaped.

import { escapeHtml, type GuideStep } from "@wayproof/engine";

const REPO = "https://github.com/softalpha0/wayproof";
export const PUBLISHED = "https://softalpha0.github.io/wayproof/";

/** docs/04 §5 messages — the exact plain-English texts. */
export const ERRORS: Record<string, string> = {
  "ERR-URL-INVALID": "That doesn't look like a web link. Paste the full address starting with https://",
  "ERR-FETCH": "We couldn't open that page. It may be down or blocking automated visits.",
  "ERR-NO-STEPS": "We couldn't find step-by-step instructions on that page.",
  "ERR-DOMAIN-INVALID": "Enter a domain like docs.example.com",
  "ERR-ACCESS": "That access code isn't valid or has been used up.",
  "ERR-AI": "Our AI couldn't process this step.",
  "ERR-NOT-FOUND": "We couldn't find that report.",
  "ERR-LIMIT": "Today's free checks are used up. Kane runs use limited credits, so checks are limited.",
  "ERR-ORIGIN": "That request didn't come from this site, so it was refused.",
};

const CSS = `
:root{--bg:#FAFAF7;--surface:#FFFFFF;--line:#E4E4DE;--text:#141716;--muted:#5F6764;--accent:#2F5BEA;--ok:#1E7A46;--warn:#A86A00;--bad:#C2362B}
@media (prefers-color-scheme:dark){:root{--bg:#0E1110;--surface:#161A19;--line:#2A302E;--text:#ECEFEC;--muted:#9AA3A0;--accent:#7C9BFF;--ok:#4CC383;--warn:#F2B84B;--bad:#FF7A6E}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/24px Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
header{display:flex;gap:16px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap}
header .brand{font-weight:700;color:var(--text);text-decoration:none;margin-right:auto}
main{max-width:860px;margin:0 auto;padding:24px 16px}
h1{font-size:28px;line-height:36px;margin:0 0 8px}@media(min-width:768px){h1{font-size:36px;line-height:44px}}
h2{font-size:22px;line-height:30px;margin:32px 0 8px}
.lead{font-size:18px;line-height:28px}.muted{color:var(--muted)}.small{font-size:14px;line-height:20px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px;margin:12px 0}
label{display:block;font-weight:600;margin:12px 0 4px}
input[type=url],input[type=text]{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);min-height:44px}
button{font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:6px;background:var(--accent);color:#fff;min-height:44px;cursor:pointer}
.safe{border-left:3px solid var(--ok);padding-left:12px}
.err{border-left:3px solid var(--bad);padding-left:12px}
ol.steps{padding-left:20px}ol.steps li{margin:6px 0}.wallet{color:var(--muted)}
.tag{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:0 8px;font-size:13px;margin-left:6px}
#log{white-space:pre-wrap;font:14px/22px "JetBrains Mono",ui-monospace,Consolas,monospace;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px;min-height:120px;overflow-wrap:anywhere}
.status{font-weight:600}
`;

export function layout(title: string, body: string, opts: { liveScript?: boolean } = {}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Wayproof</title><style>${CSS}</style></head>
<body><header><a class="brand" href="/">Wayproof</a><a href="/how-it-works">How it works</a><a href="${REPO}" rel="noopener noreferrer">GitHub</a></header>
<main>${body}</main>${opts.liveScript ? '<script src="/static/live.js" defer></script>' : ""}</body></html>`;
}

export function homePage(published: { label: string; url: string }[], note?: string): string {
  return layout(
    "Check a crypto guide",
    `<h1>Does this crypto guide still work?</h1>
<p class="lead">Paste a how-to guide. Kane CLI follows each step in a real browser, Claude fixes any step that fails, and Kane re-runs it to prove the fix.</p>
<p class="safe small">Wayproof never connects a wallet, signs or sends anything. Steps that need a wallet are marked "not checked".</p>
${note ? `<p class="err small">${escapeHtml(note)}</p>` : ""}
<form class="card" method="get" action="/check/new">
  <label for="url">Guide link</label>
  <input id="url" name="url" type="url" required maxlength="2048" placeholder="https://…" autocomplete="off">
  <label for="allow">Other sites the guide's steps use <span class="muted small">(optional, comma-separated, e.g. app.uniswap.org)</span></label>
  <input id="allow" name="allow" type="text" maxlength="500" autocomplete="off">
  <p><button type="submit">Check this guide</button></p>
  <p class="small muted">Next you'll see the steps Wayproof found before any Kane credits are spent.</p>
</form>
<h2>Published Proof Reports</h2>
<p class="small muted">Real checks of real guides, with Kane's evidence. A quick way to see what Wayproof produces.</p>
<ul>${published.map((p) => `<li><a href="${escapeHtml(p.url)}" rel="noopener noreferrer">${escapeHtml(p.label)}</a></li>`).join("")}</ul>
<p><a href="${PUBLISHED}" rel="noopener noreferrer">All published reports →</a></p>`,
  );
}

export function setupPage(p: { id: string; guideUrl: string; title: string; steps: GuideStep[]; allowed: string[]; suggestedDomains: string[] }, opts: { codeRequired: boolean; error?: string }): string {
  const checkable = p.steps.filter((s) => !s.needsWallet).length;
  return layout(
    "Set up check",
    `<p class="small"><a href="/">← Back</a></p>
<h1>${escapeHtml(p.title)}</h1>
<p class="small muted">${escapeHtml(p.guideUrl)}</p>
${opts.error ? `<p class="err">${escapeHtml(opts.error)}</p>` : ""}
<div class="card"><p><b>${p.steps.length} steps found</b> · ${checkable} can be checked · ${p.steps.length - checkable} need a wallet and will not be run.</p>
<ol class="steps">${p.steps
      .map(
        (s) =>
          `<li class="${s.needsWallet ? "wallet" : ""}">${escapeHtml(s.action)}${s.needsWallet ? '<span class="tag">wallet step — not checked</span>' : ""}<br><span class="small muted">Expected: ${escapeHtml(s.expected)}${s.url ? ` · ${escapeHtml(s.url)}` : ""}</span></li>`,
      )
      .join("")}</ol></div>
${
  checkable === 0
    ? `<p class="err">Every step of this guide needs a wallet, so there is nothing Wayproof can check.</p>`
    : `<form class="card" method="post" action="/api/runs">
  <input type="hidden" name="prepared" value="${escapeHtml(p.id)}">
  <label for="allow">Allowed sites</label>
  <input id="allow" name="allow" type="text" value="${escapeHtml(p.allowed.join(", "))}" maxlength="500">
  <p class="small muted">Kane only visits these sites (and their sub-sites).${p.suggestedDomains.length ? ` The steps also use: <b>${escapeHtml(p.suggestedDomains.join(", "))}</b> — add them if you trust them.` : ""}</p>
  ${opts.codeRequired ? `<label for="code">Access code</label><input id="code" name="code" type="text" autocomplete="off" maxlength="100"><p class="small muted">Kane runs use limited credits, so live checks need an access code. You can also <a href="${PUBLISHED}">open the published reports</a> or <a href="${REPO}#run-it-yourself-about-2-minutes-to-set-up">run Wayproof yourself</a>.</p>` : ""}
  <p><button type="submit">Start check</button></p>
</form>`
}`,
  );
}

export function livePage(runId: string): string {
  return layout(
    "Live check",
    `<h1>Live check</h1>
<p class="small">Run <code>${escapeHtml(runId)}</code> · keep this link to come back: <a href="/run/${escapeHtml(runId)}">/run/${escapeHtml(runId)}</a></p>
<p class="status" id="status" data-run="${escapeHtml(runId)}" aria-live="polite">Connecting…</p>
<div id="log" role="log" aria-live="polite"></div>
<p id="done" hidden><a href="/report/${escapeHtml(runId)}"><b>Open the Proof Report →</b></a></p>
<p class="small muted">Each Kane run takes a few minutes. The check keeps going if you close this page.</p>`,
    { liveScript: true },
  );
}

export function howItWorksPage(): string {
  return layout(
    "How it works",
    `<h1>How Wayproof works</h1>
<ol class="steps">
<li><b>Read the guide.</b> Wayproof downloads the page and Claude lists the steps. Steps that need a wallet are marked and never run.</li>
<li><b>Kane follows it.</b> For each group of up to 3 steps, Claude writes a plain-English objective and Kane CLI follows it in a real Chrome browser.</li>
<li><b>Judge.</b> Claude reads Kane's result and must quote Kane's own words. A Kane failure can never become a pass.</li>
<li><b>Fix and prove.</b> If Kane shows a real problem, Claude proposes new wording and Kane runs it again. Only wording Kane proved is shown as a fix.</li>
<li><b>Proof Report.</b> Every verdict, every Kane run, the judge's quote and the fix — dated.</li>
</ol>
<h2>Safety</h2>
<p class="safe">Wayproof never connects a wallet, signs or sends anything. Every Kane objective must say so; fund-moving wording is refused; Kane only visits allowed sites; and Kane is stopped at the first sign of a wallet prompt.</p>
<h2>Honest limits</h2>
<p>Wallet steps are not checked. Some sites block automated browsers (reported as "couldn't check"). Claude can read a guide slightly differently from run to run. Reports are snapshots.</p>
<p><a href="${REPO}">Source and documentation on GitHub</a></p>`,
  );
}

export function errorPage(code: string, detail?: string, back = "/"): string {
  return layout(
    "Something went wrong",
    `<h1>${escapeHtml(ERRORS[code] ?? "Something went wrong.")}</h1>
<p class="err"><code>${escapeHtml(code)}</code>${detail ? ` — ${escapeHtml(detail)}` : ""}</p>
<p><a href="${escapeHtml(back)}">← Go back</a> · <a href="${PUBLISHED}">Published reports</a></p>`,
  );
}

/** The only script: replays and follows the run's events (S-03). Text is inserted as text, never as HTML. */
export const LIVE_JS = `(() => {
  const status = document.getElementById("status");
  const log = document.getElementById("log");
  const done = document.getElementById("done");
  const run = status.dataset.run;
  const source = new EventSource("/api/runs/" + encodeURIComponent(run) + "/events");
  let last = 0;
  source.onopen = () => { status.textContent = "Connected — following the check live."; };
  source.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.seq <= last) return;
    last = e.seq;
    if (e.line) { log.textContent += e.line + "\\n"; log.scrollTop = log.scrollHeight; }
    if (e.type === "queued") status.textContent = e.line;
    if (e.type === "check_state") status.textContent = "Working…";
    if (e.type === "run_finished" || e.type === "run_failed") {
      status.textContent = e.type === "run_finished" ? "Finished." : "The check could not finish.";
      done.hidden = false;
      source.close();
    }
  };
  source.onerror = () => { if (done.hidden) status.textContent = "Reconnecting…"; };
})();`;
