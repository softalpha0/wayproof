# Project: Wayproof

Wayproof checks whether a crypto project's guides, official links and key screens actually work: Kane CLI follows them in a real browser, Claude fixes what fails, Kane re-runs to prove the fix. Command line + web app.

**Read first, in order:** hackathon.md → docs/README.md (facts, decisions, to-confirm list) → docs/01-PRD.md → PRODUCT_SURFACE_MAP.md → docs/04-SRS.md → TDD.md (central technical design). Screens: docs/02 and docs/03. Data: docs/05.

Event: KaneCLI Online Hackathon (TestMu AI). Deadline Thu 19 Nov 2026, 11:59 PM IST (19:29 Lagos). Repo must be public and created on/after 12 Nov.

Rules:
- Don't invent. Use only facts labelled [Rule], [Kane doc] or [Decided] in docs/. Anything else: ask, or mark it TC- in docs/README.md.
- Plan first; wait for my approval before writing code.
- I'm not a developer. Explain in plain language, and explain errors before fixing them.
- Build in the order of TDD.md §23. One feature at a time; tell me how to test it and how to try to break it; commit after each working feature with the requirement ID in the message (e.g. "feat(FR-21): kane adapter").
- Never connect a wallet, sign, or submit transactions (BR-1). Only visit allowed domains (BR-2). These are enforced in code and tested.
- Never report a defect Kane didn't observe (BR-11). Every verdict links to Kane evidence (BR-8).
- Kane is called as `kane-cli run "<objective>" --url <url> --agent --headless …`, spawned without a shell; results come from NDJSON `run_end` and exit codes 0–3.
- Claude outputs are validated with Zod; one retry; then ERR-AI.
- Keys only in environment variables (.env, never committed): ANTHROPIC_API_KEY (+ model per TC-3). Kane login stays in Kane's own credential store.
- When a requirement changes, update every doc that mentions its ID (see docs/README.md "How the documents stay in sync").
- When I report a problem, follow DEBUGGING.md exactly (no guessing, no rewrites, verify before claiming a fix).
- Keep TDD.md accurate as implementation changes (same commit). Mark features Implemented only after I verify them. Add anything important you learn (e.g. real Kane output fields) to TDD.md and the TC list.
