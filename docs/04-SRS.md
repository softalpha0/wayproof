# 04 · Functional Specification (SRS) — Wayproof

> Part of the [Wayproof documentation set](README.md). Traces to [01-PRD](01-PRD.md) features (`F-`), [02-UX](02-UX-USER-FLOWS.md) flows (`UF-`) and screens (`S-`/`T-`); data in [05-DATA-FLOW](05-DATA-FLOW.md); implementation in [TDD.md](../TDD.md).
> Labels: **[Rule]** · **[Kane doc]** · **[Decided]** · **[Proposed]** · **[TC-n]**. Numbers marked **[Proposed]** are starting values the owner can change.

---

## 1. Roles and permissions

| Role | Who | Can | Cannot |
|---|---|---|---|
| **Visitor** | Anyone on the web app | Start checks within limits (BR-9), view and share reports, view evidence, copy corrected guides | Exceed run limits without a code; delete reports |
| **Code holder** | Visitor with an access code (TC-10) | Start checks beyond the visitor limit, up to the code's limit | Change other people's reports |
| **CLI user** | Anyone running `wayproof` locally | Everything, using their own Kane login and Claude key | — (their own credits) |
| **Operator** | Project owner (softalpha0) | Configure limits and codes, remove reports | — |

No user accounts. **[Decided]** Access codes are the only web permission mechanism. **[Proposed]**

---

## 2. Business rules

| ID | Rule | Source |
|---|---|---|
| **BR-1** | Wayproof never connects a wallet, never signs, never submits a transaction. Steps that need a wallet are marked “Not checked — wallet step”. If Kane reaches a wallet prompt, the run stops (`ERR-BOUNDARY`). | [Proposed] safety; owner pains (security) [Decided] |
| **BR-2** | Kane only visits URLs on the check's **allowed domains** list. The list starts with the guide's own domain and domains the guide links to for its steps; the user confirms it on S-02 / in `wayproof.yml`. An entry covers itself and its sub-sites (`uniswap.org` allows `app.uniswap.org`; `docs.x.com` does not allow `x.com`) **[Decided 17 Nov 2026]**. Only `https://` addresses without a user/password part, port or IP address are allowed. | [Proposed] |
| **BR-3** | A check is **Passed** only if Kane's `run_end.status` is passed (exit code 0) **and** the judge confirms the expected result. | [Kane doc] exit codes; [Proposed] |
| **BR-4** | A failed check gets at most **3 attempts** in total (1 original + 2 fixes). Then it is **Needs a human**. | [Proposed] |
| **BR-5** | A fix may change the **wording of the guide step** (or a link), never the **expected result** being checked. A fix that changes the expected result is rejected. | [Proposed] — prevents “passing” by weakening the test |
| **BR-6** | Kane infrastructure errors (exit 2, or exit 3 after one retry) are **Couldn't check**, never counted as guide defects. So is a run Kane reports as blocked — `run_end.reason_code` starting with `blocker.` (e.g. a captcha / bot check, which comes back as exit 1). Wayproof never tries to get around a bot check. | [Kane doc] exit codes; [Observed] `blocker.captcha`; [Proposed] |
| **BR-7** | Reports contain only: public page content, Kane outputs and evidence, Claude's text, timestamps. No IP addresses, no personal data, no API keys. | [Proposed] |
| **BR-8** | Every verdict in a report links to the Kane evidence that supports it. No evidence, no verdict. | [Proposed]; judging bar 2 [Rule] |
| **BR-9** | Web app run limits protect Kane credits (10,000 free for one month [Rule]). Proposed: 2 checks of a guide per visitor per day, max 20 Kane runs per check; codes raise the limit. Exact values: **TC-10**. | [Proposed] / TC-10 |
| **BR-10** | A run stops scheduling new Kane runs when its credit budget would be exceeded; remaining checks are “Not run — budget reached”. Default budget: **TC-10**. Spend per run is read from `run_end.credits_consumed` [Observed]; the account balance may fall by more (**TC-14**). | [Proposed] |
| **BR-11** | Wayproof never reports a defect it didn't observe. If every step passes, the report says the guide is correct. | [Decided: “don't invent anything”] |
| **BR-12** | Everything is labelled with the date and time it was checked; reports are snapshots, not live status. | [Proposed] |

---

## 3. Functional requirements

Format: **ID — requirement.** *Trace:* feature · flow · screen. **AC** = acceptance criteria.

### 3.1 Intake (web)

**FR-1 — Accept a guide URL.** *F-4 · UF-1 · S-01*
AC: accepts `https://` URLs up to 2,048 characters; trims spaces; rejects others with `ERR-URL-INVALID` inline; the Check button is disabled while empty.

**FR-2 — Fetch and extract steps.** *F-1 · UF-1 · S-02*
AC: fetches the page (timeout [Proposed] 20 s); extracts main content; Claude returns numbered steps, each with `action`, `expected`, `needsWallet`; shows them on S-02; on fetch failure `ERR-FETCH`; on zero steps `ERR-NO-STEPS`.

**FR-3 — Propose allowed domains.** *F-1 · UF-1 · S-02*
AC: lists the guide's domain + domains used by its steps; user can remove or add; a step whose URL is outside the list is shown “Not checked — outside allowed domains” (BR-2).

**FR-4 — Optional official links input.** *F-6 · UF-5 · S-02*
AC: fields: website, docs, X, GitHub, audit page, contract explorer link(s); each must be `https://`; empty fields are skipped.

**FR-5 — Start a check.** *F-4 · UF-1 · S-02 → S-03*
AC: creates a run with a unique id; applies BR-9; redirects to `/run/:id`; the run continues on the server even if the browser closes.

**FR-6 — Access codes.** *F-4 · UF-6 · S-07*
AC: valid code → run starts; invalid → `ERR-ACCESS`; codes stored hashed; each code has a run limit (TC-10).

### 3.2 Guide check and fix loop

**FR-20 — Plan Kane objectives.** *F-1 · UF-2*
AC: for each checkable step (or group of up to [Proposed] 3 consecutive steps), Claude writes one plain-English Kane objective that names the element and the expected visible result and includes “Do not connect a wallet or sign anything.”

**FR-21 — Run Kane.** *F-1 · UF-2 · S-03 / T-03*
AC: runs `kane-cli run "<objective>" --url <url> --agent --headless --timeout <s> --max-steps <n>` **[Kane doc]**; reads NDJSON; records every event; uses `run_end` and the exit code as the result **[Kane doc]**; missing `run_end` = error.

**FR-22 — Judge the result.** *F-2 · UF-2*
AC: Claude receives the expected result, `run_end.summary`, `final_state` and the failing step's remark; returns `pass | defect | flaky | check_wording | blocked` with a one-sentence reason and an exact quote from Kane's output (checked in code); a judge may not turn a Kane failure into a pass. `check_wording` **[Decided 17 Nov 2026]**: Kane's output shows the expected result was visible but the check was worded so Kane couldn't confirm it (e.g. it relied on an icon) → the check is rewritten once with the same expected result and re-run; the guide is not blamed (BR-11).

**FR-23 — Flaky re-run.** *F-2 · UF-2*
AC: if the judge says `flaky` (loading/timing), re-run once with the same objective before deciding.

**FR-24 — Propose a fix.** *F-2 · UF-2 · S-03*
AC: Claude returns a corrected step text (max [Proposed] 3 sentences) based only on what Kane observed (e.g. the button's actual label in Kane's evidence); the expected result is unchanged (BR-5).

**FR-25 — Re-run after fix.** *F-2 · UF-2*
AC: Kane runs the corrected objective; pass → **Verified fixed**; fail → next attempt or **Needs a human** (BR-4).

**FR-26 — Wallet boundary.** *F-1 · UF-2*
AC: steps with `needsWallet` aren't run; objectives containing connect/sign/approve-transaction wording are refused; a Kane event remark mentioning a wallet connection prompt stops the run with `ERR-BOUNDARY` (BR-1).

**FR-27 — Live progress.** *F-4 · UF-2 · S-03 / T-03*
AC: every state change appears within [Proposed] 2 s on S-03 and immediately in the terminal.

**FR-30 — Stop a run.** *F-4 · UF-1 · S-03*
AC: confirmation dialog; running Kane process is ended; finished checks keep their verdicts; others “Stopped by you”; partial report available.

### 3.3 Links check (Should)

**FR-40 — Probe each link.** *F-6 · UF-5*
AC: records status code, redirect chain and final domain; flags final domains not in the allowed list.

**FR-41 — Browser proof for links.** *F-6 · UF-5*
AC: Kane opens each link and confirms the page belongs to the project (e.g. names the project); results recorded with evidence.

**FR-42 — Cross-check.** *F-6 · UF-5*
AC: compares the same item across sources (e.g. contract address shown on the website vs in the docs) only where both are provided; mismatches are reported as found, with both values.

**FR-43 — Link fix suggestion.** *F-6 · UF-5*
AC: only suggests a replacement if another provided official source shows it; Kane re-checks the suggestion; otherwise **Needs a human**.

### 3.4 Report

**FR-50 — Proof Report.** *F-3 · UF-1/UF-3 · S-04, S-05*
AC: shows run date/time, guide title and URL, score, counts per verdict, every check with attempts, Kane evidence (screenshots, summary, `test_url` if present), Claude reasons and fixes.

**FR-51 — Score.** *F-3 · S-04*
AC: score = 100 × (Passed + Verified fixed) ÷ (Passed + Verified fixed + Needs a human); shown with the formula on hover/tap. Every other verdict (Couldn't check, Not checked — wallet / outside allowed domains, Not run — budget, Stopped by you) is left out because Kane never got a fair go at it. If nothing counts, the report shows "no score", never 0. **[Proposed]**; denominator **[Decided 17 Nov 2026]**

**FR-52 — Share.** *F-3 · UF-4 · S-04*
AC: copy link `/report/:id`; reports are read-only; no personal data (BR-7).

**FR-53 — Corrected guide.** *F-9 · S-06*
AC: side-by-side original vs corrected for every Verified fixed step; copy and download `.md`; unchanged steps shown as-is.

**FR-54 — Report formats.** *F-3*
AC: web page; CLI writes `report.html`, `report.md`, `run.json` into the run folder.

**FR-55 — CLI exit codes.** *F-5 · UF-9/UF-10 · T-04*
AC: `0` all passed or verified fixed · `1` at least one Needs a human · `2` setup/config error · `3` budget reached. **[Proposed]**

### 3.5 CLI

**FR-60 — `wayproof doctor`.** *F-5 · UF-8 · T-01*
AC: checks Node version, Chrome present, `kane-cli` on PATH, Kane logged in (`kane-cli whoami` **[Kane doc]**), `ANTHROPIC_API_KEY` set; prints fix commands.

**FR-61 — `wayproof check [file]`.** *F-5 · UF-9 · T-03/T-04*
AC: reads `wayproof.yml` (validated); runs all enabled checks; `--only guide|links|screens`; `--open` opens the report.

**FR-62 — `wayproof init`.** *F-5 · UF-8 · T-02*
AC: interactive prompts; writes a commented `wayproof.yml`; never overwrites without confirmation.

**FR-63 — `wayproof report <id>`.** *F-5*
AC: rebuilds the report from `run.json` without network calls.

**FR-64 — `wayproof gate --url`.** *F-8 (Could) · F-10 (Must) · UF-10*
AC: runs screens checks against the URL; exit codes per FR-55. A minimal version is needed for FR-65.

**FR-65 — Kane verifies Wayproof itself.** *F-10 · UF-11 · T-03, S-01, S-04, S-05, S-09* **[Decided 17 Nov 2026]**
AC: every surface a user sees (the CLI's `report.html`, and on the web S-01 Home, S-04 Report, S-05 Check detail, S-09 How it works) has at least one plain-English Kane objective run against it before the feature is marked Implemented; each objective names the visible text the screen must show; the saved result (exit code, `run_end` summary, evidence path, date) goes in `verification/kane/` and is listed in `FEATURE_GUIDE.md`; a failing self-check means the feature is not done. Same safety rules as every Kane run (BR-1, BR-2: only Wayproof's own address is allowed). A failed self-check found during development is fixed in Wayproof's code, then Kane re-runs — the same closed loop Wayproof offers its users.

---

## 4. Input validation

| Input | Rule | Error |
|---|---|---|
| Guide URL | `https://`, ≤ 2,048 chars, valid host | `ERR-URL-INVALID` |
| Allowed domain | hostname only, no scheme/path | `ERR-DOMAIN-INVALID` |
| Official links | `https://` each | `ERR-URL-INVALID` (per field) |
| Access code | non-empty, matches a stored hash, not expired | `ERR-ACCESS` |
| `wayproof.yml` | schema-validated; unknown keys rejected | `ERR-CONFIG` with the line/key |
| Claude output | must match its JSON schema; one retry with the error | `ERR-AI` |
| Kane NDJSON | each line JSON; `run_end` required | `ERR-KANE` |

---

## 5. Error catalogue (user-facing)

| Code | Message (plain English) | Where | Recovery |
|---|---|---|---|
| `ERR-URL-INVALID` | “That doesn't look like a web link. Paste the full address starting with https://” | S-01, S-02 | Edit |
| `ERR-FETCH` | “We couldn't open that page. It may be down or blocking automated visits.” | S-02 | Try again / Back |
| `ERR-NO-STEPS` | “We couldn't find step-by-step instructions on that page.” | S-02 | Back |
| `ERR-DOMAIN-INVALID` | “Enter a domain like docs.example.com” | S-02 | Edit |
| `ERR-ACCESS` | “That access code isn't valid or has been used up.” | S-07 | Edit |
| `ERR-KANE` | “Kane couldn't run this check (setup or connection problem). This is not a problem with the guide.” | S-03/S-05, T-03 | Retry later |
| `ERR-KANE-TIMEOUT` | “Kane ran out of time on this step twice.” | S-03, T-03 | — |
| `ERR-AI` | “Our AI couldn't process this step.” | S-03, T-03 | Retry later |
| `ERR-BOUNDARY` | “Stopped safely: this step would connect a wallet. Wayproof never does that.” | S-03, T-03 | — |
| `ERR-BUDGET` | “Not run: this check reached its Kane credit budget.” | S-03, T-03 | Use the CLI |
| `ERR-CONFIG` | “wayproof.yml has a problem at <key>: <reason>” | T-05 | Edit file |
| `ERR-NOT-FOUND` | “We couldn't find that report.” | S-08 | Home |

---

## 6. Non-functional requirements

| ID | Requirement | Value |
|---|---|---|
| NFR-1 | Safety | BR-1, BR-2 enforced in code, covered by tests |
| NFR-2 | Evidence | 100% of verdicts link to Kane evidence (BR-8) |
| NFR-3 | Progress latency | State change visible ≤ 2 s on S-03 [Proposed] |
| NFR-4 | Availability (web) | Up during judging; status visible on S-08 if the runner is down |
| NFR-5 | Accessibility | WCAG 2.1 AA contrast; keyboard navigation; status never by colour alone |
| NFR-6 | Responsive | Works from 360 px wide (see 03 §6) |
| NFR-7 | Privacy | BR-7; keys only in environment variables |
| NFR-8 | Cost | BR-9, BR-10 |
| NFR-9 | Runnable by judges | README quick start; recorded fallback (F-7) [Rule] |

---

## 7. Traceability matrix

| Feature | Requirements | Flows | Screens |
|---|---|---|---|
| F-1 Guide check | FR-2, FR-3, FR-20, FR-21, FR-26 | UF-1, UF-2 | S-02, S-03, T-03 |
| F-2 Fix loop | FR-22–FR-25 | UF-2 | S-03, S-05 |
| F-3 Proof Report | FR-50–FR-52, FR-54 | UF-1, UF-3, UF-4 | S-04, S-05 |
| F-4 Web app | FR-1, FR-5, FR-6, FR-27, FR-30 | UF-1, UF-6, UF-7 | S-01–S-09 |
| F-5 CLI | FR-55, FR-60–FR-63 | UF-8, UF-9 | T-01–T-05 |
| F-6 Links | FR-4, FR-40–FR-43 | UF-5 | S-02, S-03, S-04 |
| F-7 Recorded fallback | NFR-9 | UF-11 | S-04 (published) |
| F-8 Screens gate | FR-64 | UF-10 | T-03/T-04 |
| F-9 Corrected guide | FR-53 | UF-1 | S-06 |
| F-10 Self-verification | FR-64 (minimal), FR-65 | UF-11 | T-03 report, S-01, S-04, S-05, S-09 |
