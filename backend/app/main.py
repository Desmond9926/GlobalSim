from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.app.config import get_settings
from backend.app.database import (
    create_branch_from_intervention,
    create_simulation,
    extract_events_from_news,
    fetch_news,
    get_event,
    get_events,
    get_agents,
    get_news,
    get_news_sources,
    get_report,
    get_report_markdown,
    get_runtime_status,
    get_simulation_branches,
    get_simulation,
    get_simulations,
    get_world_state,
    initialize_sqlite,
    parse_intervention,
    reset_seed_data,
    set_news_source_enabled,
    update_event,
)
from backend.app.llm import get_llm_status


class NewsSourceUpdate(BaseModel):
    enabled: bool


class ExtractEventsRequest(BaseModel):
    news_ids: list[int]


class EventUpdate(BaseModel):
    actor: str | None = None
    targets: list[str] | None = None
    action: str | None = None
    domain: str | None = None
    intensity: float | None = None
    summary: str | None = None
    occurred_at: str | None = None
    needs_review: bool | None = None


class SimulationCreateRequest(BaseModel):
    event_id: int
    agent_ids: list[str]
    rounds: int


class InterventionCreateRequest(BaseModel):
    text: str
    from_round: int | None = None


class InterventionConfirmRequest(BaseModel):
    intervention_id: int
    branch_name: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_sqlite(get_settings())
    yield


app = FastAPI(title="GlobalSim API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "globalsim-api"}


@app.get("/api/runtime/status")
def read_runtime_status() -> dict:
    return get_runtime_status(get_settings())


@app.get("/api/llm/status")
def read_llm_status() -> dict:
    return get_llm_status(get_settings())


@app.get("/api/agents")
def list_agents() -> list[dict]:
    return get_agents(get_settings())


@app.get("/api/world-state")
def read_world_state() -> dict:
    return get_world_state(get_settings())


@app.post("/api/world-state/reset-seed")
def reset_world_state_seed() -> dict:
    return reset_seed_data(get_settings())


@app.get("/api/news")
def list_news(
    source_id: str | None = None,
    extraction_status: str | None = None,
    since: str | None = None,
) -> list[dict]:
    return get_news(
        source_id=source_id,
        extraction_status=extraction_status,
        since=since,
        settings=get_settings(),
    )


@app.post("/api/news/fetch")
def trigger_news_fetch() -> dict:
    return fetch_news(get_settings())


@app.post("/api/news/extract-events")
def trigger_event_extraction(request: ExtractEventsRequest) -> dict:
    return extract_events_from_news(request.news_ids, get_settings())


@app.get("/api/events")
def list_events() -> list[dict]:
    return get_events(get_settings())


@app.get("/api/events/{event_id}")
def read_event(event_id: int) -> dict:
    event = get_event(event_id, get_settings())
    if event is None:
        return {"status": "not_found", "event_id": event_id}
    return event


@app.patch("/api/events/{event_id}")
def patch_event(event_id: int, update: EventUpdate) -> dict:
    event = update_event(event_id, update.model_dump(exclude_unset=True), get_settings())
    if event is None:
        return {"status": "not_found", "event_id": event_id}
    return event


@app.get("/api/simulations")
def list_simulations() -> list[dict]:
    return get_simulations(get_settings())


@app.post("/api/simulations")
def create_simulation_run(request: SimulationCreateRequest) -> dict:
    try:
        simulation = create_simulation(request.event_id, request.agent_ids, request.rounds, get_settings())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if simulation is None:
        return {"status": "not_found", "event_id": request.event_id}
    return simulation


@app.get("/api/simulations/{simulation_id}")
def read_simulation(simulation_id: int) -> dict:
    simulation = get_simulation(simulation_id, get_settings())
    if simulation is None:
        return {"status": "not_found", "simulation_id": simulation_id}
    return simulation


@app.post("/api/simulations/{simulation_id}/interventions")
def create_simulation_intervention(simulation_id: int, request: InterventionCreateRequest) -> dict:
    try:
        intervention = parse_intervention(simulation_id, request.text, request.from_round, get_settings())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if intervention is None:
        return {"status": "not_found", "simulation_id": simulation_id}
    return intervention


@app.post("/api/simulations/{simulation_id}/interventions/confirm")
def confirm_simulation_intervention(simulation_id: int, request: InterventionConfirmRequest) -> dict:
    branch = create_branch_from_intervention(
        simulation_id,
        request.intervention_id,
        request.branch_name,
        get_settings(),
    )
    if branch is None:
        return {
            "status": "not_found",
            "simulation_id": simulation_id,
            "intervention_id": request.intervention_id,
        }
    return branch


@app.get("/api/simulations/{simulation_id}/branches")
def read_simulation_branches(simulation_id: int) -> dict:
    branches = get_simulation_branches(simulation_id, get_settings())
    if branches is None:
        return {"status": "not_found", "simulation_id": simulation_id}
    return branches


@app.get("/api/reports/{simulation_id}")
def read_report(simulation_id: int) -> dict:
    report = get_report(simulation_id, get_settings())
    if report is None:
        return {"status": "not_found", "simulation_id": simulation_id}
    return report


@app.get("/api/reports/{simulation_id}/markdown")
def read_report_markdown(simulation_id: int) -> dict:
    markdown = get_report_markdown(simulation_id, get_settings())
    if markdown is None:
        return {"status": "not_found", "simulation_id": simulation_id}
    return markdown


@app.get("/api/news/sources")
def list_news_sources() -> list[dict]:
    return get_news_sources(get_settings())


@app.patch("/api/news/sources/{source_id}")
def update_news_source(source_id: str, update: NewsSourceUpdate) -> dict:
    source = set_news_source_enabled(source_id, update.enabled, get_settings())
    if source is None:
        return {"status": "not_found", "source_id": source_id}
    return source


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
