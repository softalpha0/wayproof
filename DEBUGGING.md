# DEBUGGING.md — Wayproof bug investigation guide

> **For Claude Code:** when I report a problem, follow this file exactly. Act as a **senior debugging engineer**. **Do not guess and do not rewrite the application.** First understand the problem, then find the real cause, then make the smallest safe fix, then prove it.
>
> Related files: `hackathon.md` (project and tools), `CLAUDE.md` (working rules), `docs/04-SRS.md` (expected behaviour, business rules `BR-`, error codes `ERR-`), `docs/05-DATA-FLOW.md` (where data moves), `TDD.md` (components `C-`).

---

## Part 1 — Bug report (I fill this in)

Copy this block into Claude Code each time something breaks.

```markdown
### BUG REPORT

**1. What I was trying to do**
[The action I performed — e.g. "Ran `wayproof check` on the Revoke.cash guide" / "Pressed Start check on the web app"]

**2. What I expected to happen**
[What I thought should happen]

**3. What actually happened**
[What happened instead]

**4. Exact error message**
[Paste the COMPLETE error message here. Do not paraphrase it. Include the error code if shown, e.g. ERR-KANE.]

**5. Where the problem happened**
[Screen / page / feature / button / form / API / terminal / browser — e.g. "S-03 Live check", "terminal: wayproof check", "kane-cli run"]

**6. Steps to reproduce**
1. [First action]
2. [Second action]
3. [Third action]

**Extra (if I have it)**
- Run ID or report link:
- Screenshot:
- Did this work before? When did it stop?
```

---

## Part 2 — What Claude Code must do (in this order)

1. **Restate the problem** in one or two plain sentences and confirm you understood it. If anything in the bug report is missing or unclear, ask before doing anything else.
2. **Reproduce the issue** if possible, using my steps. Say whether you could reproduce it. If you can't, say so and tell me what you tried.
3. **Inspect the relevant source code** — only the files involved (use §3 to find them). Don't change anything yet.
4. **Check the terminal output and the browser console.**
5. **Check API responses and network requests** where relevant (web app ↔ runner, runner ↔ Claude, Kane output).
6. **Identify the actual root cause.** Show the evidence (log line, error, code line) that proves it. Separate what you *know* from what you *suspect*.
7. **Explain the cause to me in plain English** — no jargon, or explain the jargon.
8. **Explain which files need to change and why** — before changing them. Wait for my OK if the change is large or touches more than one feature.
9. **Fix the issue** with the smallest change that solves the root cause. Don't break other features. Don't remove safety checks (§5).
10. **Run the relevant tests** (and add a test that would have caught this bug).
11. **Verify the original problem is resolved** by repeating my reproduction steps.
12. **Check whether the fix introduced another problem** — run the full test suite and `wayproof doctor`.
13. **Tell me exactly what you changed** (files, what changed, why) using the template in Part 4.
14. **Give me step-by-step instructions to test the fix myself.**

### Hard rules
- **Do not hide errors.** Show real output.
- **Do not invent successful tests** or say a test passed without running it.
- **Do not claim the problem is fixed without verification** (steps 10–12).
- **Do not move to the next feature** until I have tested and approved the fix.
- **Do not paraphrase error messages** — quote them.
- If the cause is outside our code (Kane, Claude API, a website, my internet), say so clearly and don't "fix" our code to hide it.

---

## Part 3 — Where to look in Wayproof

### 3.1 Map: symptom → where to look

| Symptom / error code | Likely area | Component | Look at |
|---|---|---|---|
| `wayproof doctor` shows ❌ | Setup | C-2 CLI | The failing line's fix command; `node --version`, `kane-cli whoami`, Chrome path, `ANTHROPIC_API_KEY` |
| `ERR-CONFIG` | `wayproof.yml` | C-2 | The key named in the message vs the schema |
| `ERR-URL-INVALID`, `ERR-DOMAIN-INVALID` | Input checks | C-3 / C-2 | 04-SRS §4 rules vs the input |
| `ERR-FETCH` | Fetching the guide page | C-8 | HTTP status, redirect chain, timeout; open the URL in a normal browser |
| `ERR-NO-STEPS` | Step extraction | C-7 (`extract`) | Extracted page text; Claude response; schema errors |
| `ERR-AI` | Claude call | C-7 | API status code, response body, Zod validation error, model name (`ANTHROPIC_MODEL`, decided `claude-opus-5-5`), API key set, `stop_reason` (e.g. `refusal`) |
| `ERR-KANE` | Kane run | C-5 | Exit code (2 = auth/setup/infra); `run_end.reason_code` (`blocker.captcha` = site showed a bot check — exit 1, expected "Couldn't check", BR-6); raw NDJSON log; whether `run_end` exists; `kane-cli whoami` |
| `ERR-KANE-TIMEOUT` | Kane run | C-5 | Exit code 3; `--timeout` value; site speed |
| `ERR-BOUNDARY` | Safety gate | C-6 | Which objective or Kane remark tripped the wallet check — **expected behaviour, not a bug, unless it fired on a non-wallet step** |
| Step "outside allowed domains" | Safety gate | C-6 | Allowed domains list vs the step's URL |
| `ERR-BUDGET` | Credits budget | C-1 | Sum of `run_end.credits_consumed` (the docs' `credits` field doesn't exist [Observed]); `kane-cli balance` before/after (TC-14); budget setting (TC-10) |
| `ERR-ACCESS` | Access codes | C-4 | Code hash, limit, expiry |
| `ERR-NOT-FOUND` | Report lookup | C-4 / C-10 | Report id; storage (TC-12) |
| Web page stuck / no live updates | Server-Sent Events | C-3 / C-4 | Browser Network tab → `/api/runs/:id/events`; runner logs |
| Wrong verdict (e.g. Passed when Kane failed) | Fix loop | C-1 | `run.json` attempts: Kane exit code vs judge outcome (BR-3: a Kane failure can never become a pass) |
| Fix changed the expected result | Fix loop | C-1 | BR-5 check; `expected` field across attempts |
| Report missing evidence | Report builder | C-9 | Evidence path in the attempt; file exists (BR-8) |

### 3.2 Where the evidence lives

| What | Where | Source |
|---|---|---|
| Wayproof run data | `.wayproof/runs/<id>/run.json` (CLI) | TDD.md §11 |
| Report files | `.wayproof/runs/<id>/report.html`, `report.md` | FR-54 |
| Raw Kane output | Raw NDJSON log saved per attempt in the run folder | TDD.md §13.1 |
| Kane evidence packs | `~/.testmuai/kaneai/sessions/<session_id>/evidence/*.evidence` — exact path in the `coverage` event (`pack`) and on Kane's stderr; open with `kane-cli evidence serve <path>` | [Observed] (docs say `.testmuai/evidence/`) |
| Kane run artifacts | `run_end.session_dir`, `run_end.run_dir`, `run_end.test_url`, `run_end.reason_code` | [Kane doc] / [Observed] |
| Kane human messages | stderr (stdout is NDJSON only) | [Observed] |
| Kane settings / login | `~/.testmuai/kaneai/` (`config.json`, `profiles/…/credentials`) — **never print credentials** | [Kane doc] |
| Web app errors | Browser DevTools → Console and Network | — |
| Runner errors | Runner terminal / host logs (TC-4) | — |

### 3.3 Kane exit codes [Kane doc]
| Code | Meaning | Wayproof shows |
|---|---|---|
| 0 | Passed | Passed (if the judge agrees) |
| 1 | Failed | Judge → fix loop |
| 2 | Error: auth, setup or infrastructure | `ERR-KANE` — check login and Chrome first |
| 3 | Timeout or cancelled | Retry once, then `ERR-KANE-TIMEOUT` |

### 3.4 Useful commands (PowerShell-friendly)
```powershell
wayproof doctor                        # setup check
kane-cli --version
kane-cli whoami                        # logged in?
kane-cli run "Go to https://example.com and assert the title contains 'Example'" --agent --headless
echo $LASTEXITCODE                     # exit code of the last command (PowerShell)
kane-cli evidence serve <path-to-.evidence>
pnpm test                              # all tests
pnpm test -- <file-or-name>            # one test file
```
Isolate Kane from Wayproof: if a check fails, run the **same objective** directly with `kane-cli run` (copy it from `run.json`). If Kane fails on its own too, the problem is not in Wayproof's code.

---

## Part 4 — Fix report (Claude Code fills this in)

```markdown
### FIX REPORT

**Problem (plain English):**
**Reproduced?** Yes / No — how:
**Root cause:** (with the evidence: log line / error / code line)
**Known vs suspected:**

**Files changed:**
| File | What changed | Why |
|---|---|---|

**Tests:**
- New test added: (name) — fails before the fix, passes after: yes/no (show output)
- Full test suite: (real result, numbers)
- `wayproof doctor`: (real result)

**Verification:** repeated the original steps → (what happened now)
**Side effects checked:** (what else was tested; anything that changed behaviour)
**Not fixed / still unknown:** (be honest)

**How to test it yourself:**
1.
2.
3.
Expected result:
```

---

## Part 5 — Never "fix" by removing these

| Protection | Rule |
|---|---|
| Wallet boundary (no connect, sign, transactions) | BR-1 |
| Allowed-domains check | BR-2 |
| Kane failure can't become a pass | BR-3 |
| Expected result never changed by a fix | BR-5 |
| Infra errors are "Couldn't check", not guide defects | BR-6 |
| No personal data or keys in reports | BR-7 |
| Every verdict linked to Kane evidence | BR-8 |
| Never report a defect Kane didn't observe | BR-11 |

If a bug seems to require weakening one of these, **stop and ask me**.

---

## Part 6 — Bug log

Keep one line per bug (newest first) so judges and future-me can see what happened.

| Date | Bug | Root cause | Fix (commit) | Verified by me |
|---|---|---|---|---|
| | | | | |
