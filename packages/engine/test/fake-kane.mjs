// A stand-in for kane-cli used only in tests, so tests never spend Kane credits.
// Behaviour is chosen with the FAKE_KANE_MODE environment variable:
//   echo-args  print a passing run_end whose summary is the exact argument list received, exit 0
//   fixture    print the file in FAKE_KANE_FIXTURE, exit with FAKE_KANE_EXIT
//   sleep      start a long-running child (like Kane starting Chrome), write both process ids
//              to FAKE_KANE_PIDFILE, then wait a long time without exiting
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const mode = process.env.FAKE_KANE_MODE;

if (mode === "echo-args") {
  const args = process.argv.slice(2);
  process.stdout.write(JSON.stringify({ type: "stream_start", v: 1 }) + "\n");
  process.stdout.write(
    JSON.stringify({ type: "run_end", status: "passed", reason_code: "success.complete", summary: JSON.stringify(args), credits_consumed: 0 }) + "\n",
  );
  process.exit(0);
} else if (mode === "fixture") {
  process.stdout.write(readFileSync(process.env.FAKE_KANE_FIXTURE, "utf8"));
  process.exit(Number(process.env.FAKE_KANE_EXIT ?? "0"));
} else if (mode === "sleep") {
  const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], { stdio: "ignore" });
  writeFileSync(process.env.FAKE_KANE_PIDFILE, JSON.stringify({ fake: process.pid, grandchild: grandchild.pid }));
  process.stdout.write(JSON.stringify({ type: "stream_start", v: 1 }) + "\n");
  setTimeout(() => process.exit(0), 120000);
} else if (mode === "wallet-prompt") {
  // Behaves like Kane reaching a wallet prompt, then hangs: the tripwire must stop it.
  process.stdout.write(JSON.stringify({ type: "stream_start", v: 1 }) + "\n");
  process.stdout.write(JSON.stringify({ step: 2, status: "running", remark: "Step 1" }) + "\n");
  process.stdout.write(JSON.stringify({ step: 2, status: "done", remark: "click: Clicking the Connect Wallet button" }) + "\n");
  setTimeout(() => process.exit(0), 120000);
} else {
  process.stderr.write(`fake-kane: unknown FAKE_KANE_MODE ${mode}\n`);
  process.exit(2);
}
