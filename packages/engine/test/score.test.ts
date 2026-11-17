// FR-51: score = 100 × (Passed + Verified fixed) ÷ (Passed + Verified fixed + Needs a human).
// Each test reads as a plain-English example.
import { describe, expect, it } from "vitest";
import { explainScore, score, VERDICT_INFO, VERDICTS, type Verdict } from "../src/index.ts";

describe("score (FR-51)", () => {
  it("all steps passed → 100", () => {
    expect(score(["passed", "passed", "passed"])).toMatchObject({ kind: "score", value: 100 });
  });

  it("one passed and one verified fixed → 100 (a proven fix counts as working)", () => {
    expect(score(["passed", "verified_fixed"])).toMatchObject({ kind: "score", value: 100 });
  });

  it("3 passed and 1 needs a human → 75", () => {
    expect(score(["passed", "passed", "passed", "needs_human"])).toEqual({
      kind: "score",
      value: 75,
      good: 3,
      counted: 4,
    });
  });

  it("2 of 3 working → 67 (rounded to a whole number)", () => {
    expect(score(["passed", "verified_fixed", "needs_human"])).toMatchObject({ value: 67 });
  });

  it("every step needs a human → 0 (Kane checked them, and none work)", () => {
    expect(score(["needs_human", "needs_human"])).toMatchObject({ kind: "score", value: 0 });
  });

  it("wallet steps, blocked steps, budget and stops don't change the score", () => {
    const withoutExtras = score(["passed", "needs_human"]);
    const withExtras = score([
      "passed",
      "needs_human",
      "not_checked_wallet",
      "not_checked_outside_domains",
      "couldnt_check",
      "not_run_budget",
      "stopped_by_user",
    ]);
    expect(withExtras).toEqual(withoutExtras);
  });

  it("nothing could be checked → no score, never 0", () => {
    const s = score(["not_checked_wallet", "couldnt_check"]);
    expect(s.kind).toBe("no_score");
  });

  it("an empty check list → no score", () => {
    expect(score([]).kind).toBe("no_score");
  });

  it("explains the formula in plain words", () => {
    expect(explainScore(score(["passed", "passed", "passed", "needs_human"]))).toBe(
      "3 of 4 checked steps work (passed or verified fixed) = 75",
    );
    expect(explainScore(score(["couldnt_check"]))).toMatch(/nothing to score/);
  });
});

describe("verdicts (docs/03 §5)", () => {
  it("every verdict has words and an icon (status is never colour alone, NFR-5)", () => {
    for (const v of VERDICTS) {
      expect(VERDICT_INFO[v].label.length).toBeGreaterThan(0);
      expect(VERDICT_INFO[v].icon.length).toBeGreaterThan(0);
    }
  });

  it("exactly three verdicts count in the score: passed, verified fixed, needs a human", () => {
    const counting: Verdict[] = VERDICTS.filter((v) => VERDICT_INFO[v].countsInScore);
    expect(counting).toEqual(["passed", "verified_fixed", "needs_human"]);
  });
});
