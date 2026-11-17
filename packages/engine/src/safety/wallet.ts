// Wallet boundary (BR-1, FR-26). Wayproof never connects a wallet, signs, or moves funds.
// Two checks, both failing closed:
//   checkObjective  — before Kane starts: refuses objectives that would do anything with a wallet
//   checkRemark     — while Kane runs: spots signs of a wallet prompt so the run can be stopped

/** Every objective must contain this exact sentence (FR-20). */
export const SAFETY_SENTENCE = "Do not connect a wallet or sign anything.";

export interface Rule {
  name: string;
  pattern: RegExp;
}

// Wording that would act on a wallet or move funds. Matched on the objective after the
// safety sentence and purely negative button lists ("Never press 'Move'.") are set aside.
const OBJECTIVE_RULES: Rule[] = [
  { name: "connect a wallet", pattern: /\bconnect\b[^.]{0,40}\bwallet\b/i },
  { name: "wallet connect", pattern: /\bwallet\s*connect\b/i },
  {
    name: "sign a message or transaction",
    pattern: /\bsign\b(?!\s+(?:in|up)\b)[^.]{0,40}\b(?:message|transaction|request|permit|typed data|signature)\b/i,
  },
  { name: "sign with a wallet", pattern: /\bsign\b[^.]{0,30}\b(?:with|in|using)\s+(?:your|the|a)\s+wallet\b/i },
  {
    name: "approve, confirm or send a transaction",
    pattern:
      /\b(?:approve|confirm|submit|send|execute|broadcast|authori[sz]e)\b[^.]{0,40}\b(?:transactions?|tx|swaps?|bridge|spending|allowance|approval|transfer|deposit|withdrawal|withdraw|stake|payment)\b/i,
  },
  {
    name: "press a fund-moving button",
    pattern:
      /\b(?:press|click|tap|select|hit)\w*\s+(?:on\s+)?(?:the\s+)?["'“‘]\s*(?:revoke|move funds|move|approve and swap|approve|confirm swap|confirm|claim|stake|unstake|withdraw|deposit|send|bridge|swap|sign|connect wallet|connect)\s*["'”’]/i,
  },
  {
    name: "press a fund-moving button",
    pattern: /\b(?:press|click|tap)\w*\s+(?:on\s+)?(?:the\s+)?(?:revoke|move funds|approve|confirm swap|claim|stake|connect wallet)\b/i,
  },
  { name: "secret recovery words or keys", pattern: /\b(?:seed phrase|recovery phrase|secret recovery|private key|mnemonic)\b/i },
];

// A sentence that ONLY forbids pressing things ("Never press 'Move' or 'Move funds'.") is safe to set aside.
const NEGATIVE_BUTTON_SENTENCE = /^(?:never|do not|don't)\s+(?:press|click|tap|select)\b/i;

export type ObjectiveResult = { ok: true } | { ok: false; why: string; rules: string[] };

/**
 * The rules look "within the same sentence" ([^.]). A dot INSIDE a number or name ("0.1 ETH",
 * "app.uniswap.org") is not a sentence end, so it is swapped for a neutral character before matching.
 * Without this, "Send 0.1 ETH as a deposit" slipped past the rules (caught by a test, 17 Nov).
 */
function forMatching(text: string): string {
  return text.replace(/(\w)\.(?=\w)/g, "$1·");
}

export function checkObjective(objective: string): ObjectiveResult {
  if (!objective.includes(SAFETY_SENTENCE)) {
    return {
      ok: false,
      why: `The objective is missing the required sentence "${SAFETY_SENTENCE}"`,
      rules: ["missing safety sentence"],
    };
  }
  const rest = objective
    .split(SAFETY_SENTENCE)
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !NEGATIVE_BUTTON_SENTENCE.test(sentence.trim()))
    .join(" ");

  const text = forMatching(rest);
  const hits = [...new Set(OBJECTIVE_RULES.filter((r) => r.pattern.test(text)).map((r) => r.name))];
  if (hits.length > 0) {
    return { ok: false, why: `The objective asks for a wallet or fund-moving action (${hits.join("; ")}).`, rules: hits };
  }
  return { ok: true };
}

// Signs, in Kane's progress messages, that a wallet prompt is open or about to open.
const REMARK_RULES: Rule[] = [
  {
    name: "wallet app named",
    pattern: /\b(?:metamask|walletconnect|wallet connect|coinbase wallet|rabby|phantom|rainbow wallet|trust wallet|ledger live)\b/i,
  },
  {
    name: "signature or transaction prompt",
    pattern:
      /\b(?:signature request|sign(?:ing)? (?:the |this |a )?(?:message|transaction)|confirm(?:ing)? (?:the |this |a )?transaction)\b/i,
  },
  { name: "wallet pop-up", pattern: /\bwallet\s+(?:pop-?up|modal|prompt|extension|dialog)\b/i },
  { name: "clicking connect wallet", pattern: /\b(?:click|press|tap|select)\w*[^.]{0,40}\bconnect\s*wallet\b/i },
];

export type RemarkResult = { stop: false } | { stop: true; why: string; rule: string };

export function checkRemark(remark: string): RemarkResult {
  const text = forMatching(remark);
  const hit = REMARK_RULES.find((r) => r.pattern.test(text));
  if (hit) return { stop: true, why: `Kane's progress mentioned a wallet (${hit.name}): "${remark}"`, rule: hit.name };
  return { stop: false };
}
