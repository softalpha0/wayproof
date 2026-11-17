// Terminal output for `wayproof check` (T-03 live lines, T-04 summary) and the exit code (FR-55).
// Symbols carry the meaning, so it reads fine without colour (docs/03 §3).

import { explainScore, score, VERDICT_INFO, type CheckRecord, type LoopEvent, type RunRecord, type Verdict } from "@wayproof/engine";

export function stepsLabel(stepNumbers: number[]): string {
  if (stepNumbers.length === 0) return "step ?";
  return stepNumbers.length === 1 ? `step ${stepNumbers[0]}` : `steps ${stepNumbers[0]}–${stepNumbers[stepNumbers.length - 1]}`;
}

const STATE_WORDS: Record<Extract<LoopEvent, { type: "check_state" }>["state"], string> = {
  planning: "writing the Kane objective",
  kane: "Kane is following it in a real browser",
  judging: "judging Kane's result",
  fixing: "Kane showed a problem — writing a fix",
  rewriting_check: "rewording the check (the guide is not blamed)",
};

/** One line per event, or undefined for events that print nothing. */
export function formatEvent(event: LoopEvent): string | undefined {
  switch (event.type) {
    case "run_started":
      return `Wayproof · checking ${event.guideUrl}`;
    case "steps_found":
      return `Guide: ${event.title}\n  ${event.steps.length} steps found → ${event.checks} check${event.checks === 1 ? "" : "s"} (wallet steps are never run)`;
    case "check_state":
      return `  … ${stepsLabel(event.stepNumbers)}  ${STATE_WORDS[event.state]}${event.state === "kane" ? ` (Kane run ${event.attempt}/3)` : ""}`;
    case "check_done":
      return verdictLine(event.check);
    case "run_failed":
      return `✖ ${event.run.error?.code ?? "ERR"}  ${event.run.error?.why ?? ""}`;
    case "run_finished":
      return undefined;
  }
}

export function verdictLine(check: CheckRecord): string {
  const v = check.verdict;
  if (!v) return `  ? ${stepsLabel(check.stepNumbers)}  not finished`;
  const info = VERDICT_INFO[v];
  const why = v === "passed" ? "" : ` — ${check.verdictWhy ?? ""}`;
  return `  ${info.icon} ${stepsLabel(check.stepNumbers)}  ${info.label.toLowerCase()}${why}`;
}

/** FR-55: 0 all passed or verified fixed · 1 at least one Needs a human · 2 setup/config error · 3 budget reached. */
export function exitCodeFor(run: RunRecord): 0 | 1 | 2 | 3 {
  if (run.status === "failed") return 2;
  const verdicts = run.checks.map((c) => c.verdict);
  if (verdicts.includes("needs_human")) return 1;
  if (verdicts.includes("not_run_budget")) return 3;
  return 0;
}

const EXIT_WORDS: Record<0 | 1 | 2 | 3, string> = {
  0: "every checked step passed or was proven fixed",
  1: "at least one step needs a human",
  2: "setup or input problem",
  3: "the credit budget was reached before every step was checked",
};

export function formatSummary(run: RunRecord, reportPath: string | undefined): string {
  const verdicts = run.checks.map((c) => c.verdict).filter((v): v is Verdict => v !== undefined);
  const count = (v: Verdict) => verdicts.filter((x) => x === v).length;
  const s = score(verdicts);
  const seconds = run.finishedAt ? Math.round((Date.parse(run.finishedAt) - Date.parse(run.createdAt)) / 1000) : 0;
  const code = exitCodeFor(run);
  const lines = [
    "",
    `Score ${s.kind === "score" ? `${s.value}/100` : "—"}   passed ${count("passed")} · fixed ${count("verified_fixed")} · needs a human ${count("needs_human")} · wallet ${count("not_checked_wallet")} · couldn't check ${count("couldnt_check")} · other site ${count("not_checked_outside_domains")} · not run ${count("not_run_budget")}`,
    `        ${explainScore(s)}`,
    `Kane runs ${run.kaneRuns} · Kane credits ${Math.round(run.kaneCredits * 10) / 10} · ${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`,
  ];
  if (reportPath) lines.push(`Report  ${reportPath}`);
  lines.push(`Exit code ${code} (${EXIT_WORDS[code]})`);
  return lines.join("\n");
}
