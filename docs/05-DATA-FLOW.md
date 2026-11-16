# 05 · Data Flow Documentation — Wayproof

> Part of the [Wayproof documentation set](README.md). Requirements in [04-SRS](04-SRS.md); components (`C-`) in [TDD.md](../TDD.md).
> Labels: **[Rule]** · **[Kane doc]** · **[Decided]** · **[Proposed]** · **[TC-n]**.

---

## 1. External entities

| ID | Entity | Gives Wayproof | Gets from Wayproof |
|---|---|---|---|
| E-1 | **User** (web visitor or CLI user) | Guide URL, allowed domains, optional official links, access code (web), `wayproof.yml` (CLI) | Live progress, Proof Report, corrected guide |
| E-2 | **Project websites** (guide pages, dApp pages, official links) — e.g. TC-1 sites | Page HTML (public) | HTTP requests from Wayproof's fetcher; browser visits from Kane |
| E-3 | **Kane CLI** (local process) + **TestMu AI** (its account/cloud) | NDJSON events, `run_end`, exit code, evidence pack, optional `test_url` **[Kane doc]** | Objective text, start URL, run options; uses the Kane account's credits |
| E-4 | **Anthropic API (Claude)** **[Decided]** | Structured JSON answers (steps, objectives, judgements, fixes) | Guide text, expected results, Kane summaries/remarks (public content only) |
| E-5 | **GitHub** (optional, CLI) | — | Pull request with corrected guide (only if the user asks) |

What Kane itself sends to TestMu AI's cloud during a run is **TC-5**.

---

## 2. Level 0 — context diagram

```mermaid
flowchart LR
  U[E-1 User] -- guide URL, domains, links, code --> W((Wayproof))
  W -- progress, Proof Report, corrected guide --> U
  W -- HTTP GET / HEAD --> P[E-2 Project websites]
  P -- public HTML --> W
  W -- objective, url, options --> K[E-3 Kane CLI / TestMu AI]
  K -- NDJSON, run_end, exit code, evidence --> W
  K -- real browser visits --> P
  W -- prompts with public content --> C[E-4 Claude API]
  C -- structured JSON --> W
  W -. optional PR .-> G[E-5 GitHub]
```

---

## 3. Level 1 — processes and data stores

```mermaid
flowchart TB
  U[E-1 User]
  P1[P1 Intake & validation]
  P2[P2 Fetch & extract guide]
  P3[P3 Plan objectives]
  P4[P4 Safety gate]
  P5[P5 Run Kane]
  P6[P6 Judge]
  P7[P7 Fix]
  P8[P8 Links probe]
  P9[P9 Build report]
  P10[P10 Publish / share]
  D1[(D-1 Run store)]
  D2[(D-2 Fetch cache)]
  D3[(D-3 Kane evidence)]
  D4[(D-4 Usage & access codes)]
  D5[(D-5 Published reports)]

  U -->|DF-1 guide URL, domains, links, code| P1
  P1 -->|DF-2 check request| D4
  D4 -->|DF-3 allowed? remaining budget| P1
  P1 -->|DF-4 validated run config| D1
  P1 --> P2
  P2 -->|DF-5 page HTML| D2
  P2 -->|DF-6 steps: action, expected, needsWallet| D1
  P2 --> P3
  P3 -->|DF-7 objective, url, expect| P4
  P4 -->|DF-8 allowed objective| P5
  P4 -->|DF-9 blocked: reason| D1
  P5 -->|DF-10 NDJSON, run_end, exit code| D1
  P5 -->|DF-11 evidence pack| D3
  P5 --> P6
  P6 -->|DF-12 judgement| D1
  P6 -->|defect| P7
  P7 -->|DF-13 fix: new step text| D1
  P7 -->|DF-14 new objective, same expect| P4
  U -->|DF-15 official links| P8
  P8 -->|DF-16 status, redirects, final domain| D1
  P8 -->|DF-17 Kane proof objective| P4
  D1 -->|DF-18 run data| P9
  D3 -->|DF-19 screenshots, summaries| P9
  P9 -->|DF-20 report HTML/MD/JSON| D5
  D5 -->|DF-21 report view| U
  P9 -->|DF-22 live progress events| U
  P10 -->|DF-23 share link / PR| U
```

---

## 4. Data flows (dictionary)

| ID | From → To | Data | Format | Validation / rule |
|---|---|---|---|---|
| DF-1 | User → P1 | Guide URL, allowed domains, official links, access code | Web form / `wayproof.yml` | 04-SRS §4; FR-1, FR-3, FR-4, FR-6 |
| DF-2/3 | P1 ↔ D-4 | Visitor key (see §6), code hash, run counts | Record | BR-9, BR-10, TC-10 |
| DF-4 | P1 → D-1 | Run config: id, created time, guide URL, domains, links, budget | `run.json` | Schema-validated |
| DF-5 | P2 → D-2 | Fetched page | HTML + extracted text | Fetch timeout [Proposed] 20 s |
| DF-6 | P2 → D-1 | Steps `{n, action, expected, needsWallet}` | JSON (Claude, schema) | FR-2; empty → ERR-NO-STEPS |
| DF-7 | P3 → P4 | Objective text, start URL, expected result | JSON (Claude, schema) | FR-20 |
| DF-8 | P4 → P5 | Allowed objective | String + options | BR-1, BR-2, FR-26 |
| DF-9 | P4 → D-1 | Blocked check + reason | JSON | `ERR-BOUNDARY` / outside domains |
| DF-10 | P5 → D-1 | NDJSON events, `run_end` (`status, summary, final_state, duration, credits_consumed, session_dir, run_dir, test_url`, plus `reason_code`, `run_id` …), exit code. Docs say `credits`; the real field is `credits_consumed` **[Observed]** (TDD.md §13.1). Unknown event types are ignored | NDJSON + JSON **[Kane doc]**/**[Observed]** | Missing `run_end` → ERR-KANE |
| DF-11 | P5 → D-3 | Evidence pack (steps, screenshots, console/network logs, failure records) | `.evidence` **[Kane doc]** | Linked from every verdict (BR-8) |
| DF-12 | P6 → D-1 | `{outcome, reason, failingStep}` | JSON (Claude, schema) | FR-22 |
| DF-13 | P7 → D-1 | `{newStepText, rationale}` | JSON (Claude, schema) | BR-5 (expect unchanged) |
| DF-14 | P7 → P4 | New objective, same expected result | JSON | Loop max 3 attempts (BR-4) |
| DF-15 | User → P8 | Official links | Form / yml | FR-4 |
| DF-16 | P8 → D-1 | Status code, redirect chain, final domain | JSON | FR-40 |
| DF-17 | P8 → P4 | Kane proof objective for a link | JSON | FR-41 |
| DF-18/19 | D-1, D-3 → P9 | Run data, evidence references | JSON, files | — |
| DF-20 | P9 → D-5 | Report | HTML, Markdown, JSON | BR-7, BR-12 |
| DF-21 | D-5 → User | Report page | HTML | Read-only |
| DF-22 | P9 → User | Live progress events | Server-Sent Events (web) / terminal lines (CLI) | NFR-3 |
| DF-23 | P10 → User / GitHub | Share link; optional PR | URL; Git branch + PR | FR-52; PR only on request |

---

## 5. Data stores

| ID | Store | Holds | CLI location | Web location | Retention |
|---|---|---|---|---|---|
| D-1 | Run store | Run config, steps, attempts, judgements, fixes, verdicts | `.wayproof/runs/<id>/run.json` | Server storage (TC-12) | CLI: user's disk · Web: [Proposed] 30 days unless published |
| D-2 | Fetch cache | Fetched pages | `.wayproof/cache/` | Server temp | Per run |
| D-3 | Kane evidence | Evidence packs, screenshots | Kane's session folder `~/.testmuai/kaneai/sessions/<id>/evidence/` — path read from the `coverage` event's `pack` **[Observed]** (docs say `.testmuai/evidence/` **[Kane doc]**), copied/linked into the run folder | Server storage (TC-12) | Same as D-1 |
| D-4 | Usage & access codes | Visitor run counts, code hashes and limits | — (CLI has no limits) | Server storage | Counters daily [Proposed]; codes until expiry |
| D-5 | Published reports | Report HTML/MD/JSON | `.wayproof/runs/<id>/` | Server storage + public URL | Until removed by the operator |

---

## 6. Data classification and access

| Data | Class | Who can read | Notes |
|---|---|---|---|
| Guide content, page HTML | Public | Anyone with the report | Comes from public pages |
| Kane evidence (screenshots, logs) | Public-derived | Anyone with the report | Of public pages; no wallet, no logins (BR-1) |
| Claude outputs | Public-derived | Anyone with the report | — |
| Access codes | Secret | Operator only | Stored **hashed** |
| Visitor key for limits | Internal | Server only | [Proposed] hashed IP + day; never shown in reports (BR-7) |
| `ANTHROPIC_API_KEY`, Kane login, `GITHUB_TOKEN` | Secret | The process only | Environment variables / Kane's own credential store **[Kane doc: ~/.testmuai/kaneai/profiles/…/credentials]**; never logged, never sent to Claude |

---

## 7. Error and failure data paths

| Failure | Detected in | Stored as | Shown as |
|---|---|---|---|
| Invalid input | P1 | Not stored | `ERR-URL-INVALID` / `ERR-DOMAIN-INVALID` |
| Fetch failed | P2 | Run marked failed (intake) | `ERR-FETCH` |
| No steps | P2 | Run marked failed (intake) | `ERR-NO-STEPS` |
| Claude invalid output (after 1 retry) | P2/P3/P6/P7 | Check verdict `error` | `ERR-AI` |
| Wallet / domain boundary | P4 | Check verdict `blocked` | `ERR-BOUNDARY` / outside domains |
| Kane exit 2, or 3 twice | P5 | Check verdict `couldnt_check` + raw output | `ERR-KANE` / `ERR-KANE-TIMEOUT` |
| Budget reached | P1/P5 | Remaining checks `not_run` | `ERR-BUDGET` |
| Browser disconnects (web) | P9 (SSE) | Nothing lost (run continues server-side) | Reconnecting banner |

---

## 8. Sequence — one guide step through the system

```mermaid
sequenceDiagram
  participant U as User
  participant W as Wayproof
  participant C as Claude
  participant K as Kane CLI
  participant S as Project site
  U->>W: guide URL (DF-1)
  W->>S: GET guide page (DF-5)
  W->>C: page text → steps (DF-6)
  C-->>W: steps JSON
  W->>C: step → objective (DF-7)
  C-->>W: objective JSON
  W->>W: safety gate (DF-8)
  W->>K: kane-cli run … --agent --headless
  K->>S: real browser visit
  K-->>W: NDJSON + run_end + exit code (DF-10) + evidence (DF-11)
  W->>C: expected + Kane result → judgement (DF-12)
  alt defect
    W->>C: fix (DF-13)
    W->>K: re-run with new objective (DF-14)
  end
  W-->>U: live progress (DF-22) → Proof Report (DF-21)
```
