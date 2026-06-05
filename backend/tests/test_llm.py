import sqlite3

import httpx
from fastapi.testclient import TestClient

from backend.app.config import get_settings
from backend.app.database import create_simulation, extract_events_from_news, initialize_sqlite
from backend.app.llm import LlmAdapter
from backend.app.main import app
from backend.tests.test_events import insert_news


def test_llm_status_defaults_to_mock_when_unconfigured(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'llm-status.sqlite3'}")
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with TestClient(app) as client:
        response = client.get("/api/llm/status")

    assert response.status_code == 200
    assert response.json() == {
        "provider": "mock",
        "mode": "mock",
        "configured": False,
        "model": None,
        "base_url": None,
        "has_api_key": False,
    }


def test_deepseek_status_uses_openai_compatible_default_base_url(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'deepseek.sqlite3'}")
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "deepseek-chat")
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    get_settings.cache_clear()

    status = LlmAdapter(get_settings()).status()

    assert status.provider == "deepseek"
    assert status.mode == "llm"
    assert status.configured is True
    assert status.base_url == "https://api.deepseek.com/v1"


def test_configured_llm_extracts_event_with_schema_validation(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'llm-extract.sqlite3'}")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "gpt-test")
    monkeypatch.setenv("LLM_BASE_URL", "https://llm.example/v1")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with sqlite3.connect(settings.sqlite_path) as connection:
        connection.row_factory = sqlite3.Row
        news_id = insert_news(connection, "China and EU meet for trade talks", "Officials met in Beijing.")

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://llm.example/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-key"
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"title":"China and EU meet for trade talks","actor":"china",'
                                '"targets":["eu"],"action":"meeting","domain":"economic",'
                                '"intensity":0.44,"summary":"LLM extracted trade meeting.",'
                                '"occurred_at":"2026-06-05T02:15:00Z","needs_review":false}'
                            )
                        }
                    }
                ]
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        monkeypatch.setattr("backend.app.database.LlmAdapter", lambda _: LlmAdapter(settings, client))
        result = extract_events_from_news([news_id], settings)

    assert result["created"] == 1
    assert result["events"][0]["summary"] == "LLM extracted trade meeting."
    assert result["events"][0]["actor"] == "china"
    assert result["events"][0]["targets"] == ["eu"]
    assert result["events"][0]["needs_review"] is False


def test_configured_llm_generates_agent_decision_with_schema_validation(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'llm-simulation.sqlite3'}")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "gpt-test")
    monkeypatch.setenv("LLM_BASE_URL", "https://llm.example/v1")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with sqlite3.connect(settings.sqlite_path) as connection:
        news_id = insert_news(
            connection,
            "United States announces sanctions on Russia",
            "The White House announced new trade sanctions after security talks.",
        )
    event_id = extract_events_from_news([news_id], settings)["events"][0]["id"]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"perception":"LLM perception for the agent.",'
                                '"goals_considered":["deterrence"],'
                                '"options":[{"action":"coordinate_response","score":0.72,'
                                '"rationale":"Best supports the stated goal."}],'
                                '"decision":"Coordinate a measured response.",'
                                '"confidence":0.81,'
                                '"citations":[{"type":"event","id":1}]}'
                            )
                        }
                    }
                ]
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        monkeypatch.setattr("backend.app.database.LlmAdapter", lambda _: LlmAdapter(settings, client))
        simulation = create_simulation(event_id, ["usa"], 1, settings)

    assert simulation["input_snapshot"]["mode"] == "llm"
    assert simulation["input_snapshot"]["llm_provider"] == "openai"
    assert simulation["decisions"][0]["perception"] == "LLM perception for the agent."
    assert simulation["decisions"][0]["agent_id"] == "usa"
    assert simulation["decisions"][0]["round"] == 1
