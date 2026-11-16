# Real Kane CLI output (fixtures)

Recorded on 16 Nov 2026 with Kane CLI 0.10.4 on Windows 11, flags `--agent --headless`.
Used by the Kane adapter's contract tests (TDD.md §20). Details and the full results table: TDD.md §13.1.

Each run has two files:
- `<name>.ndjson`: Kane's stdout, one JSON event per line
- `<name>.meta.json`: the objective, the exit code and Kane's stderr

Cleaned before committing: TestMu share links (`test_url`) are replaced with `<redacted-share-link>`, and the Windows home folder with `~`. Nothing else was changed.

| Name | Exit | `reason_code` | What it shows |
|---|---|---|---|
| `example-pass` | 0 | `success.complete` | Simple pass on example.com |
| `revoke-lookup-pass` | 0 | `success.complete` | Revoke.cash guide steps 1–4 (look up vitalik.eth, sort), no wallet |
| `example-assertion-fail` | 1 | `assertion_error.final_verification` | Deliberately false assertion (test only, not a guide finding) |
| `etherscan-captcha-blocked` | 1 | `blocker.captcha` | Etherscan showed a Cloudflare bot check |
| `arbitrum-bridge-captcha-blocked` | 1 | `blocker.captcha` | Arbitrum bridge showed a Cloudflare bot check |
| `arbitrum-portal-captcha-blocked` | 1 | `blocker.captcha` | Arbitrum portal showed a Cloudflare bot check |
| `example-timeout5-still-passed` | 0 | `success.complete` | `--timeout 5` did not stop a 23-second run |
| `uniswap-bridge-assertion-too-strict` | 1 | `assertion_error.final_verification` | Uniswap bridging guide steps 2–5 all worked (0.01 ETH → 0.00999713 ETH on Base shown), but Kane's final assertion failed; Kane's own summary says the result was visible and the check was worded too strictly. **Not a guide defect**: the judge must catch this case |

Not yet recorded: exit 2 (auth/setup/infrastructure error) and exit 3 (timeout/cancelled).
