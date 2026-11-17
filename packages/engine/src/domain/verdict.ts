// Verdicts: the final result of one check (docs/03 §5 legend; 04-SRS BR-1, BR-6, BR-10, FR-3, FR-30).
// "Running" and "Fixing" are live states shown while a check is in progress, not verdicts.

export const VERDICTS = [
  "passed",
  "verified_fixed",
  "needs_human",
  "not_checked_wallet",
  "not_checked_outside_domains",
  "couldnt_check",
  "not_run_budget",
  "stopped_by_user",
] as const;

export type Verdict = (typeof VERDICTS)[number];

export interface VerdictInfo {
  /** Words shown to people (status is never colour alone, NFR-5). */
  label: string;
  /** Icon used in the terminal and next to the label on the web. */
  icon: string;
  /** Whether the verdict counts in the score (FR-51, decided 17 Nov 2026). */
  countsInScore: boolean;
}

export const VERDICT_INFO: Readonly<Record<Verdict, VerdictInfo>> = {
  passed: { label: "Passed", icon: "✔", countsInScore: true },
  verified_fixed: { label: "Verified fixed", icon: "🔧", countsInScore: true },
  needs_human: { label: "Needs a human", icon: "✖", countsInScore: true },
  not_checked_wallet: { label: "Not checked — wallet step", icon: "🔒", countsInScore: false },
  not_checked_outside_domains: {
    label: "Not checked — outside allowed domains",
    icon: "🚧",
    countsInScore: false,
  },
  couldnt_check: { label: "Couldn't check", icon: "⚠", countsInScore: false },
  not_run_budget: { label: "Not run — budget reached", icon: "⌛", countsInScore: false },
  stopped_by_user: { label: "Stopped by you", icon: "⏹", countsInScore: false },
};

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}
