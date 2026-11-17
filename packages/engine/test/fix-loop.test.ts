// The fix loop (C-1): FR-20–25, BR-1/2/3/4/5/8/10/11, run.json after every attempt.
// Kane and Claude are both fakes here (real Kane output from fixtures/kane/), so these tests are free.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildChecks,
  checkGuide,
  classifyKaneRun,
  parseKaneOutput,
  RunStore,
  SAFETY_SENTENCE,
  score,
  type FetchGuideResult,
  type GuideStep,
  type KaneRunResult,
  type KaneRunSpec,
  type Llm,
  type LlmRequest,
  type LlmResponse,
  type LoopEvent,
  type RunKaneOptions,
  type RunRecord,
} from "../src/index.ts";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/kane/", import.meta.url));
const S = SAFETY_SENTENCE;
const usage = { inputTokens: 100, outputTokens: 50 };
const ok = (value: unknown): LlmResponse<unknown> => ({ ok: true, value, model: "claude-opus-5-5", fallbackUsed: false, usage });

/** A pretend Claude that answers each job from its own list, and remembers what it was asked. */
class ScriptedClaude implements Llm {
  readonly asked: LlmRequest<unknown>[] = [];
  readonly script: Partial<Record<"extract" | "plan" | "judge" | "fix", LlmResponse<unknown>[]>>;
  constructor(script: Partial<Record<"extract" | "plan" | "judge" | "fix", LlmResponse<unknown>[]>>) {
    this.script = script;
  }
  async call<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    this.asked.push(request as LlmRequest<unknown>);
    const next = this.script[request.name]?.shift();
    if (!next) throw new Error(`ScriptedClaude has no answer left for "${request.name}"`);
    return next as LlmResponse<T>;
  }
  count(name: string): number {
    return this.asked.filter((r) => r.name === name).length;
  }
}

/** A pretend Kane that replays real Kane output, one fixture per run, and remembers what it was asked. */
function scriptedKane(runs: { fixture?: string; exit?: number; credits?: number; finalUrl?: string; outcome?: KaneRunResult["outcome"]; evidence?: string }[]) {
  const calls: KaneRunSpec[] = [];
  const impl = async (spec: KaneRunSpec, options: RunKaneOptions): Promise<KaneRunResult> => {
    calls.push(spec);
    const r = runs.shift();
    if (!r) throw new Error("scriptedKane: no run left");
    let stdout = r.fixture ? readFileSync(join(FIXTURES, `${r.fixture}.ndjson`), "utf8") : "";
    if (r.finalUrl) {
      stdout = stdout.replace(/"final_state":\{[^}]*\}/, `"final_state":{"url":"${r.finalUrl}"}`);
    }
    if (options.rawLogPath) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(options.rawLogPath, ".."), { recursive: true });
      writeFileSync(options.rawLogPath, stdout);
    }
    const output = parseKaneOutput(stdout);
    if (r.credits !== undefined && output.runEnd) output.runEnd.credits_consumed = r.credits;
    output.evidencePath = r.evidence;
    const outcome = r.outcome ?? classifyKaneRun({ exitCode: r.exit ?? 0, output });
    return {
      outcome,
      exitCode: r.exit ?? 0,
      stoppedByStopwatch: outcome.kind === "timeout",
      stoppedForSafety: outcome.kind === "stopped_safely" ? outcome.why : undefined,
      output,
      creditsConsumed: output.runEnd?.credits_consumed,
      evidencePath: r.evidence,
      rawLogPath: options.rawLogPath,
      durationMs: 1000,
      args: [],
    };
  };
  return { impl, calls };
}

const page = (text = "A guide."): FetchGuideResult => ({ ok: true, finalUrl: "https://revoke.cash/learn/guide", title: "Guide", text, via: "web-page" });
const step = (n: number, action: string, extra: Partial<GuideStep> = {}): GuideStep => ({ n, action, expected: `Result of step ${n}`, needsWallet: false, url: null, ...extra });
const planAnswer = (text = "Type vitalik.eth and press Enter. Assert that a list of token approvals is shown.") =>
  ok({ objective: `${S} ${text}`, url: "https://revoke.cash" });
const judge = (outcome: string, quote: string, reason = "Reason.") => ok({ outcome, reason, quote });

const PASS_QUOTE = "A token approvals list was displayed";
const FAIL_QUOTE = "The test was pointed at the generic example.com page";
const UNISWAP_QUOTE = "Buy field showed 0.00999713 ETH with the Base network badge";

function setup(claude: ScriptedClaude, kane: ReturnType<typeof scriptedKane>, budget?: number) {
  const store = new RunStore(mkdtempSync(join(tmpdir(), "wayproof-loop-")));
  const events: LoopEvent[] = [];
  const saves: string[] = [];
  const realSave = store.save.bind(store);
  store.save = async (run: RunRecord) => {
    saves.push(JSON.stringify(run.checks.map((c) => c.attempts.length)));
    return realSave(run);
  };
  return {
    store,
    events,
    saves,
    go: (steps: GuideStep[] = [step(1, "Type your address"), step(2, "Pick the network"), step(3, "Sort by Newest")]) => {
      claude.script.extract = [ok({ title: "How to revoke", steps }), ...(claude.script.extract ?? [])];
      return checkGuide(
        { guideUrl: "https://revoke.cash/learn/guide", ...(budget !== undefined ? { creditBudget: budget } : {}) },
        { llm: claude, store, runKane: kane.impl, fetchGuide: async () => page(), onEvent: (e) => events.push(e) },
      );
    },
  };
}

// ---------------------------------------------------------------------------
describe("grouping steps into checks", () => {
  it("groups up to 3 steps; wallet steps and other-site steps get their own check and never run", () => {
    const checks = buildChecks(
      [
        step(1, "a"),
        step(2, "b"),
        step(3, "c"),
        step(4, "d"),
        step(5, "Click Revoke", { needsWallet: true }),
        step(6, "Open Etherscan", { url: "https://etherscan.io/tokenapprovalchecker" }),
        step(7, "e"),
      ],
      ["revoke.cash"],
      3,
    );
    expect(checks.map((c) => [c.stepNumbers, c.verdict])).toEqual([
      [[1, 2, 3], undefined],
      [[4], undefined],
      [[5], "not_checked_wallet"],
      [[6], "not_checked_outside_domains"],
      [[7], undefined],
    ]);
  });

  it("a guide's whole section on another site becomes ONE outside check, even past 3 steps (seen 17 Nov: Etherscan step 12)", () => {
    const eth = "https://etherscan.io";
    const checks = buildChecks(
      [
        step(1, "Search", { url: "https://revoke.cash" }),
        step(2, "Click Revoke", { needsWallet: true, url: "https://revoke.cash" }),
        step(3, "On Etherscan, open Token Approvals", { url: eth }),
        step(4, "Enter your address", { url: eth }),
        step(5, "Select ERC20", { url: eth }),
        step(6, "Flip Show all approvals", { url: eth }),
        step(7, "Click Revoke", { needsWallet: true, url: eth }),
      ],
      ["revoke.cash"],
      3,
    );
    expect(checks.map((c) => [c.stepNumbers, c.verdict])).toEqual([
      [[1], undefined],
      [[2], "not_checked_wallet"],
      [[3, 4, 5, 6], "not_checked_outside_domains"],
      [[7], "not_checked_wallet"],
    ]);
    expect(checks[2]?.verdictWhy).toContain("etherscan.io");
  });
});

// ---------------------------------------------------------------------------
describe("the loop, path by path", () => {
  it("everything works → Passed, score 100, run.json saved", async () => {
    const claude = new ScriptedClaude({ plan: [planAnswer()], judge: [judge("pass", PASS_QUOTE)] });
    const kane = scriptedKane([{ fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth" }]);
    const t = setup(claude, kane);
    const run = await t.go();
    expect(run.status).toBe("finished");
    expect(run.checks.map((c) => c.verdict)).toEqual(["passed"]);
    expect(score(run.checks.map((c) => c.verdict!))).toMatchObject({ value: 100 });
    const saved = JSON.parse(readFileSync(join(t.store.dir(run.id), "run.json"), "utf8")) as RunRecord;
    expect(saved.checks[0]?.verdict).toBe("passed");
    expect(saved.checks[0]?.attempts[0]?.kane?.rawLog).toBe("kane/check-1-attempt-1.ndjson");
    expect(kane.calls[0]?.objective.startsWith(S)).toBe(true);
  });

  it("a defect → Claude's fix → Kane proves it → Verified fixed; expected result never changes (BR-5)", async () => {
    const claude = new ScriptedClaude({
      plan: [planAnswer(), planAnswer("Click 'Search' and type vitalik.eth. Assert that a list of token approvals is shown.")],
      judge: [judge("defect", FAIL_QUOTE, "The page was not the expected one."), judge("pass", PASS_QUOTE)],
      fix: [ok({ newStepText: "Type your address and press Search.", rationale: "Kane saw a Search button." })],
    });
    const kane = scriptedKane([
      { fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/" },
      { fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth" },
    ]);
    const run = await setup(claude, kane).go();
    const check = run.checks[0]!;
    expect(check.verdict).toBe("verified_fixed");
    expect(check.correctedText).toBe("Type your address and press Search.");
    expect(check.attempts.map((a) => a.kind)).toEqual(["original", "after_fix"]);
    expect(check.attempts[0]?.fix?.newStepText).toBe("Type your address and press Search.");
    expect(new Set([check.expected])).toEqual(new Set(["Result of step 1 Then: Result of step 2 Then: Result of step 3"]));
    expect(check.attempts[1]?.stepText).toBe("Type your address and press Search.");
  });

  it("3 defects → Needs a human after exactly 3 Kane runs, never a 4th (BR-4)", async () => {
    const claude = new ScriptedClaude({
      plan: [planAnswer(), planAnswer(), planAnswer()],
      judge: [judge("defect", FAIL_QUOTE), judge("defect", FAIL_QUOTE), judge("defect", FAIL_QUOTE)],
      fix: [ok({ newStepText: "Try A.", rationale: "x" }), ok({ newStepText: "Try B.", rationale: "x" })],
    });
    const kane = scriptedKane([
      { fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/" },
      { fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/" },
      { fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/" },
    ]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]?.verdict).toBe("needs_human");
    expect(kane.calls).toHaveLength(3);
    expect(claude.count("fix")).toBe(2);
  });

  it("a Kane failure can never become a pass, even if Claude says so (BR-3) → Couldn't check", async () => {
    const sneaky = judge("pass", FAIL_QUOTE);
    const claude = new ScriptedClaude({ plan: [planAnswer()], judge: [sneaky, sneaky] });
    const kane = scriptedKane([{ fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/" }]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]?.verdict).toBe("couldnt_check");
    expect(run.checks[0]?.errorCode).toBe("ERR-AI");
  });

  it("a site bot check → Couldn't check; Claude's judge is never asked (BR-6)", async () => {
    const claude = new ScriptedClaude({ plan: [planAnswer()] });
    const kane = scriptedKane([{ fixture: "etherscan-captcha-blocked", exit: 1 }]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]).toMatchObject({ verdict: "couldnt_check", errorCode: "ERR-KANE" });
    expect(claude.count("judge")).toBe(0);
  });

  it("check_wording (the Uniswap case) → the CHECK is rewritten once and passes → Passed, not 'fixed'; guide not blamed", async () => {
    const claude = new ScriptedClaude({
      plan: [planAnswer(), planAnswer("Type 0.01. Assert that the receive box shows a number greater than 0.")],
      judge: [judge("check_wording", UNISWAP_QUOTE, "The amount was visible; the check needed the network icon."), judge("pass", PASS_QUOTE)],
    });
    const kane = scriptedKane([
      { fixture: "uniswap-bridge-assertion-too-strict", exit: 1, finalUrl: "https://revoke.cash/" },
      { fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth" },
    ]);
    const run = await setup(claude, kane).go();
    const check = run.checks[0]!;
    expect(check.verdict).toBe("passed");
    expect(check.correctedText).toBeUndefined();
    expect(check.attempts.map((a) => a.kind)).toEqual(["original", "check_rewrite"]);
    expect(claude.asked.filter((r) => r.name === "plan")[1]?.user).toContain("the check needed the network icon");
    expect(claude.count("fix")).toBe(0);
  });

  it("flaky → the same check is run again once", async () => {
    const claude = new ScriptedClaude({ plan: [planAnswer()], judge: [judge("flaky", FAIL_QUOTE), judge("pass", PASS_QUOTE)] });
    const kane = scriptedKane([
      { fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/" },
      { fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth" },
    ]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]?.verdict).toBe("passed");
    expect(kane.calls[0]?.objective).toBe(kane.calls[1]?.objective);
    expect(claude.count("plan")).toBe(1);
  });

  it("timeout → one retry with 1.5× the time, then ERR-KANE-TIMEOUT", async () => {
    const timeout = { kind: "timeout" as const, why: "Wayproof stopped Kane because it ran past the time limit." };
    const claude = new ScriptedClaude({ plan: [planAnswer()] });
    const kane = scriptedKane([{ outcome: timeout }, { outcome: timeout }]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]).toMatchObject({ verdict: "couldnt_check", errorCode: "ERR-KANE-TIMEOUT" });
    expect(kane.calls.map((c) => c.timeoutSeconds)).toEqual([360, 540]);
  });

  it("the safety gate refuses a group's plan → each step is planned on its own; the others still get checked (seen 17 Nov: Uniswap 'Approve and swap')", async () => {
    const refused = ok({ objective: `${S} Type 0.01, select 'Review'. Assert that the review shows an 'Approve and swap' option.`, url: "https://revoke.cash" });
    const claude = new ScriptedClaude({
      plan: [refused, refused, planAnswer("Pick the network."), planAnswer("Type 0.01."), refused, refused],
      judge: [judge("pass", PASS_QUOTE), judge("pass", PASS_QUOTE)],
    });
    const kane = scriptedKane([
      { fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth" },
      { fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth" },
    ]);
    const run = await setup(claude, kane).go([step(1, "Select the network"), step(2, "Enter the amount"), step(3, "Select Review")]);
    expect(run.checks.map((c) => [c.id, c.stepNumbers, c.verdict])).toEqual([
      ["check-1.1", [1], "passed"],
      ["check-1.2", [2], "passed"],
      ["check-1.3", [3], "couldnt_check"],
    ]);
    expect(run.checks[2]?.errorCode).toBe("ERR-AI");
    expect(kane.calls).toHaveLength(2);
    for (const c of kane.calls) expect(c.objective).not.toMatch(/Approve and swap/);
  });

  it("re-runs that never show a problem end as Couldn't check, never Needs a human (BR-11)", async () => {
    const timeout = { kind: "timeout" as const, why: "timed out" };
    const claude = new ScriptedClaude({
      plan: [planAnswer(), planAnswer()],
      judge: [judge("check_wording", UNISWAP_QUOTE), judge("flaky", FAIL_QUOTE)],
    });
    const kane = scriptedKane([
      { outcome: timeout },
      { fixture: "uniswap-bridge-assertion-too-strict", exit: 1, finalUrl: "https://revoke.cash/" },
      { fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/" },
    ]);
    const run = await setup(claude, kane).go();
    expect(kane.calls).toHaveLength(3);
    expect(run.checks[0]?.verdict).toBe("couldnt_check");
  });

  it("a wallet prompt during the run → Not checked — wallet step (ERR-BOUNDARY)", async () => {
    const claude = new ScriptedClaude({ plan: [planAnswer()] });
    const kane = scriptedKane([{ outcome: { kind: "stopped_safely", why: "Kane's progress mentioned a wallet." } }]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]).toMatchObject({ verdict: "not_checked_wallet", errorCode: "ERR-BOUNDARY" });
  });

  it("Kane ending on a site that isn't allowed → outside allowed domains, never judged (BR-2)", async () => {
    const claude = new ScriptedClaude({ plan: [planAnswer()] });
    const kane = scriptedKane([{ fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://evil.example.com/drain" }]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]?.verdict).toBe("not_checked_outside_domains");
    expect(claude.count("judge")).toBe(0);
  });

  it("steps that happen on another site → outside allowed domains, Kane never started", async () => {
    const claude = new ScriptedClaude({ plan: [ok({ objective: `${S} Open the approvals page.`, url: "https://etherscan.io/tokenapprovalchecker" })] });
    const kane = scriptedKane([]);
    const run = await setup(claude, kane).go();
    expect(run.checks[0]?.verdict).toBe("not_checked_outside_domains");
    expect(kane.calls).toHaveLength(0);
  });

  it("budget: when the next run would pass the budget, the rest is Not run — budget reached (BR-10)", async () => {
    const claude = new ScriptedClaude({ plan: [planAnswer(), planAnswer()], judge: [judge("pass", PASS_QUOTE)] });
    const kane = scriptedKane([{ fixture: "revoke-lookup-pass", exit: 0, credits: 23, finalUrl: "https://revoke.cash/address/vitalik.eth" }]);
    const t = setup(claude, kane, 40);
    const run = await t.go([step(1, "a"), step(2, "b"), step(3, "c"), step(4, "d")]);
    expect(run.checks.map((c) => c.verdict)).toEqual(["passed", "not_run_budget"]);
    expect(run.checks[1]?.errorCode).toBe("ERR-BUDGET");
    expect(run.creditsCounted).toBe(25); // 23 + the 2-credit margin (TC-14)
    expect(kane.calls).toHaveLength(1);
  });

  it("a page that can't be fetched → the run fails with ERR-FETCH; no Claude, no Kane", async () => {
    const claude = new ScriptedClaude({});
    const kane = scriptedKane([]);
    const store = new RunStore(mkdtempSync(join(tmpdir(), "wayproof-loop-")));
    const run = await checkGuide(
      { guideUrl: "https://revoke.cash/learn/guide" },
      { llm: claude, store, runKane: kane.impl, fetchGuide: async () => ({ ok: false, code: "ERR-FETCH", why: "HTTP 503" }) },
    );
    expect(run).toMatchObject({ status: "failed", error: { code: "ERR-FETCH" } });
    expect(claude.asked).toHaveLength(0);
    expect(kane.calls).toHaveLength(0);
  });

  it("run.json is saved after every attempt, and Kane's evidence pack is copied into the run folder (BR-8)", async () => {
    const evidence = join(mkdtempSync(join(tmpdir(), "wayproof-ev-")), "pack.evidence");
    writeFileSync(evidence, "EVIDENCE");
    const claude = new ScriptedClaude({
      plan: [planAnswer(), planAnswer()],
      judge: [judge("defect", FAIL_QUOTE), judge("pass", PASS_QUOTE)],
      fix: [ok({ newStepText: "New wording.", rationale: "x" })],
    });
    const kane = scriptedKane([
      { fixture: "example-assertion-fail", exit: 1, finalUrl: "https://revoke.cash/", evidence },
      { fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth", evidence },
    ]);
    const t = setup(claude, kane);
    const run = await t.go();
    expect(t.saves).toContain("[1]");
    expect(t.saves).toContain("[2]");
    const ev = run.checks[0]?.attempts[1]?.kane?.evidence;
    expect(ev).toBe("evidence/check-1-attempt-2.evidence");
    expect(existsSync(join(t.store.dir(run.id), ev!))).toBe(true);
  });

  it("tells the terminal what is happening (events)", async () => {
    const claude = new ScriptedClaude({ plan: [planAnswer()], judge: [judge("pass", PASS_QUOTE)] });
    const kane = scriptedKane([{ fixture: "revoke-lookup-pass", exit: 0, finalUrl: "https://revoke.cash/address/vitalik.eth" }]);
    const t = setup(claude, kane);
    await t.go();
    expect(t.events.map((e) => e.type)).toEqual(["run_started", "steps_found", "check_state", "check_state", "check_state", "check_done", "run_finished"]);
  });
});
