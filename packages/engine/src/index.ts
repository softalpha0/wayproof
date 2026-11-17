// Public entry point of the Wayproof engine (TDD.md §5, §10).
// Each feature adds its exports here as it is built.
export { VERDICTS, VERDICT_INFO, isVerdict, type Verdict, type VerdictInfo } from "./domain/verdict.ts";
export { score, explainScore, type Score } from "./domain/score.ts";
export { buildKaneArgs, InvalidKaneSpecError, type KaneRunSpec } from "./kane/args.ts";
export { parseKaneOutput, RunEndSchema, type KaneOutput, type ProgressEvent, type RunEnd } from "./kane/output.ts";
export { classifyKaneRun, type ClassifyInput, type KaneOutcome, type KaneOutcomeKind } from "./kane/outcome.ts";
export { runKane, type KaneRunResult, type RunKaneOptions } from "./kane/run.ts";
export { checkUrl, normalizeDomain, type DomainResult, type UrlResult } from "./safety/domains.ts";
export { checkObjective, checkRemark, SAFETY_SENTENCE, type ObjectiveResult, type RemarkResult } from "./safety/wallet.ts";
export { gateAfterRun, gateBeforeRun, type GateDecision, type GateInput } from "./safety/gate.ts";
export { fetchGuide, htmlToText, mainText, USER_AGENT, type FetchGuideOptions, type FetchGuideResult } from "./fetch/guide.ts";
export type { Effort, Llm, LlmRequest, LlmResponse, LlmUsage, PromptName } from "./claude/llm.ts";
export { AnthropicLlm, type AnthropicLlmOptions } from "./claude/anthropic.ts";
export { askJson, untrusted, type AnswerCheck, type AskFailure, type AskResult, type AskSuccess } from "./claude/ask.ts";
export {
  extractSteps,
  judgeRun,
  planObjective,
  proposeFix,
  ExtractSchema,
  FixSchema,
  JudgeSchema,
  PlanSchema,
  type ExtractAnswer,
  type ExtractResult,
  type FixAnswer,
  type GuideStep,
  type JudgeAnswer,
  type JudgeInput,
  type PlanAnswer,
  type PlannedCheck,
  type PlanResult,
  type ProposedFix,
} from "./claude/prompts.ts";
export {
  newRunId,
  RunStore,
  type AttemptKind,
  type AttemptRecord,
  type CheckRecord,
  type KaneAttemptRecord,
  type RunRecord,
} from "./loop/record.ts";
export { buildReport, escapeHtml, formatDate, writeReport, type BuiltReport } from "./report/build.ts";
export {
  allowedSites,
  buildChecks,
  checkGuide,
  CREDIT_MARGIN_PER_RUN,
  DEFAULT_CREDIT_BUDGET,
  MAX_KANE_RUNS_PER_CHECK,
  type CheckGuideOptions,
  type LoopDeps,
  type LoopEvent,
} from "./loop/check-guide.ts";
