#!/usr/bin/env node
// wayproof — command line (C-2). Commands: doctor (FR-60), check (FR-61, simplified: options instead of wayproof.yml).
// Keys come from the environment or a .env file (never printed). Kane uses its own login.

import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { execa } from "execa";
import { AnthropicLlm, checkGuide, checkUrl, DEFAULT_CREDIT_BUDGET, DEFAULT_KANE_TIMEOUT_SECONDS, RunStore, writeReport } from "@wayproof/engine";
import { fileExists, formatDoctor, runDoctor } from "./doctor.ts";
import { exitCodeFor, formatEvent, formatSummary } from "./output.ts";

/** Loads the nearest .env (this folder or a parent). Values already set in the environment win. */
function loadDotEnv(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const file = join(dir, ".env");
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return file;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const positiveInt = (value: string): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError("must be a whole number above 0");
  return n;
};

const program = new Command()
  .name("wayproof")
  .description("Checks whether a crypto guide actually works: Kane CLI follows it in a real browser, Claude fixes what fails, Kane re-runs to prove the fix.")
  .version("0.1.0");

program
  .command("doctor")
  .description("check that this computer is ready (Node, Chrome, kane-cli and its login, Claude key)")
  .action(async () => {
    loadDotEnv(process.cwd());
    const result = await runDoctor({
      nodeVersion: process.version,
      env: process.env,
      platform: process.platform,
      fileExists,
      exec: async (command, args) => {
        try {
          const r = await execa(command, args, { reject: false, stdin: "ignore", windowsHide: true, timeout: 60_000 });
          return { exitCode: typeof r.exitCode === "number" ? r.exitCode : undefined, stdout: String(r.stdout ?? "") };
        } catch {
          return { exitCode: undefined, stdout: "" };
        }
      },
    });
    console.log(formatDoctor(result));
    process.exitCode = result.ok ? 0 : 2;
  });

program
  .command("check")
  .description("check one guide and write a Proof Report")
  .argument("<guide-url>", "the guide's https address")
  .option("--allow <sites>", "extra allowed sites, comma-separated (the guide's own site is always allowed)", "")
  .option("--budget <credits>", "Kane credit budget for this check", positiveInt, DEFAULT_CREDIT_BUDGET)
  .option("--runs-dir <folder>", "where run folders are saved", ".wayproof/runs")
  .option("--kane-timeout <seconds>", "Kane --timeout per run (Wayproof also stops Kane 60 s after it)", positiveInt, DEFAULT_KANE_TIMEOUT_SECONDS)
  .option("--max-steps <n>", "Kane --max-steps per run", positiveInt, 25)
  .action(async (guideUrl: string, opts: { allow: string; budget: number; runsDir: string; kaneTimeout: number; maxSteps: number }) => {
    loadDotEnv(process.cwd());

    let host: string;
    try {
      host = new URL(guideUrl).hostname;
    } catch {
      host = "";
    }
    const allowed = [host, ...opts.allow.split(",").map((d) => d.trim()).filter(Boolean)];
    const urlCheck = checkUrl(guideUrl, allowed);
    if (!urlCheck.ok) {
      console.error(`✖ ERR-URL-INVALID  That doesn't look like a web link. Paste the full address starting with https:// (${urlCheck.why})`);
      process.exitCode = 2;
      return;
    }
    const model = process.env["ANTHROPIC_MODEL"];
    if (!process.env["ANTHROPIC_API_KEY"] || !model) {
      console.error("✖ ERR-CONFIG  ANTHROPIC_API_KEY and ANTHROPIC_MODEL must be set (copy .env.example to .env). Run: wayproof doctor");
      process.exitCode = 2;
      return;
    }

    const store = new RunStore(resolve(opts.runsDir));
    const run = await checkGuide(
      {
        guideUrl,
        allowedDomains: allowed.slice(1),
        creditBudget: opts.budget,
        kaneTimeoutSeconds: opts.kaneTimeout,
        kaneMaxSteps: opts.maxSteps,
        source: "cli",
      },
      {
        llm: new AnthropicLlm({ model }),
        store,
        onEvent: (event) => {
          const line = formatEvent(event);
          if (line) console.log(line);
        },
      },
    );

    const { htmlPath } = await writeReport(store, run);
    console.log(formatSummary(run, relative(process.cwd(), htmlPath) || htmlPath));
    process.exitCode = exitCodeFor(run);
  });

await program.parseAsync(process.argv);
