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
