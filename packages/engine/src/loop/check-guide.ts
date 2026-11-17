// The fix loop (C-1): checks one guide from start to verdicts (TDD.md §14.2; 04-SRS FR-20–FR-25).
//
//   fetch → extract steps → wallet steps: "Not checked" (never run, BR-1)
//   group up to 3 checkable steps → for each group:
//     plan → safety gate → budget → Kane → where did Kane end up? → judge →
//       pass           → Passed (or Verified fixed if a fix came first)
//       flaky          → re-run the same check once
//       check_wording  → rewrite the CHECK once (same expected result) and re-run; the guide is not blamed
//       defect         → Claude proposes new wording → Kane re-runs it (BR-4: at most 3 Kane runs per check)
//       blocked        → Couldn't check
//   Kane blocked / error → Couldn't check; timeout → retry once with more time; wallet prompt → stopped safely.
//
// Rules kept in code: a Kane failure never becomes a pass (BR-3, judge + adapter); the expected result never
// changes (BR-5, copied by code); budget stops scheduling (BR-10); every verdict links to Kane evidence (BR-8);
// run.json is saved after every attempt.

import type { Verdict } from "../domain/verdict.ts";
import { judgeRun, planObjective, proposeFix, extractSteps, type GuideStep, type PlannedCheck } from "../claude/prompts.ts";
import type { Llm } from "../claude/llm.ts";
import { fetchGuide as realFetchGuide, type FetchGuideOptions, type FetchGuideResult } from "../fetch/guide.ts";
import type { KaneRunSpec } from "../kane/args.ts";
import { runKane as realRunKane, type KaneRunResult, type RunKaneOptions } from "../kane/run.ts";
import { checkUrl, normalizeDomain } from "../safety/domains.ts";
import { gateAfterRun, gateBeforeRun } from "../safety/gate.ts";
import { newRunId, type AttemptKind, type AttemptRecord, type CheckRecord, type RunRecord, type RunStore } from "./record.ts";

export const DEFAULT_CREDIT_BUDGET = 300;
export const DEFAULT_KANE_TIMEOUT_SECONDS = 360;
/** Added to Kane's credits_consumed for every run: the account balance falls by about this much more (TC-14). */
export const CREDIT_MARGIN_PER_RUN = 2;
/** BR-4: 1 original + 2 more Kane runs per check, whatever the reason for the re-runs. */
export const MAX_KANE_RUNS_PER_CHECK = 3;
const FIRST_RUN_ESTIMATE = 25;

export interface CheckGuideOptions {
  guideUrl: string;
  /** Extra allowed sites; the guide's own site is always added (FR-3). */
  allowedDomains?: string[];
  creditBudget?: number;
  groupSize?: number;
  kaneTimeoutSeconds?: number;
  kaneMaxSteps?: number;
  source?: "cli" | "web";
}

export type LoopEvent =
  | { type: "run_started"; runId: string; guideUrl: string }
  | { type: "steps_found"; title: string; steps: GuideStep[]; checks: number }
  | { type: "check_state"; checkId: string; stepNumbers: number[]; state: "planning" | "kane" | "judging" | "fixing" | "rewriting_check"; attempt: number }
  | { type: "check_done"; check: CheckRecord }
  | { type: "run_finished"; run: RunRecord }
  | { type: "run_failed"; run: RunRecord };

export interface LoopDeps {
  llm: Llm;
  store: RunStore;
  fetchGuide?: (url: string, options: FetchGuideOptions) => Promise<FetchGuideResult>;
  runKane?: (spec: KaneRunSpec, options: RunKaneOptions) => Promise<KaneRunResult>;
  onEvent?: (event: LoopEvent) => void;
  now?: () => Date;
}

export async function checkGuide(options: CheckGuideOptions, deps: LoopDeps): Promise<RunRecord> {
  const now = deps.now ?? (() => new Date());
  const fetchGuide = deps.fetchGuide ?? realFetchGuide;
  const runKane = deps.runKane ?? realRunKane;
  const emit = deps.onEvent ?? (() => {});
  const groupSize = options.groupSize ?? 3;
  // 360 s: a real 3-step Revoke.cash run took 303–335 s on 17 Nov and was cut off at the old 240 (+60) limit.
  const timeoutSeconds = options.kaneTimeoutSeconds ?? DEFAULT_KANE_TIMEOUT_SECONDS;
  const maxSteps = options.kaneMaxSteps ?? 25;

  const allowed = allowedSites(options.guideUrl, options.allowedDomains ?? []);
  const run: RunRecord = {
    id: newRunId(now()),
    source: options.source ?? "cli",
    createdAt: now().toISOString(),
    finishedAt: undefined,
    status: "running",
    guideUrl: options.guideUrl,
    guideTitle: undefined,
    allowedDomains: allowed,
    creditBudget: options.creditBudget ?? DEFAULT_CREDIT_BUDGET,
    kaneCredits: 0,
    creditsCounted: 0,
    kaneRuns: 0,
    claudeTokens: { input: 0, output: 0 },
    error: undefined,
    steps: [],
    checks: [],
  };
  const save = () => deps.store.save(run);
  const addTokens = (u: { inputTokens: number; outputTokens: number } | undefined) => {
    if (!u) return;
    run.claudeTokens.input += u.inputTokens;
    run.claudeTokens.output += u.outputTokens;
  };
  const failRun = async (code: string, why: string) => {
    run.status = "failed";
    run.error = { code, why };
    run.finishedAt = now().toISOString();
    await save();
    emit({ type: "run_failed", run });
    return run;
  };

  await save();
  emit({ type: "run_started", runId: run.id, guideUrl: run.guideUrl });

  try {
    // 1. Fetch and extract (FR-2)
    const page = await fetchGuide(options.guideUrl, { allowedDomains: allowed });
    if (!page.ok) return await failRun(page.code, page.why);

    const extracted = await extractSteps(deps.llm, { guideUrl: options.guideUrl, pageText: page.text });
    if ("usage" in extracted) addTokens(extracted.usage);
    if (!extracted.ok) return await failRun(extracted.code, extracted.why);

    run.guideTitle = extracted.value.title || page.title;
    run.steps = extracted.value.steps;
    run.checks = buildChecks(extracted.value.steps, allowed, groupSize);
    await save();
    emit({ type: "steps_found", title: run.guideTitle, steps: extracted.value.steps, checks: run.checks.length });

    // 2. Each check, in guide order
    let largestRun = 0;
    for (let i = 0; i < run.checks.length; i++) {
      const check = run.checks[i]!;
      if (check.verdict !== undefined) {
        emit({ type: "check_done", check });
        continue;
      }
      const steps = extracted.value.steps.filter((s) => check.stepNumbers.includes(s.n));
      const outcome = await runCheck(check, steps);
      if (outcome === "split") {
        // The plan for the whole group was refused (e.g. by the safety gate because of ONE step's wording):
        // check each step on its own so the others still get checked (TDD §18 "split on failure").
        const singles = steps.map((s, k) => ({ ...buildChecks([s], allowed, 1)[0]!, id: `${check.id}.${k + 1}` }));
        run.checks.splice(i, 1, ...singles);
        await save();
        i--;
        continue;
      }
      emit({ type: "check_done", check });
    }

    run.status = "finished";
    run.finishedAt = now().toISOString();
    await save();
    emit({ type: "run_finished", run });
    return run;

    // ---- one check: plan → gate → Kane → judge → fix ----
    async function runCheck(check: CheckRecord, originalSteps: GuideStep[]): Promise<void | "split"> {
      let planned: PlannedCheck | undefined;
      let kind: AttemptKind = "original";
      let currentText = check.stepText;
      let fixed = false;
      let usedFlaky = false;
      let usedRewrite = false;
      let usedTimeoutRetry = false;
      let checkTimeout = timeoutSeconds;
      let rewriteNote: string | undefined;
      let lastDefectWhy = "";

      const finish = async (verdict: Verdict, why: string, errorCode?: string) => {
        check.verdict = verdict;
        check.verdictWhy = why;
        check.errorCode = errorCode;
        if (verdict === "verified_fixed") check.correctedText = currentText;
        await save();
      };

      for (;;) {
        const kaneRunsSoFar = check.attempts.filter((a) => a.kane).length;
        if (kaneRunsSoFar >= MAX_KANE_RUNS_PER_CHECK) {
          // BR-11: "Needs a human" only if Kane actually showed a problem; otherwise it's "Couldn't check".
          return lastDefectWhy
            ? finish("needs_human", `${lastDefectWhy} The proposed fix was not proven within ${MAX_KANE_RUNS_PER_CHECK} Kane runs.`)
            : finish("couldnt_check", `Kane could not confirm this step within ${MAX_KANE_RUNS_PER_CHECK} runs, and never showed a problem with the guide.`);
        }

        // Plan (FR-20) — again after a fix or a check rewrite
        if (!planned) {
          emit({ type: "check_state", checkId: check.id, stepNumbers: check.stepNumbers, state: kind === "check_rewrite" ? "rewriting_check" : "planning", attempt: kaneRunsSoFar + 1 });
          const stepsToPlan: GuideStep[] = fixed
            ? [{ n: check.stepNumbers[0] ?? 1, action: currentText, expected: check.expected, needsWallet: false, url: originalSteps[0]?.url ?? null }]
            : originalSteps;
          const plan = await planObjective(deps.llm, {
            steps: stepsToPlan,
            allowedDomains: allowed,
            ...(originalSteps[0]?.url ? { startUrlHint: originalSteps[0].url } : {}),
            ...(rewriteNote ? { previousProblem: rewriteNote } : {}),
          });
          if ("usage" in plan) addTokens(plan.usage);
          if (!plan.ok) {
            if (plan.code === "OUTSIDE_ALLOWED_SITES") {
              return finish("not_checked_outside_domains", `These steps happen on ${plan.url}, which is not on the allowed sites list.`);
            }
            if (originalSteps.length > 1 && !fixed && check.attempts.length === 0) return "split";
            return finish("couldnt_check", `Wayproof's AI could not plan this check: ${plan.why}`, "ERR-AI");
          }
          planned = { ...plan.value, expected: check.expected }; // BR-5: the check's expected result, always
        }

        // Safety gate, again, on exactly what will run (BR-1, BR-2)
        const gate = gateBeforeRun({ objective: planned.objective, url: planned.url, allowedDomains: allowed });
        if (!gate.allowed) return finish(gate.verdict, gate.why, gate.code);

        // Budget (BR-10)
        const estimate = largestRun > 0 ? largestRun : FIRST_RUN_ESTIMATE;
        if (run.creditsCounted + estimate > run.creditBudget) {
          return finish(
            "not_run_budget",
            `Not run: the next Kane run (about ${Math.round(estimate)} credits) would pass this check's budget of ${run.creditBudget} credits (${Math.round(run.creditsCounted)} used).`,
            "ERR-BUDGET",
          );
        }

        // Kane (FR-21)
        const n = check.attempts.length + 1;
        emit({ type: "check_state", checkId: check.id, stepNumbers: check.stepNumbers, state: "kane", attempt: kaneRunsSoFar + 1 });
        const attempt: AttemptRecord = {
          n,
          kind,
          stepText: currentText,
          objective: planned.objective,
          url: planned.url,
          startedAt: now().toISOString(),
          endedAt: "",
        };
        check.attempts.push(attempt);
        const rawLogPath = deps.store.rawLogPath(run.id, check.id, n);
        const result = await runKane(
          { objective: planned.objective, url: planned.url, timeoutSeconds: checkTimeout, maxSteps },
          { wallClockMs: (checkTimeout + 60) * 1000, rawLogPath },
        );
        const counted = (result.creditsConsumed ?? 0) + CREDIT_MARGIN_PER_RUN;
        run.kaneRuns += 1;
        run.kaneCredits += result.creditsConsumed ?? 0;
        run.creditsCounted += counted;
        largestRun = Math.max(largestRun, counted);

        const end = result.output.runEnd;
        attempt.endedAt = now().toISOString();
        attempt.kane = {
          exitCode: result.exitCode,
          outcome: result.outcome.kind,
          why: result.outcome.why,
          summary: end?.summary,
          reason: end?.reason,
          reasonCode: end?.reason_code,
          finalState: end?.final_state,
          credits: result.creditsConsumed,
          testUrl: end?.test_url,
          durationMs: result.durationMs,
          steps: result.output.progress
            .filter((p) => p.status !== "running")
            .map((p) => ({ status: p.status, remark: p.remark ?? "" })),
          rawLog: result.rawLogPath ? deps.store.relative(run.id, result.rawLogPath) : undefined,
          evidence: await deps.store.copyEvidence(run.id, result.evidencePath, `${check.id}-attempt-${n}`),
        };
        await save();

        // Where did Kane end up? (BR-2, redirects)
        const finalUrl = typeof end?.final_state?.["url"] === "string" ? end.final_state["url"] : undefined;
        const after = gateAfterRun(finalUrl, allowed);
        if (!after.allowed) return finish(after.verdict, after.why, after.code);

        switch (result.outcome.kind) {
          case "stopped_safely":
            return finish("not_checked_wallet", `Stopped safely: ${result.outcome.why}`, "ERR-BOUNDARY");
          case "blocked":
            return finish("couldnt_check", result.outcome.why, "ERR-KANE");
          case "error":
            return finish("couldnt_check", `${result.outcome.why} This is not a problem with the guide.`, "ERR-KANE");
          case "timeout":
            if (!usedTimeoutRetry) {
              usedTimeoutRetry = true;
              checkTimeout = Math.round(checkTimeout * 1.5);
              kind = "timeout_retry";
              continue;
            }
            return finish("couldnt_check", "Kane ran out of time on this step twice.", "ERR-KANE-TIMEOUT");
          case "passed":
          case "failed":
            break;
        }

        // Judge (FR-22)
        emit({ type: "check_state", checkId: check.id, stepNumbers: check.stepNumbers, state: "judging", attempt: kaneRunsSoFar + 1 });
        const judged = await judgeRun(deps.llm, {
          objective: planned.objective,
          expected: check.expected,
          kaneOutcome: result.outcome.kind,
          summary: end?.summary ?? "",
          finalState: end?.final_state,
          reason: end?.reason,
          failingRemark: result.output.progress.find((p) => p.status === "failed")?.remark,
        });
        addTokens(judged.usage);
        if (!judged.ok) {
          attempt.error = { code: judged.code, why: judged.why };
          return finish("couldnt_check", `Wayproof's AI could not judge Kane's result: ${judged.why}`, "ERR-AI");
        }
        attempt.judge = { ...judged.value, model: judged.model };
        await save();

        switch (judged.value.outcome) {
          case "pass":
            return finish(
              fixed ? "verified_fixed" : "passed",
              fixed ? "Kane followed the corrected wording and saw the expected result." : "Kane followed the guide and saw the expected result.",
            );
          case "blocked":
            return finish("couldnt_check", `The site stopped Kane: ${judged.value.reason}`, "ERR-KANE");
          case "flaky":
            if (!usedFlaky) {
              usedFlaky = true;
              kind = "flaky_rerun";
              continue; // same objective
            }
            return finish("couldnt_check", `Kane's result was unstable twice: ${judged.value.reason}`);
          case "check_wording":
            if (!usedRewrite) {
              usedRewrite = true;
              kind = "check_rewrite";
              rewriteNote = judged.value.reason;
              planned = undefined; // re-plan the check; the guide wording stays
              continue;
            }
            return finish("couldnt_check", `Kane could not confirm the result with two different checks: ${judged.value.reason}`);
          case "defect": {
            lastDefectWhy = `Kane showed a problem: ${judged.value.reason}`;
            if (check.attempts.filter((a) => a.kane).length >= MAX_KANE_RUNS_PER_CHECK) {
              return finish("needs_human", lastDefectWhy);
            }
            // Fix (FR-24)
            emit({ type: "check_state", checkId: check.id, stepNumbers: check.stepNumbers, state: "fixing", attempt: kaneRunsSoFar + 1 });
            const fix = await proposeFix(deps.llm, {
              stepText: currentText,
              expected: check.expected,
              judgeReason: judged.value.reason,
              kaneSummary: end?.summary ?? "",
              kaneRemarks: attempt.kane.steps.map((s) => s.remark),
            });
            addTokens(fix.usage);
            if (!fix.ok) return finish("needs_human", `${lastDefectWhy} No safe fix could be proposed (${fix.why}).`);
            attempt.fix = { newStepText: fix.value.newStepText, rationale: fix.value.rationale, model: fix.model };
            await save();
            currentText = fix.value.newStepText;
            fixed = true;
            kind = "after_fix";
            planned = undefined;
            continue;
          }
        }
      }
    }
  } catch (err) {
    return await failRun("ERR-UNEXPECTED", err instanceof Error ? err.message : String(err));
  }
}

/** The guide's own site plus the user's extra sites (FR-3). Invalid entries are dropped. */
export function allowedSites(guideUrl: string, extra: string[]): string[] {
  const out: string[] = [];
  const add = (d: string) => {
    const n = normalizeDomain(d);
    if (n.ok && !out.includes(n.domain)) out.push(n.domain);
  };
  try {
    add(new URL(guideUrl).hostname);
  } catch {
    // an invalid guide URL is reported by the fetcher
  }
  for (const d of extra) add(d);
  return out;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Wallet steps and steps on other sites get their own check (never run); the rest are grouped, up to `size`. */
export function buildChecks(steps: GuideStep[], allowed: string[], size: number): CheckRecord[] {
  const checks: CheckRecord[] = [];
  let group: GuideStep[] = [];
  const make = (members: GuideStep[], verdict?: Verdict, why?: string): CheckRecord => ({
    id: `check-${checks.length + 1}`,
    stepNumbers: members.map((s) => s.n),
    stepText: members.map((s) => s.action).join("\n"),
    expected: members.map((s) => s.expected).join(" Then: "),
    needsWallet: members.some((s) => s.needsWallet),
    verdict,
    verdictWhy: why,
    errorCode: undefined,
    correctedText: undefined,
    attempts: [],
  });
  // Consecutive steps on the same not-allowed site become ONE "outside" check (e.g. a guide's Etherscan section).
  let outside: { host: string; steps: GuideStep[] } | undefined;
  const flushOutside = () => {
    if (outside) {
      checks.push(make(outside.steps, "not_checked_outside_domains", `These steps happen on ${outside.host}, which is not on the allowed sites list.`));
    }
    outside = undefined;
  };
  const flush = () => {
    if (group.length > 0) checks.push(make(group));
    group = [];
  };
  for (const step of steps) {
    const host = step.url ? hostOf(step.url) : undefined;
    const notAllowed = step.url !== null && !checkUrl(step.url, allowed).ok;
    if (!(notAllowed && !step.needsWallet && outside && host === outside.host)) flushOutside();

    if (step.needsWallet) {
      flush();
      checks.push(make([step], "not_checked_wallet", "This step needs a wallet. Wayproof never connects one (BR-1)."));
      continue;
    }
    if (notAllowed) {
      flush();
      if (outside && host === outside.host) outside.steps.push(step);
      else outside = { host: host ?? String(step.url), steps: [step] };
      continue;
    }
    group.push(step);
    if (group.length >= size) flush();
  }
  flush();
  flushOutside();
  return checks;
}
