// FR-51 score (denominator decided 17 Nov 2026):
//   score = 100 × (Passed + Verified fixed) ÷ (Passed + Verified fixed + Needs a human)
// Every other verdict is left out because Kane never got a fair go at it.
// If nothing counts, there is no score (never 0).

import { VERDICT_INFO, type Verdict } from "./verdict.ts";

export type Score =
  | {
      kind: "score";
      /** Whole number 0–100, rounded to the nearest whole number. */
      value: number;
      /** Passed + Verified fixed: the top of the fraction. */
      good: number;
      /** Passed + Verified fixed + Needs a human: the bottom of the fraction. */
      counted: number;
    }
  | {
      kind: "no_score";
      reason: string;
    };

export function score(verdicts: readonly Verdict[]): Score {
  const counted = verdicts.filter((v) => VERDICT_INFO[v].countsInScore).length;
  if (counted === 0) {
    return {
      kind: "no_score",
      reason: "No step could be fully checked, so there is nothing to score.",
    };
  }
  const good = verdicts.filter((v) => v === "passed" || v === "verified_fixed").length;
  return { kind: "score", value: Math.round((100 * good) / counted), good, counted };
}

/** Plain-English formula shown next to the score (FR-51 "shown with the formula"). */
export function explainScore(s: Score): string {
  if (s.kind === "no_score") return s.reason;
  return `${s.good} of ${s.counted} checked steps work (passed or verified fixed) = ${s.value}`;
}
