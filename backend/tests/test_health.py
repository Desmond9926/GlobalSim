from fastapi.testclient import TestClient

from backend.app.main import app


def test_health_check_returns_ok() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "globalsim-api"}


def test_runtime_status_reports_local_readiness() -> None:
    with TestClient(app) as client:
        response = client.get("/api/runtime/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "globalsim-api"
    assert payload["database"]["reachable"] is True
    assert payload["seed_status"]["agent_count"] == 6
    assert payload["seed_status"]["relation_count"] > 0
    assert payload["news_sources"]["count"] > 0
    assert payload["llm"]["provider"] == "mock"
    assert payload["checks"] == {
        "database": True,
        "seed_agents": True,
        "seed_relations": True,
        "news_sources": True,
    }
