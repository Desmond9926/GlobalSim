import sqlite3

from fastapi.testclient import TestClient

from backend.app.config import get_settings
from backend.app.database import extract_events_from_news, get_events, initialize_sqlite, update_event
from backend.app.main import app


def insert_news(connection: sqlite3.Connection, title: str, summary: str | None = None) -> int:
    slug = "-".join(title.casefold().split())
    cursor = connection.execute(
        """
        INSERT INTO news (title, source, url, published_at, summary, fetched_at, fingerprint, extraction_status)
        VALUES (?, 'Test Source', ?, '2026-06-05T02:15:00Z', ?, '2026-06-05T02:20:00Z', ?, 'pending')
        """,
        (
            title,
            f"https://example.com/{slug}",
            summary,
            f"fingerprint:{title}",
        ),
    )
    return cursor.lastrowid


def test_mock_event_extraction_returns_stable_schema(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'events.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with sqlite3.connect(settings.sqlite_path) as connection:
        news_id = insert_news(
            connection,
            "United States announces sanctions on Russia",
            "The White House announced new trade sanctions after security talks.",
        )

    result = extract_events_from_news([news_id], settings)
    events = get_events(settings)

    assert result["created"] == 1
    assert events[0]["actor"] == "usa"
    assert events[0]["targets"] == ["russia"]
    assert events[0]["action"] == "sanctions"
    assert events[0]["domain"] == "economic"
    assert events[0]["needs_review"] is False
    assert result["news"][0]["extraction_status"] == "extracted"


def test_mock_event_extraction_marks_uncertain_news_as_needs_review(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'review.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with sqlite3.connect(settings.sqlite_path) as connection:
        news_id = insert_news(connection, "Leaders discuss regional developments", "No clear actor or action.")

    result = extract_events_from_news([news_id], settings)

    assert result["events"][0]["needs_review"] is True
    assert result["events"][0]["actor"] == "un"
    assert result["news"][0]["extraction_status"] == "needs_review"


def test_event_update_persists_editable_fields(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'edit.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with sqlite3.connect(settings.sqlite_path) as connection:
        news_id = insert_news(connection, "NATO warns Russia over military deployment")
    event = extract_events_from_news([news_id], settings)["events"][0]

    updated = update_event(
        event["id"],
        {
            "actor": "nato",
            "targets": ["russia", "eu"],
            "action": "warning",
            "domain": "security",
            "intensity": 0.77,
            "summary": "Edited analyst summary.",
            "occurred_at": "2026-06-05T03:00:00Z",
            "needs_review": False,
        },
        settings,
    )

    assert updated is not None
    assert updated["actor"] == "nato"
    assert updated["targets"] == ["russia", "eu"]
    assert updated["intensity"] == 0.77
    assert updated["summary"] == "Edited analyst summary."


def test_events_api_supports_extract_list_and_patch(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'api-events.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    with sqlite3.connect(settings.sqlite_path) as connection:
        news_id = insert_news(connection, "China and EU meet for trade talks", "Officials met in Beijing.")

    with TestClient(app) as client:
        extract_response = client.post("/api/news/extract-events", json={"news_ids": [news_id]})
        event_id = extract_response.json()["events"][0]["id"]
        patch_response = client.patch(
            f"/api/events/{event_id}",
            json={
                "actor": "china",
                "targets": ["eu"],
                "domain": "economic",
                "intensity": 0.55,
                "summary": "Manual edit saved through API.",
            },
        )
        list_response = client.get("/api/events")

    assert extract_response.status_code == 200
    assert extract_response.json()["created"] == 1
    assert patch_response.status_code == 200
    assert patch_response.json()["summary"] == "Manual edit saved through API."
    assert list_response.status_code == 200
    assert list_response.json()[0]["targets"] == ["eu"]
