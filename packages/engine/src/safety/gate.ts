// Safety gate (C-6): the single place that decides what Kane may do and where it may go.
// Called before every Kane run, and again on where Kane ended up.

import type { Verdict } from "../domain/verdict.ts";
import { checkUrl } from "./domains.ts";
import { checkObjective } from "./wallet.ts";

export type GateDecision =
  | { allowed: true }
  | {
      allowed: false;
      verdict: Extract<Verdict, "not_checked_wallet" | "not_checked_outside_domains">;
      /** ERR-BOUNDARY for wallet reasons (04-SRS §5); none for outside-domain steps. */
      code: "ERR-BOUNDARY" | undefined;
      why: string;
    };

export interface GateInput {
  objective: string;
  url: string;
  allowedDomains: readonly string[];
  /** From the extracted step (FR-2). Wallet steps never run (BR-1). */
  needsWallet?: boolean;
}

export function gateBeforeRun(input: GateInput): GateDecision {
  if (input.needsWallet) {
    return { allowed: false, verdict: "not_checked_wallet", code: undefined, why: "This step needs a wallet, so Wayproof does not run it." };
  }
  const objective = checkObjective(input.objective);
  if (!objective.ok) return { allowed: false, verdict: "not_checked_wallet", code: "ERR-BOUNDARY", why: objective.why };

  const url = checkUrl(input.url, input.allowedDomains);
  if (!url.ok) return { allowed: false, verdict: "not_checked_outside_domains", code: undefined, why: url.why };

  return { allowed: true };
}

/** After the run: did Kane end up somewhere it should not be (e.g. a redirect)? */
export function gateAfterRun(finalUrl: string | undefined, allowedDomains: readonly string[]): GateDecision {
  if (finalUrl === undefined || finalUrl === "") return { allowed: true };
  const url = checkUrl(finalUrl, allowedDomains);
  if (!url.ok) {
    return {
      allowed: false,
      verdict: "not_checked_outside_domains",
      code: undefined,
      why: `Kane ended on a page outside the allowed sites: ${url.why}`,
    };
  }
  return { allowed: true };
}
