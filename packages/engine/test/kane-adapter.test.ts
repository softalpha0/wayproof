// Kane adapter (C-5): FR-21, BR-3, BR-6, BR-11.
// 1) Contract tests against REAL Kane output recorded on 16 Nov 2026 (fixtures/kane/).
// 2) Edge cases built by hand.
// 3) The process runner, using a fake kane-cli so no credits are spent.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildKaneArgs,
  classifyKaneRun,
  InvalidKaneSpecError,
  parseKaneOutput,
  runKane,
  type KaneOutcomeKind,
} from "../src/index.ts";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/kane/", import.meta.url));
const FAKE_KANE = fileURLToPath(new URL("./fake-kane.mjs", import.meta.url));

function loadFixture(name: string): { stdout: string; exitCode: number } {
  const stdout = readFileSync(join(FIXTURES, `${name}.ndjson`), "utf8");
  const meta = JSON.parse(readFileSync(join(FIXTURES, `${name}.meta.json`), "utf8")) as { exit_code: number };
  return { stdout, exitCode: meta.exit_code };
}

const line = (o: object) => JSON.stringify(o);
const RUN_END_PASSED = line({ type: "run_end", status: "passed", reason_code: "success.complete", credits_consumed: 2.5 });

// ---------------------------------------------------------------------------
describe("real Kane output (contract tests, fixtures/kane/)", () => {
  const expected: Record<string, KaneOutcomeKind> = {
    "example-pass": "passed",
    "revoke-lookup-pass": "passed",
    "example-timeout5-still-passed": "passed",
    "example-assertion-fail": "failed",
    "uniswap-bridge-assertion-too-strict": "failed",
    "etherscan-captcha-blocked": "blocked",
    "arbitrum-bridge-captcha-blocked": "blocked",
    "arbitrum-portal-captcha-blocked": "blocked",
  };

  it("covers every recorded fixture (none forgotten)", () => {
    const onDisk = readdirSync(FIXTURES)
      .filter((f) => f.endsWith(".ndjson"))
      .map((f) => f.replace(/\.ndjson$/, ""))
      .sort();
    expect(onDisk).toEqual(Object.keys(expected).sort());
  });

  for (const [name, kind] of Object.entries(expected)) {
    it(`${name} → ${kind}`, () => {
      const { stdout, exitCode } = loadFixture(name);
      const output = parseKaneOutput(stdout);
      expect(output.badLines).toBe(0);
      expect(output.runEnd).toBeDefined();
      expect(typeof output.runEnd?.credits_consumed).toBe("number");
      expect(output.evidencePath).toMatch(/\.evidence$/);
      expect(classifyKaneRun({ exitCode, output }).kind).toBe(kind);
    });
  }

  it("captcha runs are never 'failed' — they can't reach the judge or become a defect (BR-6, BR-11)", () => {
    const { stdout, exitCode } = loadFixture("etherscan-captcha-blocked");
    expect(exitCode).toBe(1);
    const outcome = classifyKaneRun({ exitCode, output: parseKaneOutput(stdout) });
    expect(outcome.kind).toBe("blocked");
    expect(outcome.why).toMatch(/not a problem with the guide/);
  });

  it("reads the step-by-step progress of the Revoke.cash run", () => {
    const output = parseKaneOutput(loadFixture("revoke-lookup-pass").stdout);
    const done = output.progress.filter((p) => p.status === "done").map((p) => p.remark);
    expect(done).toContain("type: Typing vitalik.eth in address search bar");
    expect(output.runEnd?.final_state).toMatchObject({ url: "https://revoke.cash/address/vitalik.eth" });
  });
});

// ---------------------------------------------------------------------------
describe("edge cases", () => {
  const outcome = (stdout: string, exitCode: number | undefined) =>
    classifyKaneRun({ exitCode, output: parseKaneOutput(stdout) }).kind;

  it("no run_end line → error (FR-21: missing run_end = error)", () => {
    expect(outcome(line({ type: "stream_start" }), 0)).toBe("error");
  });

  it("empty output → error", () => {
    expect(outcome("", 0)).toBe("error");
  });

  it("a garbage line is skipped and counted; the run still reads correctly", () => {
    const out = parseKaneOutput(["not json at all", "[1,2]", RUN_END_PASSED].join("\n"));
    expect(out.badLines).toBe(2);
    expect(classifyKaneRun({ exitCode: 0, output: out }).kind).toBe("passed");
  });

  it("Windows line endings (\\r\\n) are fine", () => {
    expect(outcome([line({ type: "stream_start" }), RUN_END_PASSED, ""].join("\r\n"), 0)).toBe("passed");
  });

  it("unknown event types are ignored safely", () => {
    expect(outcome([line({ type: "brand_new_event", x: 1 }), RUN_END_PASSED].join("\n"), 0)).toBe("passed");
  });

  it("exit 0 but run_end status 'failed' → failed, never passed (BR-3)", () => {
    expect(outcome(line({ type: "run_end", status: "failed" }), 0)).toBe("failed");
  });

  it("exit 1 but run_end status 'passed' → failed (BR-3)", () => {
    expect(outcome(RUN_END_PASSED, 1)).toBe("failed");
  });

  it("exit 2 → error, even if run_end says passed", () => {
    expect(outcome(RUN_END_PASSED, 2)).toBe("error");
  });

  it("exit 3 → timeout", () => {
    expect(outcome(RUN_END_PASSED, 3)).toBe("timeout");
  });

  it("an unexpected exit code → error", () => {
    expect(outcome(RUN_END_PASSED, 7)).toBe("error");
  });

  it("no exit code (process killed) → error", () => {
    expect(outcome(RUN_END_PASSED, undefined)).toBe("error");
  });

  it("any blocker.* reason → blocked, whatever the exit code", () => {
    expect(outcome(line({ type: "run_end", status: "failed", reason_code: "blocker.login_wall" }), 1)).toBe("blocked");
    expect(outcome(line({ type: "run_end", status: "passed", reason_code: "blocker.captcha" }), 0)).toBe("blocked");
  });

  it("a run_end without a status → error (shape check)", () => {
    const out = parseKaneOutput(line({ type: "run_end", reason: "?" }));
    expect(out.runEnd).toBeUndefined();
    expect(out.runEndInvalid).toBe(true);
    expect(classifyKaneRun({ exitCode: 0, output: out }).kind).toBe("error");
  });

  it("our stopwatch firing → timeout, whatever Kane printed", () => {
    expect(classifyKaneRun({ exitCode: 0, output: parseKaneOutput(RUN_END_PASSED), stoppedByStopwatch: true }).kind).toBe(
      "timeout",
    );
  });
});

// ---------------------------------------------------------------------------
describe("building the kane-cli command (no shell)", () => {
  const spec = { objective: "Open the page", url: "https://revoke.cash", timeoutSeconds: 240, maxSteps: 25 };

  it("uses the documented flags in order", () => {
    expect(buildKaneArgs(spec)).toEqual([
      "run",
      "Open the page",
      "--url",
      "https://revoke.cash/",
      "--agent",
      "--headless",
      "--timeout",
      "240",
      "--max-steps",
      "25",
    ]);
  });

  it("refuses a non-https start URL", () => {
    expect(() => buildKaneArgs({ ...spec, url: "http://revoke.cash" })).toThrow(InvalidKaneSpecError);
    expect(() => buildKaneArgs({ ...spec, url: "javascript:alert(1)" })).toThrow(InvalidKaneSpecError);
  });

  it("refuses an empty objective and bad numbers", () => {
    expect(() => buildKaneArgs({ ...spec, objective: "   " })).toThrow(InvalidKaneSpecError);
    expect(() => buildKaneArgs({ ...spec, maxSteps: 0 })).toThrow(InvalidKaneSpecError);
    expect(() => buildKaneArgs({ ...spec, timeoutSeconds: 1.5 })).toThrow(InvalidKaneSpecError);
  });
});

// ---------------------------------------------------------------------------
describe("running Kane (with a fake kane-cli, no credits)", () => {
  const base = { command: process.execPath, commandPrefixArgs: [FAKE_KANE] };
  const spec = { objective: "Check the page", url: "https://example.com", timeoutSeconds: 60, maxSteps: 10 };

  it("an objective full of shell tricks arrives as ONE untouched argument", async () => {
    const tricky = `Click "Next" && echo hacked; rm -rf / | type nul & $(whoami) %PATH%`;
    const r = await runKane({ ...spec, objective: tricky }, { ...base, wallClockMs: 30_000, env: { FAKE_KANE_MODE: "echo-args" } });
    expect(r.outcome.kind).toBe("passed");
    const received = JSON.parse(r.output.runEnd?.summary ?? "[]") as string[];
    expect(received[1]).toBe(tricky);
    expect(received).toEqual(r.args);
  });

  it("replays a real fixture and saves the raw output to disk (BR-8)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wayproof-test-"));
    const rawLogPath = join(dir, "attempt-1.ndjson");
    const r = await runKane(spec, {
      ...base,
      wallClockMs: 30_000,
      rawLogPath,
      env: {
        FAKE_KANE_MODE: "fixture",
        FAKE_KANE_FIXTURE: join(FIXTURES, "etherscan-captcha-blocked.ndjson"),
        FAKE_KANE_EXIT: "1",
      },
    });
    expect(r.exitCode).toBe(1);
    expect(r.outcome.kind).toBe("blocked");
    expect(r.creditsConsumed).toBeCloseTo(10.967, 3);
    expect(readFileSync(rawLogPath, "utf8")).toContain('"reason_code":"blocker.captcha"');
    expect(existsSync(`${rawLogPath}.stderr.txt`)).toBe(true);
  });

  it("stops a run that goes past the time limit — including what it started (like Chrome)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wayproof-test-"));
    const pidFile = join(dir, "pids.json");
    const started = Date.now();
    const r = await runKane(spec, {
      ...base,
      wallClockMs: 1_500,
      env: { FAKE_KANE_MODE: "sleep", FAKE_KANE_PIDFILE: pidFile },
    });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(r.stoppedByStopwatch).toBe(true);
    expect(r.outcome.kind).toBe("timeout");

    const pids = JSON.parse(readFileSync(pidFile, "utf8")) as { fake: number; grandchild: number };
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(isAlive(pids.fake)).toBe(false);
    expect(isAlive(pids.grandchild)).toBe(false);
  }, 30_000);
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
