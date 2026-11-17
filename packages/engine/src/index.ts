// Public entry point of the Wayproof engine (TDD.md §5, §10).
// Each feature adds its exports here as it is built.
export { VERDICTS, VERDICT_INFO, isVerdict, type Verdict, type VerdictInfo } from "./domain/verdict.ts";
export { score, explainScore, type Score } from "./domain/score.ts";
export { buildKaneArgs, InvalidKaneSpecError, type KaneRunSpec } from "./kane/args.ts";
export { parseKaneOutput, RunEndSchema, type KaneOutput, type ProgressEvent, type RunEnd } from "./kane/output.ts";
export { classifyKaneRun, type ClassifyInput, type KaneOutcome, type KaneOutcomeKind } from "./kane/outcome.ts";
export { runKane, type KaneRunResult, type RunKaneOptions } from "./kane/run.ts";
