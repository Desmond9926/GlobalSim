# GlobalSim

GlobalSim is a local single-user MVP for multi-agent geopolitical simulation. It fetches public news, extracts structured events, runs explainable mock or LLM-backed agent simulations, supports natural-language intervention branches, and generates research briefs with Markdown export.

## Requirements

- Python 3.12+
- Node.js 20+
- npm

## Setup

```bash
cp .env.example .env
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm install
npm --prefix frontend install
npx playwright install chromium
```

The default `.env` runs against local SQLite and the deterministic mock provider:

```text
DATABASE_URL=sqlite:///./data/globalsim.sqlite3
API_HOST=127.0.0.1
API_PORT=8000
VITE_API_BASE_URL=http://127.0.0.1:8000
LLM_PROVIDER=mock
LLM_BASE_URL=
LLM_MODEL=
LLM_API_KEY=
```

`VITE_API_BASE_URL` is used by the frontend. Backend settings ignore unknown frontend-only keys, so the shared `.env` can be used by both services.

## Start

Run both backend and frontend with one command:

```bash
./dev.sh
```

Open:

```text
http://127.0.0.1:5173
```

The backend runs at:

```text
http://127.0.0.1:8000
```

Stop both services with `Ctrl+C`.

After the services are running, check local readiness with:

```bash
./doctor.sh
```

Before starting services, you can run dependency-only checks with:

```bash
./doctor.sh --offline
```

The settings page also shows runtime diagnostics from `/api/runtime/status`, including API address, SQLite reachability, seed counts, news-source count, and LLM mode.

You can also start services separately:

```bash
npm run backend:dev
npm run frontend:dev
```

## LLM Configuration

LLM configuration is optional. When no real model is configured, GlobalSim uses the deterministic mock provider for event extraction and simulation decisions.

OpenAI-compatible configuration:

```text
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
LLM_API_KEY=your_api_key
```

DeepSeek configuration:

```text
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
LLM_API_KEY=your_api_key
```

`LLM_BASE_URL` may be left empty for built-in OpenAI and DeepSeek defaults.

## Demo Flow

Use the console at `http://127.0.0.1:5173`:

1. Open `态势盘` and inspect the 6-agent React Flow relationship network.
2. Open `新闻事件` and click `抓取新闻`.
3. Click `抽取事件`, then edit actor, targets, domain, intensity, summary, or review status.
4. Open `推演`, select the event, choose agents and `3` rounds, then click `运行推演`.
5. Review Agent response cards with perception, goals, candidate actions, decision, confidence, and citations.
6. Enter a natural-language intervention such as `假设欧盟不跟进制裁`, click `解析干预`, then `确认生成分支`.
7. Open `报告`, click `生成报告`, then click `Markdown 导出`.

## Checks

```bash
.venv/bin/pytest
npm --prefix frontend run test
npm run build
./doctor.sh
npx playwright test
```

Playwright covers the core flow plus 1440px, 1920px, and small-screen layout checks.

## Key APIs

```text
GET    /api/health
GET    /api/runtime/status
GET    /api/agents
GET    /api/world-state
POST   /api/world-state/reset-seed

GET    /api/news/sources
GET    /api/news
POST   /api/news/fetch
POST   /api/news/extract-events
PATCH  /api/news/sources/{source_id}

GET    /api/events
PATCH  /api/events/{event_id}

GET    /api/simulations
POST   /api/simulations
GET    /api/simulations/{simulation_id}
POST   /api/simulations/{simulation_id}/interventions
POST   /api/simulations/{simulation_id}/interventions/confirm
GET    /api/simulations/{simulation_id}/branches

GET    /api/reports/{simulation_id}
GET    /api/reports/{simulation_id}/markdown
GET    /api/llm/status
```
