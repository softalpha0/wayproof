# Wayproof

**Wayproof checks whether a crypto project's how-to guide still works.** Kane CLI follows each step in a real browser, Claude proposes a corrected step when one fails, and Kane re-runs it to **prove** the fix. The result is a dated **Proof Report** where every verdict quotes Kane's own output.

Wayproof **never connects a wallet, signs or sends anything**. Steps that need a wallet are marked "Not checked — wallet step", and Kane is stopped if a wallet prompt ever appears.

Built for the **KaneCLI Online Hackathon** (TestMu AI) with Claude Code as the coding agent.

## See it first: real Proof Reports

**https://softalpha0.github.io/wayproof/**

Four real checks of two real guides on 17 Nov 2026:

| Guide | What Kane found |
|---|---|
| [Revoke.cash — How to revoke token approvals](https://revoke.cash/learn/approvals/how-to-revoke-token-approvals) | Look-up, network, sort and spender search all work without a wallet. The guide's Etherscan section is outside the allowed sites, so it was not run. An earlier run found that the "filters" control the guide mentions no longer exists (only "Search by Spender"), and Kane proved the search-based wording. |
| [Uniswap — How to bridge tokens using the web app](https://support.uniswap.org/hc/en-us/articles/31092864580877-How-to-bridge-tokens-using-the-Uniswap-web-app) | Opening the app, choosing a token, choosing the destination network (Kane saw "Base ETH") and entering 0.01 all work without a wallet. The "Review" step could not be checked: Wayproof's safety gate refused a check that mentions the "Approve and swap" button. |

Each report links Kane's raw output and Kane's own run page. Kane's sealed evidence packs stay private, because they contain Kane account details.

## How it works

```
guide link ─► fetch the page ─► Claude lists the steps (wallet steps marked)
   for each group of up to 3 checkable steps:
     Claude writes a Kane objective ─► safety gate (wallet words, allowed sites)
     ─► Kane CLI runs it in a real browser ─► Claude judges Kane's result
        pass          → Passed (or Verified fixed, if a fix came first)
        defect        → Claude proposes new wording ─► Kane re-runs it to prove it
        check_wording → the check is rewritten; the guide is not blamed
        blocked/error → Couldn't check (never reported as a guide problem)
   ─► Proof Report: score, every Kane run, the judge's quote, the proven fix
```

- **Kane and the agent talk to each other:** every Kane result (`run_end`, exit code, progress) goes back to Claude, whose fix goes back to Kane. At most 3 Kane runs per check.
- **Nothing is invented:** the judge must quote Kane's output word for word (checked in code). A Kane failure can never become a pass. "Needs a human" is only used when Kane actually showed a problem.
- **Safety lives in code, not prompts:** the objective must contain "Do not connect a wallet or sign anything.", fund-moving wording is refused, only allowed sites are visited (redirects included), and a live tripwire stops Kane at the first sign of a wallet prompt.

## Run it yourself (about 2 minutes to set up)

You need Node.js 22+, Google Chrome, a TestMu AI account (for Kane credits) and an Anthropic API key.

```bash
npm install -g @testmuai/kane-cli
```
```bash
kane-cli login --oauth
```
```bash
git clone https://github.com/softalpha0/wayproof.git
```
```bash
cd wayproof
```
```bash
pnpm install
```

Copy `.env.example` to `.env` and put your Anthropic API key in it. Then:

```bash
pnpm wayproof doctor
```
```bash
pnpm wayproof check https://revoke.cash/learn/approvals/how-to-revoke-token-approvals
```

The report is written to `.wayproof/runs/<id>/report.html`. Exit codes: 0 = everything checked works · 1 = a step needs a human · 2 = setup or input problem · 3 = credit budget reached.

Other sites a guide uses must be allowed explicitly, e.g. `--allow app.uniswap.org` for Uniswap's guide. Each check has a budget (`--budget`, default 300 Kane credits).

**Cost seen on 17 Nov 2026:** 57–138 Kane credits per guide (one Kane run is usually 15–35 credits), and a few US cents of Claude (Claude Opus 5.5).

### Or use the web app (on your computer)

```bash
pnpm web
```

Run it from the project folder, then open the address it prints (usually http://127.0.0.1:4310 — if that port is busy, Wayproof picks the next free one and says so). Paste a guide link, review the steps Wayproof found (wallet steps are marked and never run), press **Start check**, and watch Kane work live. The finished Proof Report opens in the browser. It uses the same `.env` and Kane login as the command line. One Kane run happens at a time, and each visitor gets 2 live checks per day (optional access codes for more). The web app is not hosted publicly yet; the published reports above are the live demo.

## Honest limits

- **Wallet steps are never checked.** Wayproof stops where a wallet is needed, on purpose.
- **Some sites block automated browsers.** Etherscan and Arbitrum's bridge showed Kane a Cloudflare bot check. Wayproof reports this as "Couldn't check" and never tries to get around it.
- **Claude can read a guide slightly differently from run to run.** On Revoke.cash, one run treated "apply filters or search" as two steps and another as one, which changed a verdict. Both runs are published with an explanation.
- **Kane's `--timeout` did not stop runs in our tests**, so Wayproof keeps its own stopwatch and stops Kane (and the Chrome it started) itself.
- **Reports are snapshots**, dated, not live status.

## Tests

```bash
pnpm test
```

189 tests (engine, CLI and web app), with no credits spent. Kane is replaced by a fake that replays **real recorded Kane output** (`fixtures/kane/`), and Claude by a scripted fake. Real Claude replies are recorded in `fixtures/claude/`.

## Project layout

| Path | What |
|---|---|
| `packages/engine` | The one "brain": Kane adapter, safety gate, Claude adapter, fetcher, fix loop, report builder |
| `packages/cli` | `wayproof doctor` and `wayproof check` |
| `packages/web` | The web app (`pnpm web`): set-up review, live check, Proof Report |
| `fixtures/` | Real Kane output and real Claude replies, used as contract tests |
| `docs/`, `TDD.md` | Requirements, design, decisions and open questions |
| `FEATURE_GUIDE.md` | What is built and how to try each part |
| `DEBUGGING.md` | How bugs are investigated |

Built with Kane CLI 0.10.4, Claude Opus 5.5 (`@anthropic-ai/sdk`), TypeScript, Zod, execa, Mozilla Readability, Vitest and pnpm.
