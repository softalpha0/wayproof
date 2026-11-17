// The "Llm" port (TDD.md §10): what the rest of Wayproof needs from Claude.
// The real implementation is anthropic.ts; tests use a fake that returns canned answers.

import type * as z from "zod";

export type PromptName = "extract" | "plan" | "judge" | "fix";
export type Effort = "low" | "medium" | "high";

export interface LlmRequest<T> {
  name: PromptName;
  system: string;
  user: string;
  /** Shape of the JSON answer. Kept simple: stricter rules are checked in code afterwards. */
  schema: z.ZodType<T>;
  effort: Effort;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export type LlmResponse<T> =
  | {
      ok: true;
      value: T;
      /** The model that actually answered (differs from the requested one if a fallback ran). */
      model: string;
      fallbackUsed: boolean;
      usage: LlmUsage;
    }
  | {
      ok: false;
      kind: "refusal" | "truncated" | "invalid" | "api_error";
      why: string;
      model?: string;
      usage?: LlmUsage;
    };

export interface Llm {
  call<T>(request: LlmRequest<T>): Promise<LlmResponse<T>>;
}
