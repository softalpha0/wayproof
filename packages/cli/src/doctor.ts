// `wayproof doctor` (FR-60, T-01): is this computer ready to run checks? Prints a fix for every problem.
// Never prints keys or Kane credentials — only whether they are set.

import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DoctorDeps {
  nodeVersion: string;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  fileExists: (path: string) => boolean;
  /** Runs a program without a shell; never throws. */
  exec: (command: string, args: string[]) => Promise<{ exitCode: number | undefined; stdout: string }>;
}

export interface DoctorLine {
  ok: boolean;
  text: string;
  fix?: string;
}

export function chromeCandidates(platform: NodeJS.Platform, env: Record<string, string | undefined>): string[] {
  const list: string[] = [];
  if (env["KANE_CLI_CHROME_PATH"]) list.push(env["KANE_CLI_CHROME_PATH"]);
  if (platform === "win32") {
    for (const base of [env["ProgramFiles"], env["ProgramFiles(x86)"], env["LOCALAPPDATA"]]) {
      if (base) list.push(join(base, "Google", "Chrome", "Application", "chrome.exe"));
    }
  } else if (platform === "darwin") {
    list.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    list.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome");
  }
  return list;
}

export async function runDoctor(deps: DoctorDeps): Promise<{ ok: boolean; lines: DoctorLine[] }> {
  const lines: DoctorLine[] = [];

  const major = Number(deps.nodeVersion.replace(/^v/, "").split(".")[0]);
  lines.push(
    major >= 22
      ? { ok: true, text: `Node ${deps.nodeVersion.replace(/^v/, "")}` }
      : { ok: false, text: `Node ${deps.nodeVersion} is too old (need 22 or newer)`, fix: "install Node.js 22 LTS or newer from https://nodejs.org/" },
  );

  const chrome = chromeCandidates(deps.platform, deps.env).find((p) => deps.fileExists(p));
  lines.push(
    chrome
      ? { ok: true, text: "Google Chrome found" }
      : { ok: false, text: "Google Chrome not found", fix: "install Chrome (stable) from https://www.google.com/chrome/ or set KANE_CLI_CHROME_PATH" },
  );

  const version = await deps.exec("kane-cli", ["--version"]);
  const kaneInstalled = version.exitCode === 0;
  lines.push(
    kaneInstalled
      ? { ok: true, text: `kane-cli ${version.stdout.trim()} installed` }
      : { ok: false, text: "kane-cli not installed", fix: "npm install -g @testmuai/kane-cli" },
  );

  if (kaneInstalled) {
    const whoami = await deps.exec("kane-cli", ["whoami"]);
    lines.push(
      whoami.exitCode === 0
        ? { ok: true, text: "Kane logged in" }
        : { ok: false, text: "Kane not logged in", fix: "kane-cli login --oauth" },
    );
    const balance = await deps.exec("kane-cli", ["balance"]);
    const credits = balance.stdout.match(/Available credits:\s*([\d.]+)/)?.[1];
    if (credits) lines.push({ ok: true, text: `Kane credits available: ${Math.floor(Number(credits))}` });
  }

  lines.push(
    deps.env["ANTHROPIC_API_KEY"]
      ? { ok: true, text: "ANTHROPIC_API_KEY set" }
      : { ok: false, text: "ANTHROPIC_API_KEY not set", fix: "copy .env.example to .env and add your Anthropic API key" },
  );
  lines.push(
    deps.env["ANTHROPIC_MODEL"]
      ? { ok: true, text: `Claude model: ${deps.env["ANTHROPIC_MODEL"]}` }
      : { ok: false, text: "ANTHROPIC_MODEL not set", fix: "add ANTHROPIC_MODEL=claude-opus-5-5 to .env" },
  );

  return { ok: lines.every((l) => l.ok), lines };
}

export function formatDoctor(result: { ok: boolean; lines: DoctorLine[] }): string {
  const out = ["Wayproof doctor"];
  for (const l of result.lines) out.push(`  ${l.ok ? "✔" : "✖"} ${l.text}${l.fix ? `      → run: ${l.fix}` : ""}`);
  const problems = result.lines.filter((l) => !l.ok).length;
  out.push(problems === 0 ? "All good — ready to run wayproof check." : `${problems} problem${problems > 1 ? "s" : ""} found.`);
  return out.join("\n");
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}
