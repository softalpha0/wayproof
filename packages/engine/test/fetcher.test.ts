// Guide fetcher (C-8): FR-2 fetch part, ERR-FETCH, BR-2 on every redirect.
// Uses a pretend web (no real sites), with small made-up pages.
import { describe, expect, it } from "vitest";
import { fetchGuide, htmlToText, USER_AGENT } from "../src/index.ts";

type Route = { status?: number; headers?: Record<string, string>; body?: string; hang?: boolean };

/** A pretend internet: answers from a table and records every request. */
function fakeWeb(routes: Record<string, Route>) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    if (route.hang) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    return new Response(route.body ?? "", { status: route.status ?? 200, headers: { "content-type": "text/html; charset=utf-8", ...route.headers } });
  }) as typeof fetch;
  return { impl, requests };
}

const GUIDE_HTML = `<!doctype html><html><head><title>How to revoke approvals | Example</title>
<script>window.evil = "SCRIPT TEXT MUST NOT APPEAR"</script></head>
<body><nav>Home · Pricing · Blog · Careers</nav>
<article><h1>How to revoke approvals</h1>
<p>Approvals let apps move your tokens. Reviewing them regularly keeps your wallet safer, and this guide shows every step in order so you can follow along without missing anything important.</p>
<ol><li>Enter your address in the search bar.</li><li>Select the network.</li><li>Sort by "Newest to Oldest".</li></ol>
<p>When you find an approval you don't recognise, you can revoke it with your wallet. Remember that revoking costs a network fee, so check carefully first.</p>
</article><footer>© Example Inc. Terms · Privacy</footer></body></html>`;

const allowed = ["example.org"];

describe("fetching a guide page", () => {
  it("returns the main text, one line per item, without menus, footers or scripts", async () => {
    const web = fakeWeb({ "https://example.org/guide": { body: GUIDE_HTML } });
    const r = await fetchGuide("https://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe("web-page");
    expect(r.title).toContain("How to revoke approvals");
    expect(r.text).toContain('- Sort by "Newest to Oldest".');
    expect(r.text).not.toContain("SCRIPT TEXT");
    expect(r.text).not.toContain("Careers");
  });

  it("identifies itself honestly as Wayproof (never as a browser)", async () => {
    const web = fakeWeb({ "https://example.org/guide": { body: GUIDE_HTML } });
    await fetchGuide("https://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl });
    expect(web.requests[0]?.headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^Wayproof\//);
  });

  it("follows a redirect that stays on allowed sites", async () => {
    const web = fakeWeb({
      "https://example.org/old": { status: 301, headers: { location: "/guide" } },
      "https://example.org/guide": { body: GUIDE_HTML },
    });
    const r = await fetchGuide("https://example.org/old", { allowedDomains: allowed, fetchImpl: web.impl });
    expect(r).toMatchObject({ ok: true, finalUrl: "https://example.org/guide" });
  });

  it("refuses a redirect to a site that is not allowed — and never requests it (BR-2)", async () => {
    const web = fakeWeb({
      "https://example.org/guide": { status: 302, headers: { location: "https://evil.example.com/phish" } },
      "https://evil.example.com/phish": { body: GUIDE_HTML },
    });
    const r = await fetchGuide("https://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl });
    expect(r).toMatchObject({ ok: false, code: "ERR-FETCH" });
    if (!r.ok) expect(r.why).toContain("evil.example.com");
    expect(web.requests.map((q) => q.url)).not.toContain("https://evil.example.com/phish");
  });

  it("refuses a redirect from https down to http", async () => {
    const web = fakeWeb({ "https://example.org/guide": { status: 301, headers: { location: "http://example.org/guide" } } });
    expect(await fetchGuide("https://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl })).toMatchObject({
      ok: false,
      code: "ERR-FETCH",
    });
  });

  it("stops after too many redirects", async () => {
    const web = fakeWeb({
      "https://example.org/a": { status: 302, headers: { location: "/b" } },
      "https://example.org/b": { status: 302, headers: { location: "/a" } },
    });
    const r = await fetchGuide("https://example.org/a", { allowedDomains: allowed, fetchImpl: web.impl, maxRedirects: 3 });
    expect(r).toMatchObject({ ok: false, code: "ERR-FETCH" });
    if (!r.ok) expect(r.why).toMatch(/Too many redirects/);
  });

  it("a site error or a bot block → ERR-FETCH, said plainly", async () => {
    const web = fakeWeb({ "https://example.org/guide": { status: 403, body: "Just a moment..." } });
    const r = await fetchGuide("https://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl });
    expect(r).toMatchObject({ ok: false, code: "ERR-FETCH" });
    if (!r.ok) expect(r.why).toMatch(/403.*block automated visits/);
    expect(await fetchGuide("https://example.org/missing", { allowedDomains: allowed, fetchImpl: web.impl })).toMatchObject({ ok: false });
  });

  it("a non-https or not-allowed start address → ERR-URL-INVALID, nothing is requested", async () => {
    const web = fakeWeb({});
    expect(await fetchGuide("http://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl })).toMatchObject({
      ok: false,
      code: "ERR-URL-INVALID",
    });
    expect(await fetchGuide("https://other.org/guide", { allowedDomains: allowed, fetchImpl: web.impl })).toMatchObject({
      ok: false,
      code: "ERR-URL-INVALID",
    });
    expect(web.requests).toHaveLength(0);
  });

  it("a page that never answers → ERR-FETCH after the time limit", async () => {
    const web = fakeWeb({ "https://example.org/guide": { hang: true } });
    const started = Date.now();
    const r = await fetchGuide("https://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl, timeoutMs: 300 });
    expect(r).toMatchObject({ ok: false, code: "ERR-FETCH" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("a page that is too large → ERR-FETCH", async () => {
    const web = fakeWeb({ "https://example.org/guide": { body: "x".repeat(5_000) } });
    const r = await fetchGuide("https://example.org/guide", { allowedDomains: allowed, fetchImpl: web.impl, maxBytes: 1_000 });
    expect(r).toMatchObject({ ok: false, code: "ERR-FETCH" });
    if (!r.ok) expect(r.why).toMatch(/too large/);
  });

  it("something that is not a web page (e.g. a PDF) → ERR-FETCH", async () => {
    const web = fakeWeb({ "https://example.org/guide.pdf": { headers: { "content-type": "application/pdf" }, body: "%PDF" } });
    expect(await fetchGuide("https://example.org/guide.pdf", { allowedDomains: allowed, fetchImpl: web.impl })).toMatchObject({
      ok: false,
      code: "ERR-FETCH",
    });
  });
});

describe("help-centre articles (Zendesk, e.g. Uniswap)", () => {
  const page = "https://support.example.org/hc/en-us/articles/123-How-to-bridge";
  const api = "https://support.example.org/api/v2/help_center/en-us/articles/123.json";

  it("reads the article through the official public API instead of the web page", async () => {
    const web = fakeWeb({
      [api]: {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ article: { title: "How to bridge", body: "<ol><li>Select the token drop-down.</li><li>Enter the amount.</li></ol>" } }),
      },
    });
    const r = await fetchGuide(page, { allowedDomains: ["support.example.org"], fetchImpl: web.impl });
    expect(r).toMatchObject({ ok: true, via: "zendesk-api", title: "How to bridge", finalUrl: page });
    if (r.ok) expect(r.text).toBe("- Select the token drop-down.\n- Enter the amount.");
    expect(web.requests.map((q) => q.url)).toEqual([api]);
  });
});

describe("turning HTML into text", () => {
  it("keeps one line per item and decodes common characters", () => {
    expect(htmlToText("<p>Click &ldquo;Revoke&rdquo;&nbsp;now &amp; wait</p><ul><li>A</li><li>B</li></ul>")).toBe(
      'Click "Revoke" now & wait\n- A\n- B',
    );
  });

  it("drops paragraphs that only hold a non-breaking space (seen on Uniswap)", () => {
    expect(htmlToText("<p>One</p><p> </p><p>Two</p>")).toBe("One\nTwo");
  });

  it("keeps glossary words shown as pop-up buttons inside sentences (seen on Arbitrum docs)", async () => {
    const html = `<html><head><title>Bridge</title></head><body><article><h1>Bridge quickstart</h1>
      <p>This quickstart is for users who want to deposit ETH from a <button type="button">parent chain</button> to a
      <button type="button">child chain</button> or vice versa, using the bridge. It walks through every step in detail so you can follow it.</p>
      <p>Step one is to get some native currency on the parent chain before you begin, from an exchange or an on-ramp service of your choice.</p>
      <p>Step two is to add the network to your wallet, with the values shown in the table on this page, before moving any funds at all.</p>
      </article></body></html>`;
    const web = fakeWeb({ "https://example.org/b": { body: html } });
    const r = await fetchGuide("https://example.org/b", { allowedDomains: ["example.org"], fetchImpl: web.impl });
    expect(r.ok && r.text).toContain("from a parent chain to a child chain");
  });
});
