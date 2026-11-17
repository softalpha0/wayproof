// wayproof CLI (C-2): doctor (FR-60), terminal output (T-03, T-04), exit codes (FR-55).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RunRecord } from "@wayproof/engine";
import { formatDoctor, runDoctor, type DoctorDeps } from "../src/doctor.ts";
import { exitCodeFor, formatEvent, formatSummary, verdictLine } from "../src/output.ts";

const SAMPLE = fileURLToPath(new URL("../../../fixtures/runs/sample-layout-run.json", import.meta.url));
const sample = (): RunRecord => JSON.parse(readFileSync(SAMPLE, "utf8")) as RunRecord;

function deps(over: Partial<DoctorDeps> = {}, kane: Record<string, { exitCode: number; stdout: string }> = {}): DoctorDeps {
  const answers: Record<string, { exitCode: number; stdout: string }> = {
    "--version": { exitCode: 0, stdout: "0.10.4\n" },
    whoami: { exitCode: 0, stdout: "✓ Authenticated" },
    balance: { exitCode: 0, stdout: "Available credits: 11047.42" },
    ...kane,
  };
  return {
    nodeVersion: "v26.13.0",
    env: { ProgramFiles: "C:\\Program Files", ANTHROPIC_API_KEY: "test-placeholder", ANTHROPIC_MODEL: "claude-opus-5-5" },
    platform: "win32",
    fileExists: (p) => p.endsWith("chrome.exe"),
    exec: async (_cmd, args) => answers[args[0] ?? ""] ?? { exitCode: 1, stdout: "" },
    ...over,
  };
}

describe("wayproof doctor (FR-60)", () => {
  it("all good → every line ✔ and 'ready'", async () => {
    const r = await runDoctor(deps());
    expect(r.ok).toBe(true);
    const text = formatDoctor(r);
    expect(text).toContain("✔ kane-cli 0.10.4 installed");
    expect(text).toContain("✔ Kane credits available: 11047");
    expect(text).toContain("All good");
  });

  it("each problem shows the exact command that fixes it", async () => {
    const r = await runDoctor(
      deps(
        { nodeVersion: "v20.11.0", env: {}, fileExists: () => false },
        { whoami: { exitCode: 1, stdout: "Not logged in" } },
      ),
    );
    expect(r.ok).toBe(false);
    const text = formatDoctor(r);
    expect(text).toContain("✖ Node v20.11.0 is too old");
    expect(text).toContain("✖ Google Chrome not found");
    expect(text).toContain("→ run: kane-cli login --oauth");
    expect(text).toContain("✖ ANTHROPIC_API_KEY not set");
    expect(text).toMatch(/\d problems found\./);
  });

  it("kane-cli missing → says how to install it, and skips the login check", async () => {
    const r = await runDoctor(deps({ exec: async () => ({ exitCode: undefined, stdout: "" }) }));
    const text = formatDoctor(r);
    expect(text).toContain("→ run: npm install -g @testmuai/kane-cli");
    expect(text).not.toContain("Kane logged in");
  });

  it("never prints the API key itself", async () => {
    const text = formatDoctor(await runDoctor(deps()));
    expect(text).not.toContain("test-placeholder");
  });
});

describe("terminal output (T-03, T-04)", () => {
  it("one line per verdict, with its symbol and plain words", () => {
    const run = sample();
    expect(verdictLine(run.checks[0]!)).toBe("  🔧 steps 1–3  verified fixed — Kane followed the corrected wording and saw the expected result.");
    expect(verdictLine(run.checks[1]!)).toMatch(/^ {2}🔒 step 4 {2}not checked — wallet step — /);
  });

  it("progress lines say what is happening in plain words", () => {
    expect(formatEvent({ type: "check_state", checkId: "check-1", stepNumbers: [2, 3, 4], state: "kane", attempt: 2 })).toBe(
      "  … steps 2–4  Kane is following it in a real browser (Kane run 2/3)",
    );
    expect(formatEvent({ type: "check_state", checkId: "check-1", stepNumbers: [1], state: "rewriting_check", attempt: 2 })).toContain(
      "the guide is not blamed",
    );
  });

  it("summary shows the score, counts, Kane runs and credits, report path and exit code", () => {
    const text = formatSummary(sample(), ".wayproof/runs/x/report.html");
    expect(text).toContain("Score 50/100");
    expect(text).toContain("fixed 1 · needs a human 1 · wallet 1 · couldn't check 1");
    expect(text).toContain("Kane runs 5 · Kane credits 112.4");
    expect(text).toContain("Report  .wayproof/runs/x/report.html");
    expect(text).toContain("Exit code 1 (at least one step needs a human)");
  });
});

describe("exit codes (FR-55)", () => {
  const withVerdicts = (...v: string[]): RunRecord => ({
    ...sample(),
    checks: v.map((verdict, i) => ({ ...sample().checks[0]!, id: `c${i}`, verdict: verdict as never })),
  });

  it("0 when every checked step passed or was proven fixed (wallet steps don't count against it)", () => {
    expect(exitCodeFor(withVerdicts("passed", "verified_fixed", "not_checked_wallet", "couldnt_check"))).toBe(0);
  });
  it("1 when at least one step needs a human", () => {
    expect(exitCodeFor(withVerdicts("passed", "needs_human", "not_run_budget"))).toBe(1);
  });
  it("2 when the guide could not be checked at all (setup or input problem)", () => {
    expect(exitCodeFor({ ...sample(), status: "failed", error: { code: "ERR-FETCH", why: "404" } })).toBe(2);
  });
  it("3 when the budget stopped the check", () => {
    expect(exitCodeFor(withVerdicts("passed", "not_run_budget"))).toBe(3);
  });
});
