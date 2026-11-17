// Report builder (C-9): FR-50, FR-51, FR-53, FR-54; BR-7, BR-8, BR-11, BR-12; untrusted text is escaped.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildReport, escapeHtml, RunStore, writeReport, type CheckRecord, type RunRecord } from "../src/index.ts";

const SAMPLE = fileURLToPath(new URL("../../../fixtures/runs/sample-layout-run.json", import.meta.url));
const sample = (): RunRecord => JSON.parse(readFileSync(SAMPLE, "utf8")) as RunRecord;

function passedCheck(id: string, n: number): CheckRecord {
  return {
    id,
    stepNumbers: [n],
    stepText: `Step ${n}`,
    expected: "It works",
    needsWallet: false,
    verdict: "passed",
    verdictWhy: "Kane followed the guide and saw the expected result.",
    errorCode: undefined,
    correctedText: undefined,
    attempts: [],
  };
}

describe("the Proof Report (FR-50)", () => {
  it("shows the date it was checked (BR-12), the guide link, score and counts", () => {
    const { html } = buildReport(sample());
    expect(html).toMatch(/Checked <time datetime="2026-11-17T13:05:00.000Z">17 Nov 2026, \d\d:\d\d \(UTC[+-]\d+(:\d\d)?\)<\/time>/);
    expect(html).toContain('href="https://revoke.cash/learn/approvals/how-to-revoke-token-approvals"');
    expect(html).toContain('<div class="big">50<span>/100</span></div>'); // 1 verified fixed out of 2 counted (fixed + needs a human)
    expect(html).toContain("Verified fixed <b>1</b>");
    expect(html).toContain("Needs a human <b>1</b>");
  });

  it("score counts only Passed, Verified fixed and Needs a human (FR-51)", () => {
    // sample: 1 verified fixed, 1 needs a human, 1 wallet, 1 couldn't check → 1 of 2 = 50
    const { html } = buildReport(sample());
    expect(html).toContain("1 of 2 checked steps work (passed or verified fixed) = 50");
  });

  it("lists problems first: Needs a human before Couldn't check before Verified fixed before wallet steps", () => {
    const { html } = buildReport(sample());
    const at = (id: string) => html.indexOf(`id="${id}"`);
    expect(at("check-4")).toBeLessThan(at("check-3"));
    expect(at("check-3")).toBeLessThan(at("check-1"));
    expect(at("check-1")).toBeLessThan(at("check-2"));
  });

  it("every Kane run shows its evidence: pack, raw output and the TestMu link when it is a real link (BR-8)", () => {
    const { html } = buildReport(sample());
    expect(html).toContain('href="evidence/check-1-attempt-1.evidence"');
    expect(html).toContain('href="kane/check-1-attempt-2.ndjson"');
    expect(html).toContain("kane-cli evidence serve evidence/check-1-attempt-1.evidence");
    expect(html).not.toMatch(/href="https:\/\/test-manager\.lambdatest\.com\/(%3C|&lt;)redacted/); // a redacted placeholder is not a link
    expect(html).not.toContain("Kane run on TestMu");
  });

  it("shows the whole closed loop: Kane's words, the judge's reason and quote, and the proposed fix", () => {
    const { html } = buildReport(sample());
    expect(html).toContain("Kane: “SAMPLE: no search button was visible; the field accepted Enter instead.”");
    expect(html).toContain("<code>defect</code>");
    expect(html).toContain("Kane quote: “no search button was visible”");
    expect(html).toContain("Proposed fix, proven by Kane");
  });

  it("the corrected guide shows only wording Kane proved, next to the original (FR-53)", () => {
    const { html, markdown } = buildReport(sample());
    expect(html).toMatch(/<table class="diff">[\s\S]*<del>Enter your address in the search bar\.[\s\S]*<ins>Type your address into the search bar/);
    expect(markdown).toContain("- Corrected (proven by Kane): Type your address into the search bar");
    expect(markdown).toContain("- Expected (unchanged): A list of token approvals is shown, newest first.");
  });

  it("when everything passed, it says so plainly and invents nothing (BR-11)", () => {
    const run = { ...sample(), checks: [passedCheck("check-1", 1), passedCheck("check-2", 2)] };
    const { html } = buildReport(run);
    expect(html).toContain("Every step Kane checked worked as the guide says.");
    expect(html).toContain("No steps needed changes — every checked step worked.");
    expect(html).toContain('<div class="big">100<span>/100</span></div>');
  });

  it("a guide that could not be fetched → the report says why, with no score", () => {
    const run: RunRecord = { ...sample(), status: "failed", error: { code: "ERR-FETCH", why: "The site answered HTTP 404." }, checks: [] };
    const { html } = buildReport(run);
    expect(html).toContain("This guide could not be checked: ERR-FETCH — The site answered HTTP 404.");
    expect(html).toContain("No score");
  });

  it("never calls a guide 'safe' (docs/03 §8) and always says Wayproof never connects a wallet", () => {
    const { html } = buildReport(sample());
    expect(html).not.toMatch(/\bis safe\b|\bsafe to use\b/i);
    expect(html).toContain("Wayproof never connects a wallet");
  });
});

describe("untrusted text is shown as text, never run", () => {
  const hostile = (): RunRecord => {
    const run = sample();
    const c = run.checks[0]!;
    c.stepText = '<script>alert("guide")</script> Click <b>here</b>';
    c.attempts[0]!.kane!.summary = 'Done <img src=x onerror=alert(1)> "quoted"';
    c.attempts[0]!.kane!.testUrl = "javascript:alert(1)";
    c.attempts[0]!.kane!.evidence = "../../../Windows/System32/evil.evidence";
    run.guideTitle = "</title><script>alert(2)</script>";
    return run;
  };

  it("has no script tags or event handlers from the guide, Kane or Claude", () => {
    const { html } = buildReport(hostile());
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("&lt;script&gt;alert(&quot;guide&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("never links javascript: addresses or files outside the run folder", () => {
    const { html } = buildReport(hostile());
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toContain('href="../');
    expect(html).toContain("Kane evidence pack not saved on this computer");
  });

  it("escapeHtml covers the five special characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("one self-contained file with no personal data (BR-7, FR-54)", () => {
  it("loads nothing from the internet and contains no keys or home folders", () => {
    const { html, markdown } = buildReport(sample());
    expect(html).not.toMatch(/<link[^>]+stylesheet|<script|src="http/i);
    for (const text of [html, markdown]) {
      expect(text).not.toMatch(/sk-ant-|ANTHROPIC_API_KEY|[A-Z]:\\\\Users\\\\|[A-Z]:\\Users\\|\/Users\/|\/home\//);
    }
  });

  it("writes report.html and report.md into the run folder", async () => {
    const store = new RunStore(mkdtempSync(join(tmpdir(), "wayproof-report-")));
    const paths = await writeReport(store, sample());
    expect(existsSync(paths.htmlPath)).toBe(true);
    expect(readFileSync(paths.markdownPath, "utf8")).toMatch(/^# Proof Report · SAMPLE/);
  });
});
