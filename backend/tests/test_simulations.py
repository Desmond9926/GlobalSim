import sqlite3

from fastapi.testclient import TestClient

from backend.app.config import get_settings
from backend.app.database import (
    create_branch_from_intervention,
    create_simulation,
    extract_events_from_news,
    get_report,
    get_report_markdown,
    get_simulation,
    get_simulation_branches,
    initialize_sqlite,
    parse_intervention,
)
from backend.app.main import app
from backend.tests.test_events import insert_news


def seed_event(settings) -> int:
    with sqlite3.connect(settings.sqlite_path) as connection:
        news_id = insert_news(
            connection,
            "United States announces sanctions on Russia",
            "The White House announced new trade sanctions after security talks.",
        )
    return extract_events_from_news([news_id], settings)["events"][0]["id"]


def test_mock_simulation_returns_stable_multi_round_decisions(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'simulation.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)
    event_id = seed_event(settings)

    first = create_simulation(event_id, ["usa", "russia", "un"], 3, settings)
    second = create_simulation(event_id, ["usa", "russia", "un"], 3, settings)

    assert first is not None
    assert second is not None
    comparable_first = [
        {key: value for key, value in decision.items() if key not in {"id", "simulation_id", "created_at"}}
        for decision in first["decisions"]
    ]
    comparable_second = [
        {key: value for key, value in decision.items() if key not in {"id", "simulation_id", "created_at"}}
        for decision in second["decisions"]
    ]
    assert comparable_first == comparable_second
    assert first["rounds"] == 3
    assert first["participant_agent_ids"] == ["usa", "russia", "un"]
    assert len(first["decisions"]) == 9
    assert first["decisions"][0]["options"][0]["score"] >= 0
    assert first["decisions"][0]["goals_considered"]
    assert first["decisions"][0]["citations"][0]["type"] == "event"


def test_simulation_can_be_replayed_by_id(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'replay.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)
    event_id = seed_event(settings)

    simulation = create_simulation(event_id, ["usa", "russia"], 2, settings)
    replayed = get_simulation(simulation["id"], settings)

    assert replayed is not None
    assert replayed["id"] == simulation["id"]
    assert replayed["source_event_id"] == event_id
    assert [decision["round"] for decision in replayed["decisions"]] == [1, 1, 2, 2]
    assert replayed["decisions"][1]["agent_id"] == "russia"


def test_simulation_api_creates_lists_and_reads_runs(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'api-simulation.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)
    event_id = seed_event(settings)

    with TestClient(app) as client:
        create_response = client.post(
            "/api/simulations",
            json={"event_id": event_id, "agent_ids": ["usa", "russia", "un"], "rounds": 3},
        )
        simulation_id = create_response.json()["id"]
        list_response = client.get("/api/simulations")
        read_response = client.get(f"/api/simulations/{simulation_id}")

    assert create_response.status_code == 200
    assert create_response.json()["status"] == "completed"
    assert len(create_response.json()["decisions"]) == 9
    assert list_response.status_code == 200
    assert list_response.json()[0]["id"] == simulation_id
    assert read_response.status_code == 200
    assert read_response.json()["decisions"][0]["perception"].startswith("Round 1")


def test_intervention_confirmation_creates_branch_without_overwriting_original(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'branch.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)
    event_id = seed_event(settings)
    simulation = create_simulation(event_id, ["usa", "eu", "russia"], 3, settings)

    original_decision_ids = [decision["id"] for decision in simulation["decisions"]]
    intervention = parse_intervention(simulation["id"], "假设欧盟不跟进制裁", 2, settings)
    branch = create_branch_from_intervention(
        simulation["id"],
        intervention["id"],
        "EU no follow-on sanctions",
        settings,
    )
    replayed = get_simulation(simulation["id"], settings)
    branches = get_simulation_branches(simulation["id"], settings)

    assert intervention["parsed_payload"]["actors"] == ["eu"]
    assert intervention["parsed_payload"]["policy_shift"] == "refrain_from_sanctions"
    assert branch["name"] == "EU no follow-on sanctions"
    assert branch["from_round"] == 2
    assert len(branch["decisions"]) == 9
    assert [decision["id"] for decision in replayed["decisions"] if decision["branch_id"] is None] == original_decision_ids
    assert branches["original"]["decisions"][0]["decision"].startswith("USA chooses")
    assert branches["branches"][0]["decisions"][0]["decision"].startswith("[EU no follow-on sanctions]")


def test_intervention_branch_api_flow(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'branch-api.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)
    event_id = seed_event(settings)

    with TestClient(app) as client:
        simulation_id = client.post(
            "/api/simulations",
            json={"event_id": event_id, "agent_ids": ["usa", "eu"], "rounds": 2},
        ).json()["id"]
        intervention_response = client.post(
            f"/api/simulations/{simulation_id}/interventions",
            json={"text": "假设欧盟不跟进制裁", "from_round": 1},
        )
        intervention_id = intervention_response.json()["id"]
        branch_response = client.post(
            f"/api/simulations/{simulation_id}/interventions/confirm",
            json={"intervention_id": intervention_id, "branch_name": "EU restraint branch"},
        )
        branches_response = client.get(f"/api/simulations/{simulation_id}/branches")

    assert intervention_response.status_code == 200
    assert intervention_response.json()["parsed_payload"]["expected_effect"]
    assert branch_response.status_code == 200
    assert branch_response.json()["name"] == "EU restraint branch"
    assert branches_response.status_code == 200
    assert len(branches_response.json()["original"]["decisions"]) == 4
    assert len(branches_response.json()["branches"][0]["decisions"]) == 4


def test_report_generation_is_stable_and_contains_required_sections(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'report.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)
    event_id = seed_event(settings)
    simulation = create_simulation(event_id, ["usa", "eu", "russia"], 3, settings)

    first_report = get_report(simulation["id"], settings)
    second_report = get_report(simulation["id"], settings)
    markdown_payload = get_report_markdown(simulation["id"], settings)

    assert first_report is not None
    assert second_report is not None
    assert first_report["event_summary"]["title"] == "United States announces sanctions on Russia"
    assert first_report["key_judgments"] == second_report["key_judgments"]
    assert first_report["risks"][0]["level"] in {"Low", "Medium", "High"}
    assert isinstance(first_report["risks"][0]["probability"], int)
    assert first_report["risks"][0]["uncertainty"] in {"Low", "Medium", "High"}
    assert first_report["source_links"][0]["url"] == "https://example.com/united-states-announces-sanctions-on-russia"
    assert "## Event Summary" in markdown_payload["markdown"]
    assert "## Key Judgments" in markdown_payload["markdown"]
    assert "## Agent Responses" in markdown_payload["markdown"]
    assert "## Timeline" in markdown_payload["markdown"]
    assert "## Risk Analysis" in markdown_payload["markdown"]
    assert "## Key Variables" in markdown_payload["markdown"]
    assert "## Sources" in markdown_payload["markdown"]


def test_report_api_returns_brief_and_markdown(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'report-api.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)
    event_id = seed_event(settings)

    with TestClient(app) as client:
        simulation_id = client.post(
            "/api/simulations",
            json={"event_id": event_id, "agent_ids": ["usa", "eu"], "rounds": 2},
        ).json()["id"]
        report_response = client.get(f"/api/reports/{simulation_id}")
        markdown_response = client.get(f"/api/reports/{simulation_id}/markdown")

    assert report_response.status_code == 200
    assert report_response.json()["title"].startswith("Research Brief:")
    assert report_response.json()["risks"][0]["probability"] >= 5
    assert markdown_response.status_code == 200
    assert markdown_response.json()["markdown"].startswith("# Research Brief:")
