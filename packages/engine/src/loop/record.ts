// What one guide check records (TDD.md §11, D-1): saved as run.json after every attempt,
// so nothing is lost if the process stops halfway. The report builder (C-9) reads only this.

import { copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import type { Verdict } from "../domain/verdict.ts";
import type { KaneOutcomeKind } from "../kane/outcome.ts";

export type AttemptKind = "original" | "flaky_rerun" | "check_rewrite" | "after_fix" | "timeout_retry";

export interface KaneAttemptRecord {
  exitCode: number | undefined;
  outcome: KaneOutcomeKind;
  why: string;
  summary: string | undefined;
  reason: string | undefined;
  reasonCode: string | undefined;
  finalState: Record<string, unknown> | undefined;
  /** Kane's own figure (run_end.credits_consumed). */
  credits: number | undefined;
  testUrl: string | undefined;
  durationMs: number;
  /** Progress lines Kane reported ("done"/"failed"). */
  steps: { status: string; remark: string }[];
  /** Paths relative to the run folder (BR-8). */
  rawLog: string | undefined;
  evidence: string | undefined;
}

export interface AttemptRecord {
  n: number;
  kind: AttemptKind;
  /** The guide wording this attempt checked (original, or the fix being proven). */
  stepText: string;
  objective: string;
  url: string;
  startedAt: string;
  endedAt: string;
  kane?: KaneAttemptRecord;
  judge?: { outcome: string; reason: string; quote: string; model: string };
  fix?: { newStepText: string; rationale: string; model: string };
  error?: { code: string; why: string };
}

export interface CheckRecord {
  id: string;
  /** Guide step numbers this check covers (up to 3 consecutive steps). */
  stepNumbers: number[];
  /** Original guide wording of those steps. */
  stepText: string;
  /** What the user should see — never changed by a fix (BR-5). */
  expected: string;
  needsWallet: boolean;
  verdict: Verdict | undefined;
  /** Plain sentence explaining the verdict. */
  verdictWhy: string | undefined;
  /** ERR- code when the verdict came from an error. */
  errorCode: string | undefined;
  /** New wording proven by Kane (only when verdict is verified_fixed) — FR-53. */
  correctedText: string | undefined;
  attempts: AttemptRecord[];
}

export interface RunRecord {
  id: string;
  source: "cli" | "web";
  createdAt: string;
  finishedAt: string | undefined;
  status: "running" | "finished" | "failed";
  guideUrl: string;
  guideTitle: string | undefined;
  allowedDomains: string[];
  /** Kane credit budget for this check (BR-10). */
  creditBudget: number;
  /** Sum of Kane's credits_consumed. */
  kaneCredits: number;
  /** What Wayproof counts against the budget: credits_consumed + 2 per run (TC-14 margin). */
  creditsCounted: number;
  kaneRuns: number;
  claudeTokens: { input: number; output: number };
  /** Set when the whole run could not start (e.g. ERR-FETCH, ERR-NO-STEPS). */
  error: { code: string; why: string } | undefined;
  steps: { n: number; action: string; expected: string; needsWallet: boolean; url: string | null }[];
  checks: CheckRecord[];
}

export function newRunId(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Keeps each run in its own folder: <root>/<id>/run.json, kane/, evidence/. */
export class RunStore {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }

  dir(runId: string): string {
    return join(this.root, runId);
  }

  async save(run: RunRecord): Promise<void> {
    const dir = this.dir(run.id);
    await mkdir(dir, { recursive: true });
    const file = join(dir, "run.json");
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(run, null, 2) + "\n");
    await rename(tmp, file); // atomic: a crash never leaves half a file
  }

  rawLogPath(runId: string, checkId: string, attempt: number): string {
    return join(this.dir(runId), "kane", `${checkId}-attempt-${attempt}.ndjson`);
  }

  /** Copies Kane's evidence pack into the run folder so the report works on its own (BR-8). */
  async copyEvidence(runId: string, source: string | undefined, name: string): Promise<string | undefined> {
    if (!source) return undefined;
    const from = source.startsWith("~") ? join(homedir(), source.slice(1)) : source;
    if (!existsSync(from)) return undefined;
    const dir = join(this.dir(runId), "evidence");
    await mkdir(dir, { recursive: true });
    const to = join(dir, `${name}.evidence`);
    await copyFile(from, to);
    return this.relative(runId, to);
  }

  relative(runId: string, path: string): string {
    return relative(this.dir(runId), path).split("\\").join("/");
  }
}
