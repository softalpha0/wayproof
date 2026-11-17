// Plain-English progress lines, shared by the terminal (T-03) and the web live page (S-03),
// so both say exactly the same thing. Symbols carry the meaning without colour (docs/03 §3).

import { VERDICT_INFO } from "../domain/verdict.ts";
import type { CheckRecord } from "../loop/record.ts";
import type { LoopEvent } from "../loop/check-guide.ts";

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
