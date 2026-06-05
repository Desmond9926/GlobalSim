import sqlite3

from fastapi.testclient import TestClient

from backend.app.config import get_settings
from backend.app.database import get_world_state, initialize_sqlite, reset_seed_data
from backend.app.main import app


def test_initialize_sqlite_creates_phase1_schema_and_seed_data(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "globalsim.sqlite3"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    get_settings.cache_clear()

    initialize_sqlite(get_settings())
    initialize_sqlite(get_settings())

    with sqlite3.connect(database_path) as connection:
        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        agent_count = connection.execute("SELECT COUNT(*) FROM agents").fetchone()[0]
        relation_count = connection.execute("SELECT COUNT(*) FROM relations").fetchone()[0]
        schema_version = connection.execute(
            "SELECT value FROM app_metadata WHERE key = 'schema_version'"
        ).fetchone()[0]

    assert {
        "news",
        "news_sources",
        "events",
        "agents",
        "relations",
        "simulations",
        "simulation_decisions",
        "interventions",
        "branches",
        "reports",
    }.issubset(table_names)
    assert agent_count == 6
    assert relation_count >= 6
    assert schema_version == "phase8"


def test_agents_and_world_state_api_return_seed_graph(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'api.sqlite3'}")
    get_settings.cache_clear()

    with TestClient(app) as client:
        agents_response = client.get("/api/agents")
        world_state_response = client.get("/api/world-state")

    assert agents_response.status_code == 200
    agents = agents_response.json()
    assert {agent["name"] for agent in agents} == {"China", "USA", "Russia", "EU", "NATO", "UN"}
    assert all(agent["goals"] and agent["capabilities"] for agent in agents)

    assert world_state_response.status_code == 200
    world_state = world_state_response.json()
    assert len(world_state["nodes"]) == 6
    assert len(world_state["edges"]) >= 6
    assert world_state["seed_status"]["agent_count"] == 6
    assert world_state["seed_status"]["relation_count"] == len(world_state["edges"])


def test_frontend_origin_can_call_world_state_api(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'cors.sqlite3'}")
    get_settings.cache_clear()

    with TestClient(app) as client:
        response = client.options(
            "/api/world-state",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_reset_seed_data_reimports_core_world_state(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'reset.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with sqlite3.connect(settings.sqlite_path) as connection:
        connection.execute("DELETE FROM relations")
        connection.execute("DELETE FROM agents")

    status = reset_seed_data(settings)
    world_state = get_world_state(settings)

    assert status["agent_count"] == 6
    assert status["relation_count"] >= 6
    assert len(world_state["nodes"]) == 6
    assert len(world_state["edges"]) == status["relation_count"]
