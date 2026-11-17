// Guide fetcher (C-8, FR-2 fetch part, ERR-FETCH, BR-2).
// - Identifies itself honestly; never pretends to be a browser to get past a site's defences (TDD §13.3).
// - Follows redirects by hand and checks EVERY hop against the allowed sites list (BR-2).
// - Time limit (20 s) and size limit (2 MB).
// - Zendesk help-centre articles (e.g. Uniswap's) are read through Zendesk's official public API,
//   because their web pages refuse non-browser visitors [Observed 17 Nov 2026].
// - Main text is pulled out with Mozilla Readability (Firefox's reader view) on a script-free jsdom.

import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { checkUrl } from "../safety/domains.ts";

export const USER_AGENT = "Wayproof/0.1 (+https://github.com/softalpha0/wayproof)";

export interface FetchGuideOptions {
  allowedDomains: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** For tests. Defaults to the built-in fetch. */
  fetchImpl?: typeof fetch;
}

export type FetchGuideResult =
  | {
      ok: true;
      /** The address the text finally came from (after allowed redirects). */
      finalUrl: string;
      title: string;
      /** Main text, one line per paragraph / list item. */
      text: string;
      via: "web-page" | "zendesk-api";
    }
  | { ok: false; code: "ERR-URL-INVALID" | "ERR-FETCH"; why: string };

const ZENDESK_ARTICLE = /^(https:\/\/[^/]+)\/hc\/([a-z]{2}(?:-[a-z]{2})?)\/articles\/(\d+)/i;

export async function fetchGuide(guideUrl: string, options: FetchGuideOptions): Promise<FetchGuideResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 5;

  const start = checkUrl(guideUrl, options.allowedDomains);
  if (!start.ok) return { ok: false, code: "ERR-URL-INVALID", why: start.why };

  const zendesk = guideUrl.match(ZENDESK_ARTICLE);
  let url = zendesk ? `${zendesk[1]}/api/v2/help_center/${zendesk[2]}/articles/${zendesk[3]}.json` : guideUrl;

  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response | undefined;
  try {
    for (let hop = 0; ; hop++) {
      response = await doFetch(url, {
        redirect: "manual",
        signal,
        headers: { "user-agent": USER_AGENT, accept: zendesk ? "application/json" : "text/html,application/xhtml+xml" },
      });
      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get("location");
      if (!location) return fail(`The site answered with a redirect (HTTP ${response.status}) but no new address.`);
      if (hop >= maxRedirects) return fail(`Too many redirects (more than ${maxRedirects}).`);
      const next = new URL(location, url).href;
      const allowed = checkUrl(next, options.allowedDomains);
      if (!allowed.ok) return fail(`The page redirects to ${next}, which is not allowed: ${allowed.why}`);
      url = next;
    }
  } catch (err) {
    if (signal.aborted) return fail(`The page did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    return fail(`Could not reach the page: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    return fail(`The site answered HTTP ${response.status}${response.status === 403 ? " (it may block automated visits)" : ""}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const expected = zendesk ? /json/i : /html/i;
  if (!expected.test(contentType)) return fail(`Expected a web page but got "${contentType || "unknown"}".`);

  let body: string;
  try {
    body = await readLimited(response, maxBytes, signal);
  } catch (err) {
    if (signal.aborted) return fail(`The page did not finish loading within ${Math.round(timeoutMs / 1000)} seconds.`);
    return fail(err instanceof Error ? err.message : String(err));
  }

  if (zendesk) {
    let json: { article?: { title?: unknown; body?: unknown } };
    try {
      json = JSON.parse(body) as typeof json;
    } catch {
      return fail("The help-centre API did not return valid JSON.");
    }
    const title = typeof json.article?.title === "string" ? json.article.title : "";
    const html = typeof json.article?.body === "string" ? json.article.body : "";
    return { ok: true, finalUrl: guideUrl, title, text: htmlToText(html), via: "zendesk-api" };
  }

  const { title, text } = mainText(body, url);
  return { ok: true, finalUrl: url, title, text, via: "web-page" };

  function fail(why: string): FetchGuideResult {
    return { ok: false, code: "ERR-FETCH", why };
  }
}

async function readLimited(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error(`The page is too large (${declared} bytes; limit ${maxBytes}).`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    if (signal.aborted) throw new Error("aborted");
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`The page is too large (over ${maxBytes} bytes).`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Main article text via Readability. jsdom runs no scripts and loads nothing else. */
export function mainText(html: string, url: string): { title: string; text: string } {
  const virtualConsole = new VirtualConsole(); // silence CSS/HTML parse noise
  const dom = new JSDOM(html, { url, virtualConsole });
  try {
    const document = dom.window.document;
    const pageTitle = document.title.trim();
    // Some docs show glossary words as pop-up <button>s inside sentences ("from a <button>parent chain</button>").
    // Readability removes buttons, which dropped those words (seen on docs.arbitrum.io, 17 Nov). Keep their text.
    for (const button of [...document.querySelectorAll("p button, li button, td button")]) {
      button.replaceWith(document.createTextNode(button.textContent ?? ""));
    }
    const article = new Readability(document).parse();
    if (article?.content) {
      return { title: (article.title ?? pageTitle).trim(), text: htmlToText(article.content) };
    }
    return { title: pageTitle, text: (document.body?.textContent ?? "").replace(/\s+/g, " ").trim() };
  } finally {
    dom.window.close();
  }
}

/** Turns article HTML into plain text, one line per paragraph, heading or list item. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/\s*[\r\n]+\s*/g, " ") // in HTML a line break in the source is just a space; real breaks come from tags below
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/h\d|\/li|\/div|\/tr|\/blockquote|\/pre)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/ /g, " ") // non-breaking spaces (Uniswap's empty <p>&nbsp;</p> paragraphs)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
