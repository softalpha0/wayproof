// The web app's request handling (C-3 screens + C-4 runner API, TDD.md §9, §12), on Node's own http server.
// Protections: same-site check on every POST (another website can't spend credits), 64 KB body limit,
// strict input checks, daily limits + optional access codes (BR-9), security headers, reports always
// public copies (BR-7), file paths checked so nothing outside a run folder is served.

import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { checkUrl, cleanText, normalizeDomain, type Llm, type RunStore } from "@wayproof/engine";
import { errorPage, homePage, howItWorksPage, LIVE_JS, livePage, setupPage } from "./pages.ts";
import type { RunManager } from "./runs.ts";

export interface AppDeps {
  store: RunStore;
  runs: RunManager;
  llm: Llm;
  prepare: (guideUrl: string, allowed: string[]) => Promise<
    { ok: true; title: string; steps: import("@wayproof/engine").GuideStep[]; allowed: string[]; suggestedDomains: string[] } | { ok: false; code: string; why: string }
  >;
  published: { label: string; url: string }[];
}

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

function send(res: ServerResponse, status: number, body: string, type = "text/html; charset=utf-8", extra: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": type, ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location, ...SECURITY_HEADERS });
  res.end();
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) return undefined;
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

/** A POST must come from this site (Origin, or Referer as a fallback). */
function sameSite(req: IncomingMessage): boolean {
  const host = req.headers.host;
  const origin = req.headers.origin ?? req.headers.referer;
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function parseAllow(text: string): { ok: true; domains: string[] } | { ok: false; why: string } {
  const domains: string[] = [];
  for (const raw of text.split(",").map((d) => d.trim()).filter(Boolean)) {
    const n = normalizeDomain(raw);
    if (!n.ok) return { ok: false, why: n.why };
    if (!domains.includes(n.domain)) domains.push(n.domain);
  }
  return { ok: true, domains };
}

const RUN_ID = /^web-[0-9TZ-]+-[0-9a-f]{6}$/;

export function createApp(deps: AppDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? "/", "http://local");
      const path = url.pathname;
      const visitor = deps.runs.visitorKey(req.socket.remoteAddress ?? "unknown");

      if (req.method === "GET" && path === "/") return send(res, 200, homePage(deps.published));
      if (req.method === "GET" && path === "/how-it-works") return send(res, 200, howItWorksPage());
      if (req.method === "GET" && path === "/static/live.js") return send(res, 200, LIVE_JS, "text/javascript; charset=utf-8");
      if (req.method === "GET" && path === "/api/health") {
        return send(res, 200, JSON.stringify({ runner: true, claudeKey: Boolean(process.env["ANTHROPIC_API_KEY"]) }), "application/json");
      }

      // S-02 Set up check: fetch + extract only (Claude cost, no Kane credits) — FR-1…FR-3
      if (req.method === "GET" && path === "/check/new") {
        const guideUrl = (url.searchParams.get("url") ?? "").trim();
        const allow = parseAllow(url.searchParams.get("allow") ?? "");
        if (!allow.ok) return send(res, 400, errorPage("ERR-DOMAIN-INVALID", allow.why));
        let host = "";
        try {
          host = new URL(guideUrl).hostname;
        } catch {
          // reported below
        }
        if (guideUrl.length > 2048 || !host || !checkUrl(guideUrl, [host]).ok) return send(res, 400, errorPage("ERR-URL-INVALID"));
        if (!deps.runs.takeQuota(visitor, "prepare")) return send(res, 429, errorPage("ERR-LIMIT", "Try again tomorrow, open a published report, or run Wayproof yourself."));
        const prepared = await deps.prepare(guideUrl, allow.domains);
        if (!prepared.ok) return send(res, prepared.code === "ERR-URL-INVALID" ? 400 : 422, errorPage(prepared.code, prepared.why));
        const saved = deps.runs.savePrepared({ guideUrl, title: prepared.title, steps: prepared.steps, allowed: prepared.allowed, suggestedDomains: prepared.suggestedDomains });
        return send(res, 200, setupPage(saved, { codeRequired: deps.runs.codeRequired() }));
      }

      // Start a check — FR-5, FR-6, BR-9
      if (req.method === "POST" && path === "/api/runs") {
        if (!sameSite(req)) return send(res, 403, errorPage("ERR-ORIGIN"));
        const form = await readForm(req);
        if (!form) return send(res, 413, errorPage("ERR-URL-INVALID", "The request was too large."));
        const prepared = deps.runs.getPrepared(form.get("prepared") ?? "");
        if (!prepared) return send(res, 404, errorPage("ERR-NOT-FOUND", "That check setup has expired. Please paste the guide link again."));
        const allow = parseAllow(form.get("allow") ?? "");
        if (!allow.ok) return send(res, 400, setupPage(prepared, { codeRequired: deps.runs.codeRequired(), error: allow.why }));
        if (deps.runs.codeRequired()) {
          if (!deps.runs.codeValid(form.get("code") ?? undefined)) return send(res, 403, setupPage(prepared, { codeRequired: true, error: "That access code isn't valid or has been used up." }));
        } else if (!deps.runs.takeQuota(visitor, "run")) {
          return send(res, 429, errorPage("ERR-LIMIT", "Open a published report or run Wayproof yourself (see GitHub)."));
        }
        const runId = deps.runs.enqueue(prepared, allow.domains);
        return redirect(res, `/run/${runId}`);
      }

      // S-03 Live check + SSE (FR-27)
      const live = path.match(/^\/run\/([^/]+)$/);
      if (req.method === "GET" && live) {
        const runId = live[1]!;
        if (!RUN_ID.test(runId) || (!deps.runs.known(runId) && !existsSync(join(deps.store.dir(runId), "run.json")))) return send(res, 404, errorPage("ERR-NOT-FOUND"));
        if (!deps.runs.known(runId)) return redirect(res, `/report/${runId}`);
        return send(res, 200, livePage(runId));
      }
      const events = path.match(/^\/api\/runs\/([^/]+)\/events$/);
      if (req.method === "GET" && events) {
        const runId = events[1]!;
        if (!RUN_ID.test(runId) || !deps.runs.known(runId)) return send(res, 404, JSON.stringify({ code: "ERR-NOT-FOUND", message: "We couldn't find that report." }), "application/json");
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", ...SECURITY_HEADERS });
        const write = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
        const stop = deps.runs.subscribe(runId, (e) => {
          write(e);
          if (e.type === "run_finished" || e.type === "run_failed") res.end();
        });
        const beat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
        req.on("close", () => {
          clearInterval(beat);
          stop();
        });
        return;
      }

      // S-04 Proof Report and its raw Kane output (always the public copy)
      const report = path.match(/^\/report\/([^/]+)(?:\/(kane\/[A-Za-z0-9.-]+\.ndjson))?$/);
      if (req.method === "GET" && report) {
        const runId = report[1]!;
        if (!RUN_ID.test(runId)) return send(res, 404, errorPage("ERR-NOT-FOUND"));
        const dir = deps.store.dir(runId);
        if (report[2]) {
          const file = join(dir, report[2]);
          if (!existsSync(file)) return send(res, 404, "not found", "text/plain; charset=utf-8");
          return send(res, 200, cleanText(readFileSync(file, "utf8")), "application/x-ndjson; charset=utf-8");
        }
        const html = join(dir, "report.html");
        if (!existsSync(html)) {
          return deps.runs.known(runId) && !deps.runs.isFinished(runId) ? redirect(res, `/run/${runId}`) : send(res, 404, errorPage("ERR-NOT-FOUND"));
        }
        // Links inside the report are relative to the run folder; serve them under /report/<id>/.
        const body = cleanText(readFileSync(html, "utf8")).replace(/href="kane\//g, `href="/report/${runId}/kane/`);
        return send(res, 200, body);
      }

      return send(res, 404, errorPage("ERR-NOT-FOUND"));
    } catch (err) {
      console.error(err); // full error in the server log only (TDD §16)
      if (!res.headersSent) send(res, 500, errorPage("ERR-UNEXPECTED", "Please try again later."));
      else res.end();
    }
  };
}
