# Real Claude replies (fixtures)

Recorded on 17 Nov 2026 with `claude-opus-5-5` by `pnpm --filter @wayproof/engine claude:live-check` (≈ $0.10 in total).
Each file holds what Wayproof asked for and Claude's checked answer (or the reason it was rejected), plus token usage.
The guide pages' own text is not stored here; only Claude's replies.

| File | Prompt | What it shows |
|---|---|---|
| `extract-revoke.json` | extract | Revoke.cash guide → 10 steps; the Revoke and edit buttons are marked wallet steps |
| `extract-uniswap-bridge.json` | extract | Uniswap bridging guide → 10 steps; 2–7 checkable, 1 and 8–10 wallet steps |
| `plan-revoke.json` | plan | A safe Kane objective for the first Revoke.cash steps (passed the safety gate first time) |
| `judge-uniswap-bridge-assertion-too-strict.json` | judge | `check_wording`: the amount on Base was visible; the check relied on an icon. The guide is not blamed |
| `judge-revoke-lookup-pass.json` | judge | `pass`, with a quote from Kane's summary |
