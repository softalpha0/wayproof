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

### Guide fetcher (FR-2, ERR-FETCH, BR-2) — tested 17 Nov 2026
- **What it does:** downloads a guide page as "Wayproof" (never pretending to be a browser). It follows redirects one hop at a time and checks each hop against the allowed sites; a redirect elsewhere is refused and never visited. It has a 20 s time limit and a 2 MB size limit. Help-centre articles (like Uniswap's) are read through their official public API. The main text is pulled out with Mozilla Readability, and no page scripts are run.
- **Code:** `packages/engine/src/fetch/guide.ts` · **Tests:** `packages/engine/test/fetcher.test.ts`
- **Try it by hand (free):**
  ```bash
  pnpm --filter @wayproof/engine guide:fetch https://revoke.cash/learn/approvals/how-to-revoke-token-approvals
  ```

### Fix loop (FR-20–FR-25, BR-3/4/5/10/11) — approved 17 Nov 2026
- **What it does:** checks one guide from start to verdicts. It fetches the guide, has Claude extract the steps, never runs wallet steps or steps on other sites, and groups the rest (up to 3 per Kane run). For each group it plans an objective, passes it through the safety gate and the credit budget, runs Kane, checks where Kane ended up, and asks the judge:
  - **pass** → Passed (Verified fixed if a fix came first)
  - **defect** → Claude proposes new wording and Kane re-runs it to prove it
  - **check_wording** → the check is rewritten once; the guide is not blamed
  - **flaky** → run once more
  - **blocked / Kane error** → Couldn't check
  - **timeout** → one retry with more time
  - **wallet prompt** → stopped safely
- **Limits:** at most 3 Kane runs per check (BR-4). "Needs a human" only when Kane actually showed a problem (BR-11). Budget of 300 Kane credits per guide by default, counting `credits_consumed` + 2 per run (BR-10).
- **Saved:** `run.json` after every attempt, Kane's raw output in `kane/`, and Kane's evidence packs copied into `evidence/` (BR-8).
- **Code:** `packages/engine/src/loop/` · **Tests:** `packages/engine/test/fix-loop.test.ts`

### Proof Report builder (FR-50, FR-51, FR-53, FR-54) — approved 17 Nov 2026
- **What it does:** turns a run's `run.json` into `report.html` and `report.md`.
  - `report.html` is one self-contained file: no scripts, nothing loaded from the internet, light and dark themes.
  - It shows the date it was checked, the score with its formula, the verdict counts, and every check (problems first).
  - Each check shows every Kane attempt: the objective, Kane's own words, the judge's verdict and quote, the proposed fix, and evidence links.
  - The corrected guide shows only wording Kane proved.
- **Safety:** all text from websites, Kane and Claude is shown as text, never run. Only web links become links, and evidence links stay inside the run folder.
- **Code:** `packages/engine/src/report/build.ts` · **Tests:** `packages/engine/test/report.test.ts`
- **Try it by hand (free; made-up SAMPLE data):**
  ```bash
  pnpm --filter @wayproof/engine report:build fixtures/runs/sample-layout-run.json --out report-preview
  ```

### `wayproof` command line (FR-55, FR-60, FR-61) — approved 17 Nov 2026
- **`pnpm wayproof doctor`** checks Node 22+, Chrome, kane-cli installed and logged in, Kane credits, and the Claude key and model (it never prints the key). Each problem shows the command that fixes it.
- **`pnpm wayproof check <guide-url> [--allow other-sites] [--budget 300]`** runs the whole fix loop with live lines in the terminal, then writes `report.html` and `report.md` into `.wayproof/runs/<id>/`.
- **Exit codes:** 0 everything checked works · 1 a step needs a human · 2 setup or input problem · 3 credit budget reached.
- **Code:** `packages/cli/src/` · **Tests:** `packages/cli/test/cli.test.ts`
- **Try it:**
  ```bash
  pnpm wayproof doctor
  ```
  ```bash
  pnpm wayproof check https://revoke.cash/learn/approvals/how-to-revoke-token-approvals
  ```
  (The real check uses Kane credits and Claude: about 60–160 credits and a few cents per guide.)

### Published Proof Reports and Kane self-checks (F-7, FR-65) — 17–18 Nov 2026
- **Live site:** https://softalpha0.github.io/wayproof/ — four real reports (Revoke.cash and Uniswap bridging; main and earlier runs with notes), served from the `gh-pages` branch.
- **Public copies:** built by `pnpm --filter @wayproof/engine site:build` from `publish/site.json`. Kane's sealed evidence packs are never published (they contain Kane account details); Kane's raw output is cleaned of home folders. Every file is scanned for home paths, emails and private words (`WAYPROOF_PRIVATE_TERMS`) before anything is kept.
- **Kane self-checks (FR-65):** Kane opened our own published pages in a real browser and confirmed what a judge needs to see. Both passed:
  - `verification/kane/report-revoke-cash-2026-11-17.*` — title, "Checked 17 Nov 2026", score 100/100, a "Passed" check (11.3 credits)
  - `verification/kane/site-index-2026-11-17.*` — heading, both guides, four report links (16.1 credits)
- **Run a self-check:**
  ```bash
  pnpm --filter @wayproof/engine self:check <https-url> "<what the page must show>" <name>
  ```
