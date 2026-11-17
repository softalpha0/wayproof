// Web app (C-3, C-4): screens, limits, access codes, same-site check, SSE replay, reports (always public).
// A real http server on a random port; the guide check itself is a fake, so no credits are spent.
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { formatEvent, RunStore, type CheckGuideOptions, type GuideStep, type LoopEvent, type RunRecord } from "@wayproof/engine";
import { createApp } from "../src/app.ts";
import { hashCode, RunManager } from "../src/runs.ts";

const SAMPLE = fileURLToPath(new URL("../../../fixtures/runs/sample-layout-run.json", import.meta.url));
const steps: GuideStep[] = [
  { n: 1, action: "Type <b>your</b> address", expected: "Approvals load", needsWallet: false, url: "https://revoke.cash" },
  { n: 2, action: "Click Revoke", expected: "Revoked", needsWallet: true, url: "https://revoke.cash" },
];

let server: Server | undefined;
afterEach(() => server?.close());

async function start(opts: { codes?: string[]; dailyRuns?: number; dailyPrepares?: number; runGuide?: (o: CheckGuideOptions, on: (e: LoopEvent) => void) => Promise<RunRecord> } = {}) {
  const store = new RunStore(mkdtempSync(join(tmpdir(), "wayproof-web-")));
  const calls: CheckGuideOptions[] = [];
  let prepares = 0;
  const runGuide =
    opts.runGuide ??
    (async (o: CheckGuideOptions, on: (e: LoopEvent) => void) => {
      calls.push(o);
      const run = { ...(JSON.parse(readFileSync(SAMPLE, "utf8")) as RunRecord), id: o.runId! };
      on({ type: "run_started", runId: run.id, guideUrl: o.guideUrl });
      on({ type: "check_done", check: run.checks[0]! });
      on({ type: "run_finished", run });
      await store.save(run);
      return run;
    });
  const runs = new RunManager({
    store,
    runGuide,
    formatEvent,
    creditBudget: 300,
    accessCodeHashes: (opts.codes ?? []).map(hashCode),
    visitorDailyRuns: opts.dailyRuns ?? 2,
    visitorDailyPrepares: opts.dailyPrepares ?? 10,
  });
  const app = createApp({
    store,
    runs,
    llm: { call: async () => ({ ok: false, kind: "api_error", why: "unused" }) },
    prepare: async (guideUrl, allowed) => {
      prepares++;
      if (guideUrl.includes("404")) return { ok: false, code: "ERR-FETCH", why: "The site answered HTTP 404." };
      return { ok: true, title: "How to revoke", steps, allowed: ["revoke.cash", ...allowed], suggestedDomains: ["etherscan.io"] };
    },
    published: [{ label: "Revoke.cash guide · main report", url: "https://softalpha0.github.io/wayproof/reports/revoke-cash-2026-11-17/report.html" }],
  });
  server = createServer((req, res) => void app(req, res));
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: Record<string, string>, origin: string | null = base) =>
    fetch(base + path, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
      body: new URLSearchParams(body).toString(),
    });
  const preparedId = async () => {
    const html = await (await fetch(`${base}/check/new?url=${encodeURIComponent("https://revoke.cash/learn/guide")}`)).text();
    return html.match(/name="prepared" value="([^"]+)"/)?.[1] ?? "";
  };
  return { base, post, preparedId, calls, store, runs, prepareCount: () => prepares };
}

describe("screens", () => {
  it("Home (S-01): guide input, the no-wallet promise, published reports, security headers", async () => {
    const t = await start();
    const r = await fetch(t.base + "/");
    const html = await r.text();
    expect(html).toContain('<input id="url" name="url" type="url" required');
    expect(html).toContain("Wayproof never connects a wallet");
    expect(html).toContain("Revoke.cash guide · main report");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("Set up check (S-02): steps shown, wallet steps marked, guide text escaped, suggested sites offered", async () => {
    const t = await start();
    const html = await (await fetch(`${t.base}/check/new?url=${encodeURIComponent("https://revoke.cash/learn/guide")}`)).text();
    expect(html).toContain("2 steps found</b> · 1 can be checked · 1 need a wallet");
    expect(html).toContain("wallet step — not checked");
    expect(html).toContain("Type &lt;b&gt;your&lt;/b&gt; address");
    expect(html).toContain("etherscan.io");
    expect(html).toMatch(/name="prepared" value="prep-[0-9a-f]+"/);
  });

  it("bad input → the plain-English error page (ERR-URL-INVALID, ERR-DOMAIN-INVALID, ERR-FETCH)", async () => {
    const t = await start();
    expect(await (await fetch(`${t.base}/check/new?url=http://revoke.cash`)).text()).toContain("starting with https://");
    expect((await fetch(`${t.base}/check/new?url=${encodeURIComponent("https://x.org/a")}&allow=${encodeURIComponent("https://bad/x")}`)).status).toBe(400);
    const r = await fetch(`${t.base}/check/new?url=${encodeURIComponent("https://revoke.cash/404")}`);
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("We couldn&#39;t open that page"); // apostrophes are written in their escaped form
  });

  it("How it works (S-09) and unknown pages (S-08)", async () => {
    const t = await start();
    expect(await (await fetch(t.base + "/how-it-works")).text()).toContain("Fix and prove");
    const r = await fetch(t.base + "/nope");
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("ERR-NOT-FOUND");
  });
});

describe("starting a check", () => {
  it("Start → queued run → live page → SSE replays every event → the Proof Report (public copy)", async () => {
    const t = await start();
    const r = await t.post("/api/runs", { prepared: await t.preparedId(), allow: "revoke.cash" });
    expect(r.status).toBe(303);
    const runPath = r.headers.get("location")!;
    expect(runPath).toMatch(/^\/run\/web-/);
    const runId = runPath.split("/")[2]!;

    // the run used exactly the steps shown on S-02 (no second extract)
    await new Promise((res) => setTimeout(res, 200));
    expect(t.calls[0]?.prepared?.steps).toEqual(steps);
    expect(t.calls[0]?.source).toBe("web");

    const live = await (await fetch(t.base + runPath)).text();
    expect(live).toContain('<script src="/static/live.js" defer></script>');

    const sse = await (await fetch(`${t.base}/api/runs/${runId}/events`)).text();
    const events = sse.split("\n\n").filter((b) => b.startsWith("data: ")).map((b) => JSON.parse(b.slice(6)) as { type: string; line?: string });
    expect(events.map((e) => e.type)).toEqual(["queued", "run_started", "check_done", "run_finished"]);
    expect(events.find((e) => e.type === "check_done")?.line).toContain("verified fixed");

    const report = await (await fetch(`${t.base}/report/${runId}`)).text();
    expect(report).toContain("Kane's sealed evidence pack is kept private");
    expect(report).not.toContain('href="evidence/');
    expect(report).toContain(`href="/report/${runId}/kane/`);
  });

  it("a form posted from another website is refused — nobody else can spend your credits", async () => {
    const t = await start();
    const id = await t.preparedId();
    expect((await t.post("/api/runs", { prepared: id }, "https://evil.example.com")).status).toBe(403);
    expect((await t.post("/api/runs", { prepared: id }, null)).status).toBe(403);
    expect(t.calls).toHaveLength(0);
  });

  it("access codes: wrong code refused (ERR-ACCESS), right code starts the check (FR-6)", async () => {
    const t = await start({ codes: ["judge-2026"] });
    const id = await t.preparedId();
    const wrong = await t.post("/api/runs", { prepared: id, code: "nope" });
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).toContain("That access code isn&#39;t valid");
    const right = await t.post("/api/runs", { prepared: id, code: "judge-2026" });
    expect(right.status).toBe(303);
  });

  it("daily limits (BR-9): runs and set-ups per visitor", async () => {
    const t = await start({ dailyRuns: 1, dailyPrepares: 2 });
    expect((await t.post("/api/runs", { prepared: await t.preparedId() })).status).toBe(303);
    expect((await t.post("/api/runs", { prepared: await t.preparedId() })).status).toBe(429);
    expect((await fetch(`${t.base}/check/new?url=${encodeURIComponent("https://revoke.cash/learn/guide")}`)).status).toBe(429);
    expect(t.prepareCount()).toBe(2);
  });

  it("a set-up can only be started once", async () => {
    const t = await start();
    const id = await t.preparedId();
    expect((await t.post("/api/runs", { prepared: id })).status).toBe(303);
    expect((await t.post("/api/runs", { prepared: id })).status).toBe(404);
  });

  it("one Kane run at a time: a second check waits its turn (ADR-007)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const order: string[] = [];
    const t = await start({
      dailyRuns: 5,
      runGuide: async (o, on) => {
        order.push(`start ${o.runId}`);
        if (order.length === 1) await gate;
        const run = { ...(JSON.parse(readFileSync(SAMPLE, "utf8")) as RunRecord), id: o.runId! };
        on({ type: "run_finished", run });
        order.push(`end ${o.runId}`);
        return run;
      },
    });
    const a = (await t.post("/api/runs", { prepared: await t.preparedId() })).headers.get("location")!.split("/")[2]!;
    const b = (await t.post("/api/runs", { prepared: await t.preparedId() })).headers.get("location")!.split("/")[2]!;
    expect(t.runs.position(a)).toBe(0);
    expect(t.runs.position(b)).toBe(1);
    expect(order).toEqual([`start ${a}`]);
    release();
    await new Promise((res) => setTimeout(res, 200));
    expect(order).toEqual([`start ${a}`, `end ${a}`, `start ${b}`, `end ${b}`]);
  });
});

describe("files served", () => {
  it("never serves anything outside a run folder", async () => {
    const t = await start();
    for (const p of ["/report/../../package.json", "/report/web-x/kane/../../run.json", "/report/web-2026-11-18T00-00-00Z-abcdef/evidence/a.evidence", "/run/..%2F..%2Fetc"]) {
      expect((await fetch(t.base + p)).status, p).toBe(404);
    }
  });
});
