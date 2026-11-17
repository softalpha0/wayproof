// Allowed sites (BR-2, FR-3, 04-SRS §4). Fails closed: anything unusual is refused.
// Rule decided 17 Nov 2026: an allowed entry covers itself and its sub-sites
// ("uniswap.org" allows "app.uniswap.org"); "docs.x.com" does NOT allow "x.com".

export type DomainResult = { ok: true; domain: string } | { ok: false; why: string };
export type UrlResult = { ok: true; host: string } | { ok: false; why: string };

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Checks one allowed-domain entry typed by a person or proposed by Claude (ERR-DOMAIN-INVALID). */
export function normalizeDomain(input: string): DomainResult {
  const raw = input.trim().toLowerCase().replace(/\.$/, "");
  if (raw === "") return { ok: false, why: "The domain is empty." };
  if (/[\s/:@?#\\]/.test(raw)) {
    return { ok: false, why: `Enter a domain only, like docs.example.com — not a full address: ${input}` };
  }
  let host: string;
  try {
    host = new URL(`https://${raw}`).hostname; // converts international names to their ASCII (punycode) form
  } catch {
    return { ok: false, why: `Not a valid domain: ${input}` };
  }
  if (host.startsWith("[") || IPV4.test(host)) return { ok: false, why: `IP addresses are not allowed: ${input}` };
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, why: `A domain needs at least one dot, like example.com: ${input}` };
  if (host === "localhost" || host.endsWith(".localhost")) return { ok: false, why: "localhost is not allowed." };
  if (!labels.every((l) => LABEL.test(l))) return { ok: false, why: `Not a valid domain: ${input}` };
  return { ok: true, domain: host };
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/** May Kane (or the fetcher) visit this address? */
export function checkUrl(url: string, allowedDomains: readonly string[]): UrlResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, why: `Not a valid web address: ${url}` };
  }
  if (parsed.protocol !== "https:") return { ok: false, why: `Only https:// addresses are allowed: ${url}` };
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, why: `Addresses with a user name or password part are not allowed: ${url}` };
  }
  if (parsed.port !== "") return { ok: false, why: `Addresses with a port number are not allowed: ${url}` };

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || IPV4.test(host)) return { ok: false, why: `IP addresses are not allowed: ${url}` };

  const allowed: string[] = [];
  for (const entry of allowedDomains) {
    const n = normalizeDomain(entry);
    if (n.ok) allowed.push(n.domain);
  }
  if (!hostAllowed(host, allowed)) {
    return { ok: false, why: `${host} is not on the allowed sites list (${allowed.join(", ") || "empty"}).` };
  }
  return { ok: true, host };
}
