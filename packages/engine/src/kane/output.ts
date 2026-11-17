// Reads Kane's --agent output: one JSON object per line (NDJSON).
// Built against real output recorded on 16 Nov 2026 (fixtures/kane/, TDD.md §13.1 "Observed").
// - Unknown event types (stream_start, bifurcation, coverage, …) are kept but never break parsing.
// - Unreadable lines are counted, not fatal.
// - The credits field is `credits_consumed` (Kane's docs say `credits`, which does not exist).
// - The evidence pack path comes from the `coverage` event's `pack`.

import * as z from "zod";

export const RunEndSchema = z.looseObject({
  type: z.literal("run_end"),
  status: z.string(),
  summary: z.string().optional(),
  one_liner: z.string().optional(),
  final_state: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
  reason_code: z.string().optional(),
  result_code: z.union([z.number(), z.string()]).optional(),
  duration: z.number().optional(),
  credits_consumed: z.number().optional(),
  session_dir: z.string().optional(),
  run_dir: z.string().optional(),
  run_id: z.string().optional(),
  test_url: z.string().optional(),
});
export type RunEnd = z.infer<typeof RunEndSchema>;

const ProgressSchema = z.looseObject({
  step: z.number(),
  status: z.string(),
  remark: z.string().optional(),
});
export type ProgressEvent = z.infer<typeof ProgressSchema>;

const CoverageSchema = z.looseObject({
  type: z.literal("coverage"),
  pack: z.string().optional(),
});

export interface KaneOutput {
  /** Every line that parsed as a JSON object, in order. */
  events: Record<string, unknown>[];
  /** Step-by-step progress lines ({step, status, remark}); they have no `type` field. */
  progress: ProgressEvent[];
  /** The last valid run_end event, if any. */
  runEnd: RunEnd | undefined;
  /** True when a run_end line exists but does not have the expected shape. */
  runEndInvalid: boolean;
  /** Path of Kane's .evidence pack, from the coverage event. */
  evidencePath: string | undefined;
  /** Lines that were not valid JSON objects. */
  badLines: number;
}

export function parseKaneOutput(stdout: string): KaneOutput {
  const out: KaneOutput = {
    events: [],
    progress: [],
    runEnd: undefined,
    runEndInvalid: false,
    evidencePath: undefined,
    badLines: 0,
  };

  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      out.badLines++;
      continue;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      out.badLines++;
      continue;
    }
    const event = value as Record<string, unknown>;
    out.events.push(event);

    if (event["type"] === "run_end") {
      const parsed = RunEndSchema.safeParse(event);
      if (parsed.success) {
        out.runEnd = parsed.data;
        out.runEndInvalid = false;
      } else if (out.runEnd === undefined) {
        out.runEndInvalid = true;
      }
      continue;
    }

    if (event["type"] === "coverage") {
      const parsed = CoverageSchema.safeParse(event);
      if (parsed.success && parsed.data.pack) out.evidencePath = parsed.data.pack;
      continue;
    }

    if (event["type"] === undefined) {
      const parsed = ProgressSchema.safeParse(event);
      if (parsed.success) out.progress.push(parsed.data);
    }
  }

  return out;
}
