// The run manager (C-4): prepared checks, the queue (one Kane run at a time, ADR-007), live events for SSE,
// and the limits that protect Kane credits (BR-9, access codes).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { writeReport, type CheckGuideOptions, type GuideStep, type LoopEvent, type RunRecord, type RunStore } from "@wayproof/engine";

export interface Prepared {
  id: string;
  guideUrl: string;
  title: string;
  steps: GuideStep[];
  allowed: string[];
  suggestedDomains: string[];
  createdAt: number;
}

export interface LiveEvent {
  seq: number;
  type: LoopEvent["type"] | "queued";
  /** The same plain-English line the terminal prints. */
  line?: string;
  /** Present on check_done / run_finished so the page can show verdicts. */
  data?: unknown;
}

export type RunGuide = (options: CheckGuideOptions, onEvent: (e: LoopEvent) => void) => Promise<RunRecord>;

export interface RunManagerOptions {
  store: RunStore;
  runGuide: RunGuide;
  formatEvent: (e: LoopEvent) => string | undefined;
  creditBudget: number;
  /** sha256 hex of valid access codes. Empty = no code needed (local use), daily limit still applies. */
  accessCodeHashes: string[];
  visitorDailyRuns: number;
  visitorDailyPrepares: number;
  now?: () => number;
}

const PREPARED_TTL_MS = 30 * 60 * 1000;

export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}

export class RunManager {
  readonly options: RunManagerOptions;
  readonly #prepared = new Map<string, Prepared>();
  readonly #events = new Map<string, LiveEvent[]>();
  readonly #listeners = new Map<string, Set<(e: LiveEvent) => void>>();
  readonly #queue: string[] = [];
  readonly #pending = new Map<string, CheckGuideOptions>();
  readonly #finished = new Set<string>();
  readonly #usage = new Map<string, number>();
  #running: string | undefined;

  constructor(options: RunManagerOptions) {
    this.options = options;
  }

  #now(): number {
    return (this.options.now ?? Date.now)();
  }

  // ---- limits (BR-9) ----
  /** Visitor key: a hash of the address and the day — no personal data is kept (BR-7). */
  visitorKey(address: string): string {
    const day = new Date(this.#now()).toISOString().slice(0, 10);
    return createHash("sha256").update(`${address}|${day}`).digest("hex").slice(0, 32);
  }

  /** Counts one use of `kind` for this visitor; false if the daily limit is reached. */
  takeQuota(visitor: string, kind: "run" | "prepare"): boolean {
    const limit = kind === "run" ? this.options.visitorDailyRuns : this.options.visitorDailyPrepares;
    const key = `${kind}:${visitor}`;
    const used = this.#usage.get(key) ?? 0;
    if (used >= limit) return false;
    this.#usage.set(key, used + 1);
    return true;
  }

  codeRequired(): boolean {
    return this.options.accessCodeHashes.length > 0;
  }

  codeValid(code: string | undefined): boolean {
    if (!code) return false;
    const given = Buffer.from(hashCode(code), "hex");
    return this.options.accessCodeHashes.some((h) => {
      const known = Buffer.from(h, "hex");
      return known.length === given.length && timingSafeEqual(known, given);
    });
  }

  // ---- prepared checks (S-02) ----
  savePrepared(p: Omit<Prepared, "id" | "createdAt">): Prepared {
    for (const [id, old] of this.#prepared) if (this.#now() - old.createdAt > PREPARED_TTL_MS) this.#prepared.delete(id);
    const prepared: Prepared = { ...p, id: `prep-${randomBytes(9).toString("hex")}`, createdAt: this.#now() };
    this.#prepared.set(prepared.id, prepared);
    return prepared;
  }

  getPrepared(id: string): Prepared | undefined {
    const p = this.#prepared.get(id);
    if (!p || this.#now() - p.createdAt > PREPARED_TTL_MS) return undefined;
    return p;
  }

  // ---- queue (ADR-007: one Kane run at a time) ----
  /** Adds a run to the queue; returns its id. The prepared check can be used once. */
  enqueue(prepared: Prepared, allowedDomains: string[]): string {
    this.#prepared.delete(prepared.id);
    const runId = `web-${new Date(this.#now()).toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z")}-${randomBytes(3).toString("hex")}`;
    this.#pending.set(runId, {
      guideUrl: prepared.guideUrl,
      allowedDomains,
      creditBudget: this.options.creditBudget,
      source: "web",
      prepared: { title: prepared.title, steps: prepared.steps },
      runId,
    });
    this.#events.set(runId, []);
    this.#queue.push(runId);
    this.#announceQueue();
    void this.#next();
    return runId;
  }

  known(runId: string): boolean {
    return this.#events.has(runId);
  }

  isFinished(runId: string): boolean {
    return this.#finished.has(runId);
  }

  /** Position in the queue (1 = next), 0 = running now, undefined = not queued. */
  position(runId: string): number | undefined {
    if (this.#running === runId) return 0;
    const i = this.#queue.indexOf(runId);
    return i === -1 ? undefined : i + 1;
  }

  /** All events so far, then live ones until the run ends (SSE replay, FR-27). Returns an unsubscribe function. */
  subscribe(runId: string, listener: (e: LiveEvent) => void): () => void {
    for (const e of this.#events.get(runId) ?? []) listener(e);
    const set = this.#listeners.get(runId) ?? new Set();
    set.add(listener);
    this.#listeners.set(runId, set);
    return () => set.delete(listener);
  }

  #push(runId: string, e: Omit<LiveEvent, "seq">): void {
    const list = this.#events.get(runId);
    if (!list) return;
    const event: LiveEvent = { ...e, seq: list.length + 1 };
    list.push(event);
    for (const l of this.#listeners.get(runId) ?? []) l(event);
  }

  #announceQueue(): void {
    this.#queue.forEach((id, i) => {
      this.#push(id, { type: "queued", line: i === 0 && !this.#running ? "Starting…" : `Queued — position ${i + 1}. One Kane run happens at a time.` });
    });
  }

  async #next(): Promise<void> {
    if (this.#running) return;
    const runId = this.#queue.shift();
    if (!runId) return;
    const options = this.#pending.get(runId);
    if (!options) return;
    this.#running = runId;
    this.#announceQueue();
    try {
      const run = await this.options.runGuide(options, (event) => {
        const line = this.options.formatEvent(event);
        const data = event.type === "check_done" ? { check: event.check } : undefined;
        if (event.type !== "run_finished" && event.type !== "run_failed") this.#push(runId, { type: event.type, ...(line ? { line } : {}), ...(data ? { data } : {}) });
      });
      // Web reports are always public copies: never link Kane's evidence packs (they hold account details, BR-7).
      await writeReport(this.options.store, run, { publicCopy: true });
      this.#push(runId, {
        type: run.status === "failed" ? "run_failed" : "run_finished",
        line: run.status === "failed" ? `✖ ${run.error?.code ?? "ERR"}  ${run.error?.why ?? ""}` : "Finished — the Proof Report is ready.",
        data: { status: run.status },
      });
    } catch (err) {
      this.#push(runId, { type: "run_failed", line: `✖ ERR-UNEXPECTED  ${err instanceof Error ? err.message : String(err)}`, data: { status: "failed" } });
    } finally {
      this.#finished.add(runId);
      this.#pending.delete(runId);
      this.#running = undefined;
      void this.#next();
    }
  }
}
