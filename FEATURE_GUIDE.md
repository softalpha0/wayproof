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
