// Runs kane-cli once and returns what happened (C-5, FR-21). The only code in Wayproof that starts Kane.
// - No shell: the command and its arguments are passed as a list.
// - Own stopwatch: day-0 showed `--timeout 5` did not stop a 23-second run, so Wayproof kills Kane itself.
// - Raw output is saved to disk so every verdict can link to it (BR-8).
// This module does not decide what is allowed to run; the safety gate (C-6) does that before calling it.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { execa } from "execa";
import { buildKaneArgs, type KaneRunSpec } from "./args.ts";
import { classifyKaneRun, type KaneOutcome } from "./outcome.ts";
import { parseKaneOutput, type KaneOutput } from "./output.ts";
import { checkRemark } from "../safety/wallet.ts";

export interface RunKaneOptions {
  /** Hard limit for the whole kane-cli process, in milliseconds. */
  wallClockMs: number;
  /** Where to save Kane's raw stdout (NDJSON). Stderr goes to the same path + ".stderr.txt". */
  rawLogPath?: string;
  /** Program to start. Default "kane-cli". Tests use a fake. */
  command?: string;
  /** Arguments placed before Kane's own (used by tests to run a fake script with node). */
  commandPrefixArgs?: string[];
  /** Working folder for the process. */
  cwd?: string;
  /** Extra environment variables for the process (added to the current environment). */
  env?: Record<string, string>;
}

export interface KaneRunResult {
  outcome: KaneOutcome;
  exitCode: number | undefined;
  stoppedByStopwatch: boolean;
  /** Set when the wallet tripwire stopped Kane (BR-1); says which progress line triggered it. */
  stoppedForSafety: string | undefined;
  output: KaneOutput;
  /** Kane's own credit figure for this run (`run_end.credits_consumed`). The account balance may fall by more (TC-14). */
  creditsConsumed: number | undefined;
  evidencePath: string | undefined;
  rawLogPath: string | undefined;
  durationMs: number;
  /** The exact argument list given to kane-cli (for the report and debugging). */
  args: string[];
}

export async function runKane(spec: KaneRunSpec, options: RunKaneOptions): Promise<KaneRunResult> {
  const args = buildKaneArgs(spec);
  const command = options.command ?? "kane-cli";
  const fullArgs = [...(options.commandPrefixArgs ?? []), ...args];

  const started = Date.now();
  const child = execa(command, fullArgs, {
    reject: false,
    stdin: "ignore",
    windowsHide: true,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
  });

  let stoppedByStopwatch = false;
  let stoppedForSafety: string | undefined;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void killProcessTree(child.pid, () => child.kill("SIGKILL"));
  };

  const timer = setTimeout(() => {
    stoppedByStopwatch = true;
    stop();
  }, options.wallClockMs);

  // Wallet tripwire (BR-1, FR-26): watch progress lines as they arrive and stop Kane at the first
  // sign of a wallet prompt. Always on — it cannot be switched off by a caller.
  let pending = "";
  child.stdout?.on("data", (chunk: Buffer | string) => {
    if (stoppedForSafety !== undefined) return;
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const remark = progressRemark(line);
      if (remark === undefined) continue;
      const check = checkRemark(remark);
      if (check.stop) {
        stoppedForSafety = check.why;
        stop();
        return;
      }
    }
  });

  const result = await child;
  clearTimeout(timer);
  const durationMs = Date.now() - started;

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";

  if (options.rawLogPath) {
    await mkdir(dirname(options.rawLogPath), { recursive: true });
    await writeFile(options.rawLogPath, stdout);
    await writeFile(`${options.rawLogPath}.stderr.txt`, stderr);
  }

  const output = parseKaneOutput(stdout);
  const exitCode = typeof result.exitCode === "number" ? result.exitCode : undefined;
  const outcome = classifyKaneRun({
    exitCode,
    output,
    stoppedByStopwatch,
    ...(stoppedForSafety !== undefined ? { stoppedForSafety } : {}),
  });

  return {
    outcome,
    exitCode,
    stoppedByStopwatch,
    stoppedForSafety,
    output,
    creditsConsumed: output.runEnd?.credits_consumed,
    evidencePath: output.evidencePath,
    rawLogPath: options.rawLogPath,
    durationMs,
    args,
  };
}

/** The remark of a progress line ({step, status, remark}, no `type`), or undefined. */
function progressRemark(line: string): string | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const event = value as Record<string, unknown>;
    if (event["type"] !== undefined) return undefined;
    return typeof event["remark"] === "string" ? event["remark"] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Stops the process and everything it started (Kane starts Chrome).
 * On Windows `kane-cli` is a wrapper script, so killing only the wrapper could leave Chrome running:
 * taskkill /T stops the whole tree.
 */
async function killProcessTree(pid: number | undefined, fallback: () => void): Promise<void> {
  if (pid === undefined) {
    fallback();
    return;
  }
  if (process.platform === "win32") {
    const r = await execa("taskkill", ["/pid", String(pid), "/T", "/F"], { reject: false, windowsHide: true });
    if (r.exitCode !== 0) fallback();
    return;
  }
  fallback();
}
