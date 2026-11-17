# FEATURE_GUIDE.md — what has actually been built

> Only features the owner has tested and approved are listed as **Implemented**. Design and plans live in `TDD.md`; this file says what exists today and how to try it.

## How to run the tests

```bash
pnpm install
pnpm test
```

## Implemented

### Verdicts and score (FR-51) — approved 17 Nov 2026
- **What it does:** defines the eight verdicts a check can end with (Passed, Verified fixed, Needs a human, Not checked — wallet step, Not checked — outside allowed domains, Couldn't check, Not run — budget reached, Stopped by you), each with words and an icon. It also calculates the report score.
- **Score rule:** 100 × (Passed + Verified fixed) ÷ (Passed + Verified fixed + Needs a human), rounded to a whole number. Every other verdict is left out. If nothing counts, the report says "no score", never 0.
- **Code:** `packages/engine/src/domain/verdict.ts`, `packages/engine/src/domain/score.ts`
- **Tests:** `packages/engine/test/score.test.ts` (each test name is a plain-English example)

### Kane adapter (FR-21, BR-3, BR-6, BR-8) — approved 17 Nov 2026
- **What it does:** the only code that starts Kane. It builds the `kane-cli run … --agent --headless --timeout … --max-steps …` argument list (never a shell string), reads Kane's line-by-line output, saves it to disk, and sorts every run into one outcome:

| Kane gave us | Outcome | Later becomes |
|---|---|---|
| exit 0 and `run_end.status` "passed" | passed | Judge confirms → Passed |
| exit 1, or exit 0 with any other status | failed | Judge decides: defect, flaky, or badly worded check |
| `reason_code` starting with `blocker.` (e.g. captcha) | blocked | Couldn't check — never a defect |
| exit 2, missing `run_end`, unexpected exit code | error | `ERR-KANE` |
| exit 3, or Wayproof's own stopwatch | timeout | Retry once → `ERR-KANE-TIMEOUT` |

- **Own stopwatch:** Kane's `--timeout` did not stop a run on day 0, so Wayproof kills Kane itself — the whole process tree, including Chrome (`taskkill /T` on Windows).
- **Code:** `packages/engine/src/kane/` (`args.ts`, `output.ts`, `outcome.ts`, `run.ts`)
- **Tests:** `packages/engine/test/kane-adapter.test.ts` — real Kane output in `fixtures/kane/`, plus a fake `kane-cli` (`test/fake-kane.mjs`) so tests spend no credits.
- **Try it by hand (no credits):**
  ```bash
  pnpm --filter @wayproof/engine kane:explain fixtures/kane/etherscan-captcha-blocked.ndjson
  ```

### Safety gate (BR-1, BR-2, FR-26) — approved 17 Nov 2026
- **What it does:** decides what Kane may do and where it may go. It fails closed.
  - **Before a run:** wallet steps never run. The objective must contain "Do not connect a wallet or sign anything." and must not ask to connect, sign, approve, confirm or send, press fund-moving buttons (Revoke, Move funds, Approve and swap, Confirm Swap, Claim, Stake…) or mention seed phrases or keys → otherwise **Not checked — wallet step** (`ERR-BOUNDARY`). The start address must be `https://`, with no user/password part, port or IP address, and on the allowed-sites list → otherwise **Not checked — outside allowed domains**. An allowed site covers its sub-sites (`uniswap.org` allows `app.uniswap.org`).
  - **While Kane runs:** every progress line is checked; at the first sign of a wallet (MetaMask, WalletConnect, a signature request, confirming a transaction, a wallet pop-up, clicking Connect wallet) Kane is stopped at once → **stopped safely**. This cannot be switched off.
  - **After a run:** if Kane ended on a site that isn't allowed (a redirect), the step is **Not checked — outside allowed domains**.
- **Code:** `packages/engine/src/safety/` (`domains.ts`, `wallet.ts`, `gate.ts`); the live check is wired into `src/kane/run.ts`.
- **Tests:** `packages/engine/test/safety-gate.test.ts` — the real objectives pass, dangerous ones and address tricks are blocked, no false alarms on the 72 real Kane progress lines, and a fake Kane that reaches a Connect Wallet button is stopped.
- **Try it by hand (no credits):**
  ```bash
  pnpm --filter @wayproof/engine safety:check "Do not connect a wallet or sign anything. Find the USDC approval and click 'Revoke'." https://revoke.cash
  ```

### Claude adapter (FR-2, FR-20, FR-22, FR-24) — approved 17 Nov 2026
- **What it does:** the only code that talks to Claude (Claude Opus 5.5 via `@anthropic-ai/sdk` 1.8.0). Four jobs:
  - **extract:** reads the guide text and lists the steps. A step is a wallet step only if it itself needs a wallet. No steps → `ERR-NO-STEPS`.
  - **plan:** writes one Kane objective for up to 3 steps. It must start with the safety sentence and pass the safety gate. The expected result is copied by code, never written by Claude (BR-5).
  - **judge:** answers pass / defect / flaky / check_wording / blocked, with a reason and an exact quote from Kane's output (the quote is checked). "pass" is impossible unless Kane passed (BR-3).
  - **fix:** proposes new wording (at most 3 sentences, no wallet actions). The expected result is copied by code.
- **Checks:** every answer is checked twice (JSON shape, then Wayproof's rules). A bad answer is retried once with the problem explained, then it's `ERR-AI`. A refusal is not retried; the API's refusal fallback may answer with another Claude model, and the result records which one.
- **Safety:** website and Kane text are passed as data inside `<untrusted_…>` / `<kane_output>` tags. Wayproof's own requests identify themselves honestly.
- **Code:** `packages/engine/src/claude/` (`llm.ts`, `anthropic.ts`, `ask.ts`, `prompts.ts`)
- **Tests:** `packages/engine/test/claude-adapter.test.ts` (a fake Claude, no cost); real replies recorded in `fixtures/claude/`.
- **Try it by hand (about 1 US cent per run):**
  ```bash
  pnpm --filter @wayproof/engine claude:judge fixtures/kane/uniswap-bridge-assertion-too-strict.ndjson "The page shows an amount of ETH to receive on Base."
  ```
