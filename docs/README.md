# Wayproof — documentation set (index)

> **Wayproof checks the "way" a crypto project tells people to go — its how-to guides, its key screens and its official links — by having Kane CLI follow them in a real browser, sending every failure to a Claude-powered fixer, and re-running Kane until each finding is proven fixed or handed to a human.**
> Two ways to use it: a **command-line tool** (`wayproof`) and a **web app**.

This folder is the single source of truth for the product. The documents are numbered in the order they should be read and **share one ID system**, so a change in one document can be traced in the others.

| # | Document | Role (who owns it in a team) | Answers |
|---|---|---|---|
| 01 | [01-PRD.md](01-PRD.md) | Product Manager | What are we building, for whom, why, what's in scope |
| 02 | [02-UX-USER-FLOWS.md](02-UX-USER-FLOWS.md) | UX Designer | Personas, journeys, user flows, navigation, screen inventory, error flows |
| 03 | [03-WIREFRAMES-UI-SPEC.md](03-WIREFRAMES-UI-SPEC.md) | UI / Product Designer | What each screen looks like: wireframes, components, states, visual spec, responsive rules |
| 04 | [04-SRS.md](04-SRS.md) | Business Analyst | Exactly how the system behaves: requirements, business rules, permissions, validation, errors, acceptance criteria |
| 05 | [05-DATA-FLOW.md](05-DATA-FLOW.md) | Business Analyst + Architect | Where data comes from, how it moves, where it's stored, who may access it |
| TDD | [../TDD.md](../TDD.md) | Software Architect + Tech Lead | **Central technical design**: architecture, stack, components, data model, APIs, integrations, security, errors, deployment, tests, decisions, build plan (replaces 06) |
| — | [../PRODUCT_SURFACE_MAP.md](../PRODUCT_SURFACE_MAP.md) | Product Architect | The product's surfaces, access model, routes, journeys, states and MVP priorities — the map that links 01–05 and TDD |
| — | [../HACKATHON_LANDING_PAGE_AND_FRONTEND_TOOLING.md](../HACKATHON_LANDING_PAGE_AND_FRONTEND_TOOLING.md) | Product Designer + Frontend Architect | Pitch vs proof, landing structure, judge journey, frontend skills/tools registry (nothing installed) |
| — | [../hackathon.md](../hackathon.md) | — | Hackathon rules, tools, setup steps for Claude Code |
| — | [../CLAUDE.md](../CLAUDE.md) | Tech Lead | Working rules for the coding agent |
| — | [../DEBUGGING.md](../DEBUGGING.md) | — | Bug investigation procedure |

---

## How the documents stay in sync

### Shared ID system

| Prefix | Meaning | Defined in | Referenced by |
|---|---|---|---|
| `G-` | Product goal | 01 | 04, 06 |
| `F-` | Feature (scope item) | 01 | 02, 03, 04, 06 |
| `P-` | Persona | 02 | 01, 03 |
| `UF-` | User flow | 02 | 03, 04, 05 |
| `S-` | Web screen | 02 (inventory), 03 (design) | 04, 05 |
| `T-` | Terminal (CLI) output view | 02 (inventory), 03 (design) | 04 |
| `FR-` | Functional requirement | 04 | 02, 03, 05, 06 |
| `BR-` | Business rule | 04 | 02, 05, 06 |
| `ERR-` | Error code shown to users | 04 | 02, 03, 06 |
| `DF-` | Data flow | 05 | 04, 06 |
| `D-` | Data store | 05 | 06 |
| `C-` | Technical component | TDD.md | 04, 05 |
| `ADR-` | Architecture decision | TDD.md | all |
| `A-` | Runner API endpoint | TDD.md | 03, 04 |
| `TC-` | **To confirm** (open item) | this file | all |

**Rule:** when you change an item, search all documents for its ID and update every mention. A requirement (`FR-`) must point to at least one flow (`UF-`) and one screen (`S-`/`T-`); every screen must be reached by at least one flow.

### What counts as a fact

Every statement in these documents is one of three kinds, and is labelled when it matters:

| Label | Meaning |
|---|---|
| **[Rule]** | From the official KaneCLI Online Hackathon pages (sources below) |
| **[Kane doc]** | From Kane CLI's official README or documentation (sources below) |
| **[Observed]** | Seen in a real Kane run on the owner's computer, with the raw output kept (details in TDD.md §13.1). When it disagrees with [Kane doc], the code follows [Observed] |
| **[Decided]** | Decided by the project owner (softalpha0) in conversation |
| **[Proposed]** | A design or engineering proposal in these documents — not a fact; can be changed |
| **[TC-n]** | Unknown — must be confirmed before it's treated as true |

TDD.md uses the equivalent labels CONFIRMED ([Rule]/[Kane doc]/[Decided]/[Observed]), RECOMMENDATION ([Proposed]), NEEDS CONFIRMATION ([TC]) and ASSUMED (working assumptions listed in TDD.md §24).

Nothing outside these labels is assumed. If a number, model name, price or behaviour isn't sourced or decided, it is a `TC-` item.

---

## Decisions made by the owner [Decided]

| Decision | Date |
|---|---|
| Build for the KaneCLI Online Hackathon (TestMu AI) | 15 Nov 2026 |
| Product combines three checks: **guides**, **links**, **screens** | 15 Nov 2026 |
| Name: **Wayproof** | 16 Nov 2026 |
| Two interfaces: **command line** and **web app** | 16 Nov 2026 |
| AI provider for Wayproof's agents: **Anthropic (Claude)** | 16 Nov 2026 |
| **Real projects only** — no self-built demo site with planted mistakes | 16 Nov 2026 |
| Real guides: Claude proposes, owner approves before use | 16 Nov 2026 |

## To-confirm register

| ID | Open item | Why it matters | How to resolve |
|---|---|---|---|
| TC-1 | **Approval of the real guides** to check. Proposed: Revoke.cash "How to revoke token approvals", Arbitrum "Quickstart: Arbitrum bridge"; backup: Across "How to Bridge with Across" | Wayproof's demo and evidence depend on them | Owner approves or replaces |
| TC-2 | Whether Kane can operate each proposed site's pre-wallet steps (e.g. choose networks on bridge.arbitrum.io before connecting a wallet); and what Kane's output looks like on **failed / error / timeout** runs (a passing run was recorded 16 Nov — TDD.md §13.1) | Decides how many guide steps can be checked; the adapter must parse every outcome | Day-0 Kane runs |
| TC-3 | Which Claude model to use, and the API credit budget | Cost, speed, quality | Owner checks their Anthropic console |
| TC-4 | Hosting provider for the web app's Kane runner (needs Chrome + kane-cli) | Web app can't run checks without it | Owner chooses; Kane docs list Docker/CI recipes |
| TC-5 | What data Kane sends to TestMu AI's cloud during a run (runs return a `test_url`) | Privacy statement in the web app | Read Kane's docs / ask in the hackathon Slack |
| TC-6 | Whether one person can be on two teams, and team-change rules | Team planning | Ask in Slack (not stated on the site) |
| TC-7 | Whether "your agent and Kane CLI talked to each other" needs to be automatic | Judging bar 3 | Ask in Slack; Wayproof is designed to be automatic anyway |
| TC-8 | Winners announcement date; any workshops and recordings | Planning | Not stated on the site; ask in Slack |
| TC-9 | Exact demo video limit ("about 3–5 minutes") | Video plan | Ask in Slack |
| TC-10 | Web app access policy: who may check non-listed projects, and run limits per visitor | Protects the 10,000 free Kane credits | Owner decides (proposal in 04-SRS BR-9/BR-10) |
| TC-11 | Domain / URL for the web app | Live link in submission | Owner |
| TC-12 | Whether to store web app reports in a database or files | Shareable report links | Owner + architect (proposal: SQLite, TDD.md ADR-003) |
| ~~TC-13~~ | Whether Kane CLI runs on Windows — **resolved 16 Nov 2026: yes.** Kane 0.10.4 installed with npm and passed a headless Chrome run on Windows 11 [Observed] | Local CLI on the owner's computer | Done (setup steps 6 and 9) |
| TC-14 | Why the account balance fell **17.22** credits (11,200 → 11,182.78) on a run whose `run_end.credits_consumed` was **2.88** — is start-up/planning billed separately, or is the balance delayed? | Budgets (BR-9, BR-10) and `ERR-BUDGET` would undercount real spend | Compare `kane-cli balance` before/after the next few runs; ask in Slack |

---

## Hackathon facts used across all documents [Rule]

| Item | Fact |
|---|---|
| Event | KaneCLI Online Hackathon, organized by TestMu AI. "Build it with any agent. Verify it with Kane. Ship in a week." |
| Dates | Kickoff Thu 12 Nov; **deadline Thu 19 Nov, 11:59 PM IST (10:29 AM PT)**; no pushes after |
| Format | Online, anywhere in the world; 18+; solo or teams up to 4 |
| Required tech | **Kane CLI** (`npm install -g @testmuai/kane-cli`); registered on TestMu AI with the same email as Slack and submission; 10,000 free credits for one month |
| Repo | Public; initialized on or after 12 Nov; commit history checked |
| Judges must run it | Working credentials for any login/paid service; a fallback (recorded run or backup deploy) for third-party services |
| Submission | GitHub URL · About (what, which agent, what Kane does) · YouTube demo ~3–5 min (recorded) · live URL (optional) · ≥ 2 public posts (HN, X, Reddit or LinkedIn) |
| Judging bars | 1 works end to end · 2 Kane CLI caught or proved something · 3 your agent and Kane CLI talked to each other. Miss a bar and the rest isn't scored |
| Dimensions (25% each) | Ships · Verified · Closed loop · Craft ("would a developer install it tonight"). Ties: Verified, then Closed loop |
| Prizes | $1,500 / $1,000 / $500 + $250 OpenAI credits each, founders 1:1, 3 months Kane CLI Pro, blog feature |

## Kane CLI facts used across all documents [Kane doc]

| Item | Fact |
|---|---|
| Install / requirements | `npm install -g @testmuai/kane-cli` (Node 18+); Google Chrome (stable) installed locally |
| Login | `kane-cli login`; CI: `kane-cli login --username … --access-key …` |
| Run | `kane-cli run "<objective>" --url <url> --agent --headless --timeout <s> --max-steps <n>` (default max steps 50) |
| Output | `--agent` = NDJSON on stdout; progress events `{step, status: running/done/failed, remark}`; script against **`run_end`**: `status, summary, final_state, duration, credits, session_dir, run_dir, test_url`. **[Observed] on 0.10.4:** the credits field is **`credits_consumed`** (no `credits` field); `run_end` also has `one_liner, reason, result_code, reason_code, run_id, per_flow_metadata`; other event types appear too (`stream_start`, `recording_state`, `skill_update_available`, `bifurcation`, `coverage`) and must be ignored safely — full table in TDD.md §13.1 |
| Exit codes | `0` passed · `1` failed · `2` error (auth, setup, infrastructure) · `3` timeout/cancelled |
| Evidence | Each run seals an `.evidence` pack (steps, per-step screenshots, console and network logs, failure records) in `.testmuai/evidence/`; `kane-cli evidence serve <path>`. **[Observed] on 0.10.4 (Windows):** the pack was a single file under `~/.testmuai/kaneai/sessions/<session_id>/evidence/`, not in the working folder; its path is given in the `coverage` event (`pack`) and on stderr |
| Credits | `kane-cli balance` prints available credits [Observed]. Balance drop vs `credits_consumed`: **TC-14** |
| Test files | Markdown `_test.md`, each `## heading` a step; `kane-cli testmd run <path>`; passed steps replay from cache |
| Agents | Packaged skill for Claude Code, Codex CLI, Gemini CLI: `npx @testmuai/kane-cli-skill`. No MCP server documented. [Observed]: the CLI itself offers `kane-cli install skill` |
| Mobile | Local simulators/emulators need macOS Apple Silicon; real devices need a paid plan |
| CI | Headless + exit codes gate pipelines; recipes for GitHub Actions, GitLab, Jenkins, Docker |

## Sources

- Hackathon: https://www.kaneclihack.sh/ (challenge, prizes, judging, rules) · https://www.kaneclihack.sh/setup
- Kane CLI: https://github.com/LambdaTest/kane-cli · https://www.testmuai.com/support/docs/kane-cli-introduction/
- Previous edition winners: https://www.testmuai.com/blog/kane-cli-hackathon-winners/
- Proposed real guides (TC-1): https://revoke.cash/learn/approvals/how-to-revoke-token-approvals · https://docs.arbitrum.io/getting-started-users · https://docs.across.to/user-docs/how-to-use-across/bridging

*Last updated: 16 Nov 2026.*
