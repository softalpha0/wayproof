// Ask Claude for JSON, check it, retry once, then give up with ERR-AI (CLAUDE.md, 04-SRS §4).
// Every answer goes through two checks: the JSON shape (Zod), then Wayproof's own rules in code.
// On the retry Claude is told exactly what was wrong.

import type { Llm, LlmRequest, LlmUsage } from "./llm.ts";

/** Returns undefined if the answer is acceptable, or a plain sentence saying what is wrong. */
export type AnswerCheck<T> = (value: T) => string | undefined;

export interface AskSuccess<T> {
  ok: true;
  value: T;
  model: string;
  fallbackUsed: boolean;
  attempts: number;
  usage: LlmUsage;
}

export interface AskFailure {
  ok: false;
  code: "ERR-AI";
  why: string;
  attempts: number;
  usage: LlmUsage;
}

export type AskResult<T> = AskSuccess<T> | AskFailure;

const MAX_ATTEMPTS = 2; // one try + one retry

export async function askJson<T>(llm: Llm, request: LlmRequest<T>, check: AnswerCheck<T>): Promise<AskResult<T>> {
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let user = request.user;
  let lastProblem = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await llm.call({ ...request, user });
    if (response.usage) {
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
    }

    if (!response.ok) {
      // A refusal (after any fallback) or an API error is not fixed by asking again.
      if (response.kind === "refusal" || response.kind === "api_error") {
        return { ok: false, code: "ERR-AI", why: response.why, attempts: attempt, usage };
      }
      lastProblem = response.why;
    } else {
      const parsed = request.schema.safeParse(response.value);
      const problem = parsed.success ? check(parsed.data) : `The answer did not match the required shape: ${parsed.error.message}`;
      if (problem === undefined && parsed.success) {
        return { ok: true, value: parsed.data, model: response.model, fallbackUsed: response.fallbackUsed, attempts: attempt, usage };
      }
      lastProblem = problem ?? "The answer was rejected.";
    }

    user = `${request.user}\n\n<previous_answer_rejected>\n${lastProblem}\nAnswer again, following every rule.\n</previous_answer_rejected>`;
  }

  return { ok: false, code: "ERR-AI", why: `Claude's answer was rejected twice. Last problem: ${lastProblem}`, attempts: MAX_ATTEMPTS, usage };
}

/** Marks text from websites or Kane as data, so instructions hidden inside it are not followed. */
export function untrusted(tag: string, text: string): string {
  const safe = text.replaceAll(`</${tag}>`, `<\\/${tag}>`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}
