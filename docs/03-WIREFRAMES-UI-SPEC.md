# 03 · Wireframes and UI Design Specification — Wayproof

> Part of the [Wayproof documentation set](README.md). Screens come from the inventory in [02-UX §4](02-UX-USER-FLOWS.md#4-screen-inventory); behaviour is defined in [04-SRS](04-SRS.md).
> The whole visual system below is **[Proposed]** — a starting design, not a brand that exists. Change tokens in one place (§7) and every screen follows.

---

## 1. Design principles [Proposed]

1. **Evidence first.** Every verdict sits next to the proof (Kane screenshot or summary). Users should never have to trust a colour.
2. **Plain words.** “Kane followed this step” instead of “assertion passed”. Error texts come from [04-SRS §5](04-SRS.md#5-error-catalogue-user-facing).
3. **Calm, not alarming.** Crypto users are used to scary warnings; Wayproof is factual. Red only for “Needs a human”.
4. **Status is never colour alone** (icon + word + colour) — NFR-5.
5. **The loop is visible.** Attempt 1 → fix → attempt 2 is shown as a timeline, because that's what judges score (Closed loop).

---

## 2. Low-fidelity wireframes (web)

Desktop at 1280 px; mobile rules in §6.

### S-01 · Home
```
┌──────────────────────────────────────────────────────────────────────┐
│ [Wayproof]                                  How it works   GitHub ↗  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│        Does this crypto guide actually work?                         │
│        Kane follows it in a real browser. Claude fixes what's        │
│        wrong. Kane proves the fix.                                   │
│                                                                      │
│   ┌──────────────────────────────────────────────┐ ┌──────────────┐  │
│   │ https://  paste a guide link…                 │ │ Check guide  │  │
│   └──────────────────────────────────────────────┘ └──────────────┘  │
│   ⚠ ERR-URL-INVALID message appears here                             │
│                                                                      │
│   🛡 Never connects a wallet · Only visits the domains you allow      │
│                                                                      │
│   Recent public reports                                              │
│   ┌────────────────────┐ ┌────────────────────┐ ┌────────────────┐   │
│   │ <guide title>      │ │ <guide title>      │ │ <guide title>  │   │
│   │ score · date       │ │ score · date       │ │ score · date   │   │
│   └────────────────────┘ └────────────────────┘ └────────────────┘   │
│   (empty state: "No public reports yet.")                            │
└──────────────────────────────────────────────────────────────────────┘
```
Priority: 1 headline · 2 URL field · 3 safety line · 4 recent reports.

### S-02 · Set up check
```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Back                                                               │
│ <Guide title>                                   <guide URL> ↗        │
│ Fetched <time>                                                        │
├──────────────────────────────────────┬───────────────────────────────┤
│ Steps found (n)                      │ Allowed domains               │
│ 1 <action>          ✓ will check     │ [docs.example.org   ×]        │
│ 2 <action>          ✓ will check     │ [app.example.org    ×]        │
│ 3 <action>          🔒 wallet step — │ [+ add domain]                │
│                        not checked   │                               │
│ 4 <action>          ⚠ outside        │ ☐ Also check official links   │
│                       allowed domains│   website / docs / X / GitHub │
│                                      │   audit / contract explorer   │
├──────────────────────────────────────┴───────────────────────────────┤
│ Estimated Kane runs: n                     [ Back ]  [ Start check ]  │
└──────────────────────────────────────────────────────────────────────┘
```
Loading state: skeleton rows + “Reading the guide…”. Errors: `ERR-FETCH`, `ERR-NO-STEPS` replace the steps panel with message + buttons.

### S-03 · Live check
```
┌──────────────────────────────────────────────────────────────────────┐
│ Checking: <guide title>                       ● Live   [ Stop ]      │
│ Progress ▓▓▓▓▓▓░░░░ 4 / 9 checks · Kane runs used: 7                  │
├──────────────────────────────────────────────────────────────────────┤
│ Guide                                                                │
│ ✅ Step 1  Kane followed this step                  View evidence    │
│ 🔧 Step 2  Verified fixed                           View evidence    │
│      “Click Bridge” → “Click Transfer”  (attempt 2 passed)           │
│ ⏳ Step 3  Re-running in Kane (attempt 2 of 3)                       │
│ 🔒 Step 4  Not checked — wallet step                                 │
│ ⌛ Step 5  Waiting                                                    │
│ Links (if enabled)                                                   │
│ ✅ docs  reachable · final domain docs.example.org                   │
│ ❌ audit Redirects to other-domain.com — needs a human               │
├──────────────────────────────────────────────────────────────────────┤
│ When finished you'll go to the report automatically. [View report]  │
└──────────────────────────────────────────────────────────────────────┘
```
Connection-lost banner: “Reconnecting… the check keeps running.”

### S-04 · Proof Report
```
┌──────────────────────────────────────────────────────────────────────┐
│ Proof Report · <guide title>                    [Share] [Download ▾]  │
│ Checked <date time> · <guide URL> ↗                                   │
├───────────────┬──────────────────────────────────────────────────────┤
│   SCORE       │ ✅ Passed n   🔧 Verified fixed n   ❌ Needs a human n │
│    82 / 100   │ 🔒 Not checked (wallet) n   ⚠ Couldn't check n        │
│  (how scored) │ Kane runs n · credits used n · duration m:ss          │
├───────────────┴──────────────────────────────────────────────────────┤
│ [ Guide ]  [ Links ]  [ Corrected guide ]                 (tabs)     │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ ❌ Step 6  Needs a human                         Open evidence → │ │
│ │    Kane: “<run_end.summary>” · 3 attempts                        │ │
│ ├──────────────────────────────────────────────────────────────────┤ │
│ │ 🔧 Step 2  Verified fixed                        Open evidence → │ │
│ │ ✅ Step 1  Passed                                Open evidence → │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ Sort: problems first (default)                                       │
└──────────────────────────────────────────────────────────────────────┘
```
Download menu: Markdown summary, JSON. Problems are listed first.

### S-05 · Check detail (evidence)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Report   Step 2 · “Click Bridge in the top menu”      🔧 Verified fixed │
├──────────────────────────────────────────────────────────────────────┤
│ Expected: <expected result — never changed>                          │
│                                                                      │
│ ● Attempt 1 — Kane failed                                            │
│   Objective: “…”                                                     │
│   Kane summary: “…”         ┌──────────────┐                         │
│   Steps: 1 ✓ 2 ✓ 3 ✗        │ screenshot   │  Open Kane run ↗ (test_url)│
│   Judge: “No 'Bridge' button; the menu shows 'Transfer'.”            │
│   Fix: “Click Transfer in the top menu.”                             │
│ │                                                                    │
│ ● Attempt 2 — Kane passed                                            │
│   Objective: “…”            ┌──────────────┐                         │
│   Kane summary: “…”         │ screenshot   │                         │
│                             └──────────────┘                         │
│ [Download raw Kane output]                                           │
└──────────────────────────────────────────────────────────────────────┘
```

### S-06 · Corrected guide
```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Report   Corrected guide             [Copy Markdown] [Download .md] │
├──────────────────────────────┬───────────────────────────────────────┤
│ Original                     │ Corrected (proven by Kane)            │
│ 1 …                          │ 1 … (unchanged)                       │
│ 2 Click Bridge … (struck)    │ 2 Click Transfer …  🔧 proof →        │
│ 6 … ❌ needs a human          │ 6 … (no proven fix)                   │
└──────────────────────────────┴───────────────────────────────────────┘
```
Empty state: “No steps needed changes — every checked step worked.”

### S-07 · Access code / limit
```
┌──────────────────────────────────────────────────────────────┐
│ This check needs an access code                               │
│ Kane runs use limited credits, so open checks are limited.    │
│ ┌──────────────────────────┐ ┌──────────┐                     │
│ │ access code              │ │ Continue │                     │
│ └──────────────────────────┘ └──────────┘                     │
│ Or: • Open the latest public report for this guide            │
│     • Run it yourself with the CLI → README                   │
└──────────────────────────────────────────────────────────────┘
```

### S-08 · Error page
```
┌──────────────────────────────────────────────┐
│  <icon>  <plain-English message from 04 §5>  │
│  [Go home]   [Try again] (when it applies)   │
└──────────────────────────────────────────────┘
```

### S-09 · How it works
Sections: 1 What Wayproof checks (guides · links · screens) · 2 The loop diagram (Kane → judge → Claude fix → Kane re-run) · 3 Safety boundary (BR-1, BR-2) · 4 What a verdict means (legend §5) · 5 Links: GitHub, video, CLI quick start.

---

## 3. Terminal views (CLI)

### T-01 · `wayproof doctor`
```
Wayproof doctor
  ✔ Node 20.11.0
  ✔ Google Chrome found
  ✔ kane-cli installed
  ✖ Kane not logged in      → run: kane-cli login
  ✔ ANTHROPIC_API_KEY set
1 problem found.
```
### T-03 · `wayproof check` (live)
```
Wayproof · <guide title>
Guide
  ✔ step 1  passed
  ✖ step 2  failed — "No 'Bridge' button"   → fixing (attempt 2/3)
  ✔ step 2  verified fixed
  ⏸ step 4  not checked — wallet step
Links
  ✔ docs    200 · docs.example.org
```
### T-04 · Summary
```
Score 82/100   passed 5 · fixed 1 · needs a human 1 · wallet 1 · couldn't check 0
Kane runs 9 · credits <n> · 4m12s
Report  .wayproof/runs/<id>/report.html
Exit code 1 (1 step needs a human)
```
### T-05 · Error
```
✖ ERR-CONFIG  wayproof.yml has a problem at guides[0].url: must start with https://
```
Colours in the terminal follow §5 when the terminal supports colour; symbols carry the meaning without colour.

---

## 4. Components

| Component | Used on | Variants / states |
|---|---|---|
| Header | All | Default; mobile collapses links into a menu |
| URL input + button | S-01 | Empty (button disabled), typing, loading (“Reading…”), error |
| Step row | S-02, S-03, S-04 | Will check · Wallet step · Outside domains · Waiting · Running · Failed · Fixing · Re-running · Passed · Verified fixed · Needs a human · Couldn't check · Not run (budget) · Stopped |
| Status badge | All lists | 7 verdicts (§5) — icon + label + colour |
| Domain chip | S-02 | Default, removable, invalid |
| Progress bar | S-03 | Determinate (checks done / total) |
| Score card | S-04 | 0–100 with “how scored” tooltip |
| Tabs | S-04 | Guide · Links · Corrected guide |
| Attempt timeline | S-05 | Attempt node: Kane passed / failed / error; judge note; fix note |
| Screenshot frame | S-05 | Loading, loaded, missing (“No screenshot in Kane evidence”) |
| Diff view | S-06 | Unchanged · changed (struck → new) · unresolved |
| Toast | S-04 | “Link copied” |
| Banner | S-03 | Reconnecting · budget warning |
| Buttons | All | Primary · Secondary · Danger (Stop) · Disabled · Loading |

All interactive elements: default, hover, focus (visible 2 px ring), active, disabled.

---

## 5. Verdict legend (shared by web, report and CLI)

| Verdict | Icon | Word | Colour token |
|---|---|---|---|
| Passed | ✅ / ✔ | Passed | `--ok` |
| Verified fixed | 🔧 | Verified fixed | `--fixed` |
| Needs a human | ❌ / ✖ | Needs a human | `--bad` |
| Not checked — wallet step | 🔒 / ⏸ | Wallet step | `--muted` |
| Couldn't check | ⚠️ | Couldn't check | `--warn` |
| Not run — budget | ⌛ | Not run | `--muted` |
| Running / Fixing | ⏳ | Running / Fixing | `--accent` |

---

## 6. Responsive layout

| Breakpoint | Layout |
|---|---|
| ≥ 1024 px | Two columns on S-02 and S-06; report summary beside score |
| 640–1023 px | Single column; S-06 shows Original/Corrected as toggle |
| 360–639 px | Single column; tabs scroll horizontally; screenshot frames full width; sticky bottom bar for primary action |

Minimum touch target 44 × 44 px. No horizontal page scroll at 360 px.

---

## 7. Visual specification (high-fidelity tokens) [Proposed]

### Colour (light theme; dark theme mirrors with the same names)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #FAFAF7 | #0E1110 | Page |
| `--surface` | #FFFFFF | #161A19 | Cards |
| `--line` | #E4E4DE | #2A302E | Borders |
| `--text` | #141716 | #ECEFEC | Body |
| `--muted` | #5F6764 | #9AA3A0 | Secondary text, wallet/not-run |
| `--accent` | #2F5BEA | #7C9BFF | Primary button, running |
| `--ok` | #1E7A46 | #4CC383 | Passed |
| `--fixed` | #7A4FD6 | #B49BFF | Verified fixed |
| `--warn` | #A86A00 | #F2B84B | Couldn't check |
| `--bad` | #C2362B | #FF7A6E | Needs a human |
Contrast: all text/background pairs to be checked ≥ 4.5:1 before release (NFR-5).

### Typography
| Role | Font | Size / line height | Weight |
|---|---|---|---|
| H1 | Inter | 36 / 44 (mobile 28 / 36) | 700 |
| H2 | Inter | 24 / 32 | 600 |
| Body | Inter | 16 / 24 | 400 |
| Small | Inter | 14 / 20 | 400 |
| Code, objectives, URLs | JetBrains Mono | 14 / 20 | 400 |
Numbers use tabular figures.

### Spacing, shape, motion
- 4 px grid: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius 8 px (cards), 6 px (inputs, buttons), 999 px (badges).
- Shadow: none on cards (borders only); focus ring 2 px `--accent`.
- Motion: 150 ms ease-out for state changes; progress updates without layout shift; `prefers-reduced-motion` disables animation.

### Iconography
Simple line icons (one set); status icons always paired with words (§5).

---

## 8. Content guidelines
- Use the exact texts from [04-SRS §5](04-SRS.md#5-error-catalogue-user-facing) for errors.
- Show Kane's own wording in quotes where possible (“Kane: …”), so findings are traceable.
- Dates: `16 Nov 2026, 14:05 (UTC+1)`; always show when a report was checked (BR-12).
- Never say a guide is “safe” — say which steps Kane could follow and which it couldn't check.
