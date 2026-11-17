# Proof Report · How to Revoke Token Approvals

Checked 17 Nov 2026, 16:54 (UTC+1) · <https://revoke.cash/learn/approvals/how-to-revoke-token-approvals>

**1 step group(s) needed new wording, and Kane proved the fix.**

> Earlier run of the same guide on the same day. Here Claude read the guide's "apply filters or search by the approved spender address" as two separate steps, and Wayproof's planner added an "ERC20" filter the guide never mentions. Kane found no filters control on today's page (true: only "Search by Spender" exists), so Claude proposed using the search field and Kane proved it — a Verified fix. The later main report checks the guide's own wording (filters OR search) and passes. Both runs are real; the difference shows how reading a guide's steps affects verdicts. This run also contains a since-fixed bug: Etherscan step 12 was checked on revoke.cash ("Couldn't check").

Score: 100/100 — 3 of 3 checked steps work (passed or verified fixed) = 100

Kane runs 5 · Kane credits 138 · allowed sites: revoke.cash

Wayproof never connects a wallet, signs or sends anything; steps that need a wallet are marked “Not checked”.

| Steps | Verdict | Why | Kane runs |
|---|---|---|---|
| Step 12 | ⚠ Couldn't check | The site stopped Kane: Kane could not reach the approvals list or the switch because the page needs a connected wallet or account context, and connecting one was prohibited, so the guide step itself was never tested. | 1 |
| Steps 3–5 | 🔧 Verified fixed | Kane followed the corrected wording and saw the expected result. | 2 |
| Step 1 | ✔ Passed | Kane followed the guide and saw the expected result. | 1 |
| Step 6 | ✔ Passed | Kane followed the guide and saw the expected result. | 1 |
| Step 2 | 🔒 Not checked — wallet step | This step needs a wallet. Wayproof never connects one (BR-1). | 0 |
| Step 7 | 🔒 Not checked — wallet step | This step needs a wallet. Wayproof never connects one (BR-1). | 0 |
| Step 8 | 🔒 Not checked — wallet step | This step needs a wallet. Wayproof never connects one (BR-1). | 0 |
| Step 13 | 🔒 Not checked — wallet step | This step needs a wallet. Wayproof never connects one (BR-1). | 0 |
| Steps 9–11 | 🚧 Not checked — outside allowed domains | These steps happen on https://etherscan.io/tokenapprovalchecker, which is not on the allowed sites list. | 0 |

## Corrected guide

### Steps 3–5

- Original: Select the network for which you want to revoke approvals Sort the list (e.g. by "Newest to Oldest" if you suspect you signed a malicious approval) Apply filters to the list
- Corrected (proven by Kane): Select the network for which you want to revoke approvals. Open the "Sort By" dropdown and choose "Newest to Oldest" if you suspect you signed a malicious approval. There is no separate filters control, so use the search field above the approvals list to narrow it down.
- Expected (unchanged): After the loading is finished, you see a list of all the token approvals you have on that network Then: The most recently signed approvals are shown first Then: The approvals list is filtered


Made by Wayproof (https://github.com/softalpha0/wayproof) with Kane CLI and Claude. Run 2026-11-17T15-54-14Z-33p4.
