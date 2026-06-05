# Decision Log

## 2026-06-05: Phase 0 development baseline

- Created the backend as a Python FastAPI package under `backend/` with `/api/health` and SQLite initialization during app startup.
- Added local environment defaults through `.env.example`; SQLite defaults to `./data/globalsim.sqlite3`.
- Created the frontend as a Vite React TypeScript app under `frontend/` with shadcn-style local UI primitives and a desktop SaaS console shell.
- Added root npm scripts so Phase 0 checks can run from the repository root: `npm run build` and `npx playwright test --list`.
- Configured backend pytest, frontend Vitest component tests, and Playwright E2E discovery.
- Used `requirements.txt` and `requirements-dev.txt` for local backend dependency installation because editable package installation depends on isolated build downloads that are unnecessary for Phase 0 development.

## 2026-06-05: Phase 1 seed world state

- Added explicit SQLite tables for news, events, agents, relations, simulations, simulation decisions, interventions, branches, and reports.
- Stored the initial six-actor world state in `backend/app/seed_data/world_state.json` so agents, goals, capabilities, and relations remain data-driven.
- Import seed data during SQLite initialization with idempotent upserts; added `/api/world-state/reset-seed` for reset and reimport.
- Added `/api/agents` and `/api/world-state` to expose the seed actors, relation edges, and seed status.
- Updated the frontend dashboard to render the seed nodes and relation summary, and added a settings seed-status panel.
- Verified Phase 1 with backend pytest, frontend Vitest, production build, Playwright test discovery, and a local `npx playwright test` run that passed 1 E2E test.

## 2026-06-05: Phase 2 frontend application shell

- Added `@xyflow/react` and replaced the seed node grid with a React Flow relationship network driven by `/api/world-state`.
- Expanded the frontend into five primary pages: situation dashboard, news events, simulation, reports, and settings.
- Added dashboard side panels for node and relation details, risk ranking, key variables, core capability ranking, and recent simulation entry points.
- Kept the Phase 2 data display read-only and seed-backed so later phases can attach real news, event extraction, simulation, and report APIs without changing the top-level shell.
- Updated Vitest and Playwright coverage to assert the non-empty network, dashboard panels, settings seed status, and page switching.
- Verified Phase 2 with backend pytest, frontend Vitest, production build, Playwright test discovery, and a local `npx playwright test` run that passed 1 E2E test.

## 2026-06-05: Phase 3 RSS news ingestion

- Added a `news_sources` SQLite table with seed RSS/public sources, enabled state, last fetch status, and last error.
- Kept news ingestion data-driven through `backend/app/seed_data/news_sources.json`; source enable/disable changes affect future fetches without hiding existing news.
- Implemented `GET /api/news`, `POST /api/news/fetch`, `GET /api/news/sources`, and `PATCH /api/news/sources/{source_id}`.
- Used standard-library XML parsing plus `httpx` for RSS/Atom fetches, with canonical URL fingerprints to keep repeated fetches idempotent.
- Persisted per-source fetch errors so failed RSS sources do not block existing news list reads.
- Replaced the static news page placeholder with API-backed source/time/status filters, a news table, source links, fetch summary, and a details side panel.
- Updated settings to show seeded news sources and enable/disable controls.
- Verified Phase 3 with backend pytest, frontend Vitest, production build, and Playwright E2E covering news list, fetch, details, and settings source visibility.

## 2026-06-05: Phase 4 mock event extraction

- Upgraded the local schema marker to `phase4` and exposed structured events through `GET /api/events`, `GET /api/events/{id}`, and `PATCH /api/events/{id}`.
- Implemented `POST /api/news/extract-events` with a deterministic mock extractor so fixed news input returns stable actor, targets, action, domain, intensity, summary, and occurred-at fields without requiring a live LLM.
- Kept the API field name as `actor` while the SQLite table stores `actor_agent_id`, preserving the existing agent foreign-key direction and a simpler frontend contract.
- Marked uncertain extraction output as `needs_review` and mirrored that state into the source news `extraction_status` so analysts can filter and correct low-confidence events.
- Added event editing on the news detail side panel for actor, targets, action, domain, intensity, summary, occurred_at, and review state.
- Verified Phase 4 with backend pytest, frontend Vitest, production build, and Playwright E2E covering event extraction and persisted edit flow.

## 2026-06-05: Phase 5 basic simulation loop

- Upgraded the local schema marker to `phase5` and implemented mock simulation creation through `POST /api/simulations`.
- Added `GET /api/simulations` and `GET /api/simulations/{id}` so completed runs can be listed and replayed from persisted SQLite state.
- Reused the existing `simulations` and `simulation_decisions` tables to store source event snapshots, selected participants, round count, and every Agent decision.
- Implemented deterministic mock Agent decisions for 1-5 rounds, including perception, goals considered, candidate actions with scores and rationales, final decision, confidence, and citations.
- Replaced the static simulation placeholder with a real simulation workspace where users select an event, participating Agents, and round count, then inspect a full timeline of Agent response cards.
- Verified Phase 5 with backend pytest, frontend Vitest, production build, and Playwright E2E covering event extraction, simulation creation, timeline rendering, and settings.

## 2026-06-05: Phase 6 LLM adapter

- Upgraded the local schema marker to `phase6` and added a unified backend LLM adapter for event extraction and Agent decision generation.
- Supported `LLM_PROVIDER=mock|openai|deepseek` with `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`; DeepSeek uses the same OpenAI-compatible chat completions contract as OpenAI.
- Kept deterministic mock extraction and simulation available as the default offline mode when real model configuration is missing or invalid.
- Validated LLM event and decision outputs with Pydantic schemas before persistence, and marked failed event extraction fallbacks as `needs_review`.
- Added `GET /api/llm/status` and surfaced provider, mode, model, base URL, and fallback status in the settings page.
- Verified Phase 6 with backend pytest, frontend Vitest, production build, and Playwright E2E covering model status alongside the existing dashboard, news, event, simulation, and settings flows.

## 2026-06-05: Phase 7 interventions and branches

- Upgraded the local schema marker to `phase7` and added a migratable `branch_id` column to `simulation_decisions` so original decisions remain unbranched while branch decisions are stored separately.
- Implemented `POST /api/simulations/{id}/interventions`, `POST /api/simulations/{id}/interventions/confirm`, and `GET /api/simulations/{id}/branches`.
- Used deterministic intervention parsing for the MVP flow, including the Chinese acceptance example “假设欧盟不跟进制裁”, while keeping the parsed payload structured for later LLM-backed parsing.
- Confirmed interventions create named branches with their own persisted decisions and intervention citations without overwriting original simulation results.
- Added a fixed bottom intervention dock on the simulation page with free-text input, structured parse review, branch naming, confirmation, and branch/original switching.
- Verified Phase 7 with backend pytest, frontend Vitest, production build, and Playwright E2E covering intervention parsing, branch creation, and branch switching.

## 2026-06-05: Phase 8 reports and Markdown export

- Upgraded the local schema marker to `phase8` and reused the existing `reports` table as an idempotent cache for generated research briefs.
- Implemented `GET /api/reports/{simulation_id}` and `GET /api/reports/{simulation_id}/markdown` with deterministic report generation from persisted simulation snapshots, decisions, branches, citations, and source news links.
- Structured each report into event summary, key judgments, agent responses, timeline, risk analysis, key variables, and sources.
- Added risk estimates with level, percentage probability, uncertainty, and rationale so report output exposes the uncertainty model instead of only narrative text.
- Replaced the static report placeholder with a report workspace where users select a simulation, generate the brief, inspect structured sections, open source links, and view exported Markdown.
- Verified Phase 8 with backend pytest, frontend Vitest, production build, and Playwright E2E covering report generation and Markdown export.

## 2026-06-05: Phase 9 end-to-end acceptance and quality convergence

- Expanded Playwright from the single core-flow E2E into four acceptance checks: full product flow, 1440px desktop layout, 1920px desktop layout, and 390px small-screen scrollability.
- Added document-width assertions in E2E so major pages fail if they introduce viewport-level horizontal overflow at the target desktop and small-screen sizes.
- Tightened the dashboard and news two-column layouts so the desktop-first UI remains readable at the Phase 9 target widths without truncating the side panels.
- Reworked README into a handoff-oriented guide covering setup, shared `.env`, one-command startup, optional OpenAI/DeepSeek configuration, demo flow, verification commands, and key APIs.
- Cross-checked MVP scope against `plan.md` and `frontend.md`: seed world state, RSS news, event extraction/editing, simulation timeline, intervention branches, reports, Markdown export, five-page SaaS shell, desktop-first layout, and mobile scrollability are represented.
- Verified Phase 9 with backend pytest, frontend Vitest, production build, and Playwright E2E: 24 backend tests, 9 frontend tests, build passed, and 4 E2E tests passed.

## 2026-06-05: Phase 10 local runtime diagnostics

- Added `/api/runtime/status` as a read-only local readiness endpoint covering API address, SQLite reachability, seed metadata, news-source count, LLM mode, and explicit checks.
- Surfaced runtime diagnostics on the settings page so users can inspect database, seed, news-source, and model state from the UI.
- Added `doctor.sh` and `npm run doctor` for local startup verification after `./dev.sh`; the script checks `.env`, backend/frontend dependencies, frontend unit tests, backend health/runtime endpoints, and frontend reachability without using macOS-incompatible `wait -n`.
- Added `doctor.sh --offline` for dependency-only preflight checks in environments that cannot bind local service ports.
- Updated README with startup self-check instructions and documented the new runtime status API.
