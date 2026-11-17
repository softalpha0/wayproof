// Sorts one finished Kane run into exactly one outcome (FR-21, BR-3, BR-6, BR-11).
// Rules come from Kane's documented exit codes [Kane doc] and the day-0 runs [Observed]:
//   - a bot check (captcha) comes back as exit 1 with reason_code "blocker.captcha" → blocked, not a defect
//   - an ordinary failure is exit 1 → failed (the judge decides later whether it is a real defect)
//   - exit 0 counts as passed only if run_end.status is "passed" (BR-3: a failure can never become a pass)

import type { KaneOutput } from "./output.ts";

export type KaneOutcomeKind = "passed" | "failed" | "blocked" | "error" | "timeout" | "stopped_safely";

export interface KaneOutcome {
  kind: KaneOutcomeKind;
  /** One plain-English sentence saying why. */
  why: string;
}

export interface ClassifyInput {
  /** Process exit code; undefined if the process was killed or never started. */
  exitCode: number | undefined;
  output: KaneOutput;
  /** True when Wayproof's own stopwatch stopped Kane. */
  stoppedByStopwatch?: boolean;
  /** Set when the wallet tripwire stopped Kane (BR-1, FR-26). Wins over everything else. */
  stoppedForSafety?: string;
}

export function classifyKaneRun({ exitCode, output, stoppedByStopwatch, stoppedForSafety }: ClassifyInput): KaneOutcome {
  if (stoppedForSafety !== undefined) {
    return { kind: "stopped_safely", why: `Stopped safely before any wallet step. ${stoppedForSafety}` };
  }
  if (stoppedByStopwatch) {
    return { kind: "timeout", why: "Wayproof stopped Kane because it ran past the time limit." };
  }
  if (exitCode === 3) {
    return { kind: "timeout", why: "Kane reported a timeout or cancellation (exit code 3)." };
  }
  if (exitCode === 2) {
    return { kind: "error", why: "Kane reported an auth, setup or infrastructure error (exit code 2)." };
  }

  const runEnd = output.runEnd;
  if (runEnd === undefined) {
    return {
      kind: "error",
      why: output.runEndInvalid
        ? "Kane's run_end line did not have the expected shape."
        : "Kane finished without a run_end line.",
    };
  }

  if (runEnd.reason_code?.startsWith("blocker.")) {
    return {
      kind: "blocked",
      why: `Kane was blocked by the site (${runEnd.reason_code}${runEnd.reason ? `: ${runEnd.reason}` : ""}). This is not a problem with the guide.`,
    };
  }

  if (exitCode === 0) {
    if (runEnd.status === "passed") {
      return { kind: "passed", why: "Kane completed the objective (exit code 0, status passed)." };
    }
    return {
      kind: "failed",
      why: `Kane exited 0 but its run_end status was "${runEnd.status}", so this is not counted as a pass.`,
    };
  }

  if (exitCode === 1) {
    return {
      kind: "failed",
      why: `Kane could not complete the objective${runEnd.reason ? `: ${runEnd.reason}` : ""}.`,
    };
  }

  return {
    kind: "error",
    why: exitCode === undefined ? "Kane did not exit normally." : `Kane exited with an unexpected code (${exitCode}).`,
  };
}
