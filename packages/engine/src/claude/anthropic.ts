// The real Llm: calls Claude through the official Anthropic TypeScript SDK (C-7, TDD.md §13.2).
// - Model comes from the caller (ANTHROPIC_MODEL), never hard-coded; the key comes from ANTHROPIC_API_KEY.
// - JSON answers use structured outputs (output_config.format) so they arrive in the requested shape.
// - Claude Opus 5.5 rules: thinking is always on (no `thinking` field sent); effort set per prompt;
//   no prefill; stop_reason checked before the answer is used.
// - Refusal fallback (decided 17 Nov 2026): if the model declines, the API itself retries on another
//   Claude model ("fallbacks: default"); the answer records which model replied.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Llm, LlmRequest, LlmResponse } from "./llm.ts";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 16000;

export interface AnthropicLlmOptions {
  model: string;
  /** Defaults to the ANTHROPIC_API_KEY environment variable (read by the SDK). Never logged. */
  apiKey?: string;
  /** Turn the server-side refusal fallback off. Default: on. */
  disableFallback?: boolean;
}

export class AnthropicLlm implements Llm {
  readonly #client: Anthropic;
  readonly #model: string;
  readonly #fallback: boolean;

  constructor(options: AnthropicLlmOptions) {
    if (!options.model) throw new Error("No Claude model given. Set ANTHROPIC_MODEL (decided: claude-opus-5-5).");
    this.#client = options.apiKey ? new Anthropic({ apiKey: options.apiKey }) : new Anthropic();
    this.#model = options.model;
    this.#fallback = !options.disableFallback;
  }

  async call<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    let response;
    try {
      response = await this.#client.beta.messages.parse({
        model: this.#model,
        max_tokens: MAX_TOKENS,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: { effort: request.effort, format: zodOutputFormat(request.schema) },
        ...(this.#fallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      });
    } catch (err) {
      // The SDK already retried rate limits, overloads and network errors twice.
      if (err instanceof Anthropic.APIError) {
        return { ok: false, kind: "api_error", why: `Claude API error ${err.status ?? ""} ${err.type ?? ""}: ${err.message}`.trim() };
      }
      return { ok: false, kind: "api_error", why: `Could not reach Claude: ${err instanceof Error ? err.message : String(err)}` };
    }

    const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    const model = response.model;

    if (response.stop_reason === "refusal") {
      const d = response.stop_details;
      return {
        ok: false,
        kind: "refusal",
        why: `Claude declined${d?.category ? ` (${d.category})` : ""}${d?.explanation ? `: ${d.explanation}` : ""}.`,
        model,
        usage,
      };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, kind: "truncated", why: "Claude's answer was cut off (max_tokens).", model, usage };
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      return { ok: false, kind: "invalid", why: "Claude's answer was not valid JSON of the requested shape.", model, usage };
    }

    const fallbackUsed = (response.usage.iterations ?? []).some((entry) => entry.type === "fallback_message");
    return { ok: true, value: response.parsed_output as T, model, fallbackUsed, usage };
  }
}
