# 01 · PRD — Wayproof

> Part of the [Wayproof documentation set](README.md). Labels: **[Rule]** hackathon page · **[Kane doc]** Kane CLI docs · **[Decided]** owner decision · **[Proposed]** proposal · **[TC-n]** to confirm.

## 1. Summary

**Wayproof** checks whether the way a crypto project tells people to do something actually works and is safe. It reads a project's **how-to guides**, its **official links** and its **key screens**, turns them into plain-English test objectives, and has **Kane CLI** follow them in a real browser. Every failure goes to a **Claude** fixer agent that proposes a correction; Kane re-runs to prove the fix. The result is a **Proof Report** with Kane's evidence for every finding. **[Decided]** combined product, name, Claude, CLI + web app.

## 2. Problem

Crypto users follow written guides for risky actions — bridging, revoking approvals, using official links. When a guide is wrong or out of date (a renamed button, a missing step, a link that goes somewhere else), users get stuck, take the wrong path, or land on the wrong page. **[Decided]** — from the owner's own experience: "following project docs", "bridging", "security", "mostly everything".

The same owner also experiences AI coding agents claiming work is done when it isn't. Wayproof's design answers this inside its own product: nothing is reported as correct until Kane has run it in a real browser. **[Decided]**

## 3. Goals

| ID | Goal |
|---|---|
| G-1 | A person can check a real crypto guide and get a Proof Report showing which steps work, with Kane evidence |
| G-2 | When a step fails, Wayproof proposes a corrected step and proves it with a Kane re-run (closed loop) |
| G-3 | Wayproof checks a project's official links and shows which are reachable and consistent |
| G-4 | The same engine runs from the command line and from a web app |
| G-5 | Clear all three judging bars and score well on Ships, Verified, Closed loop and Craft **[Rule]** |
| G-6 | Never connect a wallet, sign, or move funds **[Proposed]** (safety boundary; see 04-SRS BR-1) |

## 4. Users [Proposed — from conversation, not user research]

Full personas in [02-UX-USER-FLOWS.md §1](02-UX-USER-FLOWS.md).

| ID | Persona | Uses |
|---|---|---|
| P-1 | Everyday crypto user who follows project guides | Web app |
| P-2 | Crypto project docs/devrel owner | CLI and web app |
| P-3 | Developer / CI owner of a crypto front-end | CLI |
| P-4 | Hackathon judge (TestMu AI engineer) | Web app, CLI, report |

## 5. Scope

| ID | Feature | Priority | Interfaces |
|---|---|---|---|
| F-1 | **Guide check**: read a guide page, extract user steps, Kane follows them up to any wallet step, judge result | Must | CLI, Web |
| F-2 | **Fix loop**: on failure, Claude proposes a corrected step; Kane re-runs; verdict recorded | Must | CLI, Web |
| F-3 | **Proof Report**: score, every check, every attempt, Kane evidence, corrected guide | Must | CLI (HTML file), Web (page) |
| F-4 | **Web app**: paste a guide link, watch the check live, open/share the report | Must | Web |
| F-5 | **CLI**: `doctor`, `init`, `check`, `report` commands | Must | CLI |
| F-6 | **Links check**: official links reachable, final domains as expected, browser proof where needed | Should | CLI, Web |
| F-7 | **Recorded fallback** for judges (committed run artifacts + video), as required by the rules **[Rule]** | Must | Repo |
| F-8 | **Screens check / CI gate**: key screens verified before a front-end deploy; non-zero exit on failure | Could | CLI |
| F-9 | Corrected guide download (Markdown) | Should | CLI, Web |
| F-10 | **Self-verification**: every Wayproof screen or report a user sees is verified by Kane CLI before it counts as done; Kane's results are kept in the repo as evidence. Follows the hackathon challenge: "Build it with any agent, verify it with Kane" **[Rule]** — **[Decided 17 Nov 2026]** | Must | CLI report, Web |

**Out of scope (v1):** wallet connection, signing or transactions; mobile app targets (need macOS Apple Silicon or a paid plan **[Kane doc]**); accounts and logins for Wayproof users; self-built demo site with planted mistakes **[Decided]**; checking pages not declared by the user.

## 6. Real projects to check [Decided — TC-1 approved 16 Nov 2026]

Approved by the owner on 16 Nov 2026. URL status on that date (plain HTTP): Revoke.cash 200; Arbitrum guide redirects to `docs.arbitrum.io/arbitrum-bridge/quickstart`; `bridge.arbitrum.io` redirects to `portal.arbitrum.io/bridge/`; **Across guide URL 404** (backup needs a new URL if used).
**Update 16 Nov 2026 (TC-15):** day-0 Kane runs found Arbitrum's bridge and portal pages behind a Cloudflare bot check, so **Arbitrum is replaced by Uniswap — "How to bridge tokens using the Uniswap web app"** (https://support.uniswap.org/hc/en-us/articles/31092864580877-How-to-bridge-tokens-using-the-Uniswap-web-app, updated 24 Nov 2025). Pre-wallet steps: pick the token, pick the destination network, enter the amount on app.uniswap.org — Kane did all of them in a test run. Arbitrum's blocked result stays as an honest "Couldn't check" example.

| Guide | Link | Pre-wallet steps (from the guide itself) |
|---|---|---|
| Revoke.cash — How to revoke token approvals | https://revoke.cash/learn/approvals/how-to-revoke-token-approvals | Enter an address/ENS to view approvals, choose network, sort/filter/search; also Etherscan Token Approvals page. Revoking itself needs a wallet |
| Arbitrum — Quickstart: Arbitrum bridge | https://docs.arbitrum.io/getting-started-users | Get ETH; add network details (RPC URL, chain ID, symbol). The guide connects the wallet before choosing networks — pre-wallet reach on bridge.arbitrum.io is **TC-2** |
| Across — How to Bridge with Across (backup) | https://docs.across.to/user-docs/how-to-use-across/bridging | Go to across.to/bridge; most steps after wallet connection |

## 7. Success metrics

| Metric | Target | Source |
|---|---|---|
| Judging bars cleared | 3 of 3 | [Rule] |
| Real guides checked end to end with evidence | ≥ 2 (TC-1) | Proof Reports |
| Findings proven fixed by a Kane re-run | ≥ 1 real finding, if a real defect exists | Proof Report — **Wayproof never fabricates findings**; if a guide is fully correct, the report says so |
| Judges can run it | CLI from README + web app live + recorded fallback | [Rule] |
| Public posts | ≥ 2 | [Rule] |

## 8. Constraints [Rule] [Kane doc]

See [README](README.md) fact tables. Key ones: deadline **Thu 19 Nov, 11:59 PM IST (19:29 Lagos)**; new public repo; Kane CLI required; judges must be able to run it with a fallback; 10,000 free Kane credits for one month; Kane needs Chrome.

## 9. Risks

| Risk | Effect | Response |
|---|---|---|
| Real guides may have no defects today | Bar 2 needs Kane to *catch or prove* something | Proving a guide correct also counts as "proved something" **[Rule wording: "caught or proved"]**; pick several guides to raise the chance of a real finding |
| Sites block or change for automated browsers | Checks fail for reasons unrelated to the guide | Report as `error`, not as a guide defect; keep evidence |
| Web app burns Kane credits | Runs stop | Run limits (TC-10) |
| Time (≈ 3 days left) | Unfinished features | Must list first; links next; screens last |

## 10. Milestones

See [TDD.md §23](../TDD.md). Submission target: **Thu 19 Nov, 15:00 Lagos** **[Proposed]** (4.5 h before the deadline).
