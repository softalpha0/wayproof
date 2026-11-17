# hackathon.md — everything Claude Code needs to know

> **For Claude Code:** read this whole file first. I am a **beginner**. Explain everything in plain language. Work **one step at a time**: say what you're about to do and why, do it, **confirm it worked**, then wait for me before moving on. Never install or change anything without telling me first. Don't invent facts: if something isn't in this file, in the official docs linked here, or decided by me, ask me.

**Labels used:** **[Rule]** = from the official hackathon pages · **[Kane doc]** = from Kane CLI's official docs · **[Decided]** = I decided it · **[Proposed]** = a plan, can change · **[TC]** = to confirm, unknown.

---

## Part 1 — The hackathon

### 1.1 Basics [Rule]
| | |
|---|---|
| **Name** | KaneCLI Online Hackathon |
| **Organizer** | TestMu AI (makers of Kane CLI) |
| **Tagline** | "Build it with any agent. Verify it with Kane. Ship in a week." |
| **What to build** | An app, agent or workflow built with an AI coding agent (web or mobile), then verified with **Kane CLI** |
| **Where** | Fully online, anywhere in the world |
| **Who** | 18+; solo or teams up to 4; TestMu AI employees and partners not eligible |
| **Kickoff** | Thu 12 Nov 2026 |
| **Deadline** | **Thu 19 Nov 2026, 11:59 PM IST = 10:29 AM PT = 7:29 PM Lagos.** No pushes after the deadline |
| **My submit target** | Thu 19 Nov, **3:00 PM Lagos** [Proposed] |
| **Website** | https://www.kaneclihack.sh/ |
| **Contact** | conferences@testmuai.com · Slack (link on the site) |

### 1.2 Prizes [Rule]
| Place | Prize |
|---|---|
| 1st | $1,500 cash + $250 OpenAI credits |
| 2nd | $1,000 cash + $250 OpenAI credits |
| 3rd | $500 cash + $250 OpenAI credits |
Winners also get a 1:1 with the founders, 3 months of Kane CLI Pro and a featured blog post. Every team that ships gets a "Verified with Kane CLI" badge; every team that submits gets a certificate. No separate tracks.

### 1.3 Rules that affect the build [Rule]
- **Kane CLI is the only required technology.** Any agent, framework or stack otherwise.
- Register on **testmuai.com with the same email** as Slack and the submission; new accounts get **10,000 free Kane credits for one month**. You must have actually run Kane CLI.
- **New public GitHub repo created on or after 12 Nov.** Commit history is checked. Old idea OK; old code not.
- **Judges must be able to run the project.** Provide working credentials for any login or paid service, and a **fallback** (recorded run or backup deploy) for third-party services.
- **Demo must be a recorded video**, not live.
- One submission per team; can be updated until the deadline.
- Fraudulent, automated, duplicated or rule-gaming entries can be disqualified.
- Code of Conduct applies, including Slack.

### 1.4 How judging works [Rule]
Scored by **three TestMu AI engineers**.

**Three bars first — miss one and the rest isn't scored:**
1. It works end to end.
2. Kane CLI caught or proved something.
3. Your agent and Kane CLI talked to each other.

**Then four dimensions, 25% each:**
| Dimension | Meaning |
|---|---|
| Ships | A real flow that runs end to end |
| Verified | Kane caught or confirmed something meaningful |
| Closed loop | Kane's result feeds back to the agent |
| Craft | Would a developer install it tonight? |
Ties break on **Verified**, then **Closed loop**.

### 1.5 What to submit (one form) [Rule]
1. GitHub URL (public, started on or after 12 Nov)
2. About: what you built, which agent, what Kane does
3. Demo video on YouTube, about 3–5 minutes, recorded
4. Live URL (optional)
5. **Launch buzz: at least 2 public posts** (Hacker News, X, Reddit or LinkedIn)

### 1.6 Links [Rule]
| What | Link |
|---|---|
| Site | https://www.kaneclihack.sh/ |
| Register | https://www.kaneclihack.sh/o/register |
| Submit | https://www.kaneclihack.sh/o/submit |
| Setup page | https://www.kaneclihack.sh/setup |
| Claim credits | https://www.testmuai.com/kane-cli/#creditOffer |
| Kane CLI docs | https://www.testmuai.com/support/docs/kane-cli-introduction/ |
| Kane CLI cookbook | https://www.testmuai.com/kane-cli-cookbook/ |
| Kane CLI GitHub | https://github.com/LambdaTest/kane-cli |
| Last edition's winners | https://www.testmuai.com/blog/kane-cli-hackathon-winners/ |

### 1.7 Not stated by the organizers [TC]
Winners announcement date · workshops and recordings · team-change rules / one person on two teams · AI-use disclosure rules · exact video limit · whether bar 3 must be automatic. → Ask in Slack.

---

## Part 2 — What I'm building: Wayproof [Decided]

**One line:** Wayproof checks whether a crypto project's **how-to guides**, **official links** and **key screens** actually work: **Kane CLI** follows them in a real browser, **Claude** proposes a fix for anything that fails, and Kane re-runs to **prove** the fix. Output: a **Proof Report** with Kane's evidence.

- Interfaces: **command line (`wayproof`)** and **web app** [Decided]
- AI for Wayproof's own agents: **Claude (Anthropic API)** [Decided]
- **Real projects only**, no fake demo site [Decided]
- **Never connects a wallet, signs or sends a transaction**; only visits allowed domains [Proposed, business rules BR-1/BR-2]
- Real guides to check — **approved 16 Nov 2026** [Decided] (Across guide URL returned 404 that day). **Arbitrum replaced the same day by Uniswap's bridging guide** (https://support.uniswap.org/hc/en-us/articles/31092864580877-How-to-bridge-tokens-using-the-Uniswap-web-app) because Arbitrum's pages show Kane a bot check (TC-15):
  - Revoke.cash — https://revoke.cash/learn/approvals/how-to-revoke-token-approvals
  - Arbitrum — https://docs.arbitrum.io/getting-started-users
  - Backup: Across — https://docs.across.to/user-docs/how-to-use-across/bridging

**Full specification (read before planning code):**
| File | What |
|---|---|
| `docs/README.md` | Index, all facts with sources, my decisions, the to-confirm list |
| `docs/01-PRD.md` | Product: problem, goals, features |
| `docs/02-UX-USER-FLOWS.md` | Personas, flows, screens |
| `docs/03-WIREFRAMES-UI-SPEC.md` | Screen layouts and visual spec |
| `docs/04-SRS.md` | Exact behaviour, rules, errors, acceptance criteria |
| `docs/05-DATA-FLOW.md` | Where data comes from and goes |
| `TDD.md` | Central technical design and build plan |
| `CLAUDE.md` | Working rules |
| `DEBUGGING.md` | How to investigate and fix bugs |

---

## Part 3 — Technologies (with official docs)

### 3.1 Kane CLI (required) [Kane doc]
- **What it is:** a command-line tool that takes a test written in plain English and runs it in a real Chrome browser (or iOS simulator / Android emulator), returning pass or fail.
- **Needs:** Node.js 18+ (for the npm install) and **Google Chrome (stable)** installed.
- **Install:** `npm install -g @testmuai/kane-cli` (also Homebrew and a shell script on macOS/Linux). **Windows: works** — 0.10.4 installed with npm and passed a headless run on 16 Nov 2026 [Observed; TC-13 resolved].
- **Log in:** `kane-cli login` · check: `kane-cli whoami` · CI: `kane-cli login --username … --access-key …`
- **Run a test:**
  ```
  kane-cli run "Go to https://example.com and assert the title contains 'Example'"
  kane-cli run "<objective>" --url <url> --agent --headless --timeout 120 --max-steps 30
  ```
  - `--agent` → machine-readable output: one JSON object per line (NDJSON). Progress events have `step`, `status` (`running`/`done`/`failed`), `remark`.
  - The **`run_end`** event is the one to read: `status`, `summary`, `final_state`, `duration`, `credits`, `session_dir`, `run_dir`, `test_url`. **[Observed] on 0.10.4:** the credits field is actually `credits_consumed`, and other event types appear too (see TDD.md §13.1).
  - `--headless` → no visible window (required in CI). `--max-steps` default 50.
- **Exit codes:** `0` passed · `1` failed · `2` error (auth, setup, infrastructure) · `3` timeout or cancelled.
- **Evidence:** every run saves an `.evidence` pack (steps, per-step screenshots, console and network logs, failure records) in `.testmuai/evidence/`; view with `kane-cli evidence serve <path>`. **[Observed]:** on Windows it was saved under `~/.testmuai/kaneai/sessions/<id>/evidence/` instead; the path is printed on stderr and in the `coverage` event.
- **Test files:** Markdown `_test.md` (each `## heading` is a step); `kane-cli testmd run <path>`; passed steps replay from cache.
- **Skill for coding agents (Claude Code, Codex, Gemini CLI):** `npx @testmuai/kane-cli-skill`. No MCP server is documented.
- **Mobile:** local simulators/emulators need macOS on Apple Silicon; real devices need a paid plan (not used in Wayproof).
- **Environment variables:** `KANE_CLI_CHROME_PATH` (non-standard Chrome path), `KANE_CLI_SKIP_BROWSER_DOWNLOAD`, `KANE_CLI_CDP_TIMEOUT_MS`, `KANE_CLI_CDP_RETRIES`.
- **Docs:** https://github.com/LambdaTest/kane-cli · https://www.testmuai.com/support/docs/kane-cli-introduction/

### 3.2 Claude / Anthropic API [Decided]
- Used inside Wayproof for four jobs: extract guide steps, write Kane objectives, judge Kane's result, propose fixes.
- Needs an **Anthropic API key** in an environment variable `ANTHROPIC_API_KEY` (never in code, never committed).
- **Model: Claude Opus 5.5 (`claude-opus-5-5`) [Decided 16 Nov 2026]** — key and model verified with a test call. **Budget: [TC]** — I'll check Billing in my Anthropic console.
- Docs: https://docs.anthropic.com/

### 3.3 Tools the project uses [Proposed in TDD.md]
| Tool | Why | Official docs |
|---|---|---|
| Node.js (LTS, 22+) | Runs Kane CLI, the CLI, the server and the web app (22+ decided 17 Nov: execa 10 needs it) | https://nodejs.org/ |
| pnpm | Manages the monorepo packages | https://pnpm.io/ |
| Git + GitHub | Public repo (required) | https://git-scm.com/ · https://docs.github.com/ |
| GitHub CLI (`gh`) — optional | Create the repo from the terminal | https://cli.github.com/ |
| Google Chrome (stable) | Required by Kane CLI | https://www.google.com/chrome/ |
| TypeScript | Language for all code | https://www.typescriptlang.org/docs/ |
| Zod | Validates config, Kane output, Claude output | https://zod.dev/ |
| Next.js | Web app screens | https://nextjs.org/docs |
| Hono | Runner server API + live updates | https://hono.dev/ |
| Commander | CLI commands | https://github.com/tj/commander.js |
| Vitest | Tests | https://vitest.dev/ |
| Anthropic TypeScript SDK | Calls Claude | https://docs.anthropic.com/ |

Hosting for the web app's runner server: **[TC]** (needs Chrome + kane-cli).

---

## Part 4 — Setting up my computer (Claude Code: do this first)

**My computer:** Windows 11 Pro 64-bit, Windows PowerShell 5.1 (checked 16 Nov 2026). Use commands that work in **PowerShell**. If a command needs admin rights, tell me before running it.

Do these **one at a time**. For each step: (1) explain in one or two plain sentences what it is and why we need it, (2) check if it's already installed, (3) only install if missing, after asking me, (4) run the check again and show me the result, (5) wait for my "OK" before the next step.

| # | Step | Check command | Done when |
|---|---|---|---|
| 1 | Find out my operating system and shell | `$PSVersionTable` / `systeminfo` (Windows) | You've told me which OS and shell I have |
| 2 | Git | `git --version` | A version prints |
| 3 | Node.js (LTS, 20 or newer) | `node --version` and `npm --version` | Node ≥ 20 prints |
| 4 | pnpm | `pnpm --version` | A version prints (install via Corepack: `corepack enable`, if Node includes it) |
| 5 | Google Chrome (stable) | Check it's installed (e.g. its install folder or `Get-Command chrome`) | Chrome found |
| 6 | Kane CLI | `kane-cli --version` (after `npm install -g @testmuai/kane-cli`) | A version prints |
| 7 | My TestMu account + free credits | I register with the **same email** as the hackathon; claim credits at the link in 1.6 | I confirm |
| 8 | Kane login | `kane-cli login` then `kane-cli whoami` | Shows my account |
| 9 | **First Kane test** | `kane-cli run "Go to https://example.com and assert the title contains 'Example'" --agent --headless` | Exit code 0 and a `run_end` line with status passed |
| 10 | Kane skill for Claude Code (optional) | `npx @testmuai/kane-cli-skill` | Skill installed; explain what it changed |
| 11 | GitHub account + repo | Create a **new public repo** named `wayproof` (on/after 12 Nov) | Repo URL exists |
| 12 | Anthropic API key | I set `ANTHROPIC_API_KEY` in a `.env` file (gitignored) | A tiny test call works [model TC] |
| 13 | Project folder | Clone the repo; copy `docs/`, `CLAUDE.md`, `hackathon.md` into it; first commit | `git log` shows the commit |
| 14 | Day-0 Kane check on real guides | Only after I approve the guides: run Kane on each guide's **pre-wallet** steps; save the NDJSON output to `fixtures/kane/` | Real outputs saved; tell me what Kane could and couldn't do |

If anything fails, explain the error in plain words, suggest the fix, and wait.

---

## Part 5 — How to work with me

- Plan first, then wait for my approval before writing code.
- Build in the order in `TDD.md` §12. One feature at a time; tell me how to test it and how to try to break it; commit after each working feature with the requirement ID (e.g. `feat(FR-21): kane adapter`).
- Never connect a wallet, sign, or send a transaction. Only visit allowed domains.
- Never report a problem Kane didn't actually observe. Every verdict links to Kane evidence.
- Keep secrets in environment variables only.
- If you learn something new (e.g. real Kane output), add it to `TDD.md` and the to-confirm list in `docs/README.md`.

## Part 6 — Timeline (Lagos time)
| Day | Goal |
|---|---|
| Mon 16 Nov | Setup (Part 4), approve guides, first real Kane runs, repo + docs committed |
| Tue 17 Nov | Engine + CLI: `wayproof check` on a real guide produces a report |
| Wed 18 Nov | Web app + server deployed; published reports; feature freeze 8 PM |
| Thu 19 Nov | README, video, 2 public posts, **submit by 3 PM** (deadline 7:29 PM) |
