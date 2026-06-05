import httpx
from fastapi.testclient import TestClient

from backend.app.config import get_settings
from backend.app.database import fetch_news, get_news, get_news_sources, initialize_sqlite
from backend.app.main import app


RSS_FEED = """<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Test feed</title>
    <item>
      <title>GlobalSim test headline</title>
      <link>https://example.com/news/1?utm_source=test</link>
      <pubDate>Fri, 05 Jun 2026 02:15:00 GMT</pubDate>
      <description>RSS summary for a deterministic test article.</description>
    </item>
  </channel>
</rss>
"""


def test_news_sources_are_seeded(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'sources.sqlite3'}")
    get_settings.cache_clear()

    initialize_sqlite(get_settings())
    sources = get_news_sources(get_settings())

    assert len(sources) >= 3
    assert any(source["name"] == "BBC News World" and source["enabled"] for source in sources)
    assert all(source["last_fetch_status"] in {"never", "ok", "error"} for source in sources)


def test_fetch_news_inserts_and_deduplicates_rss_items(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'fetch.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=RSS_FEED)

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        first_result = fetch_news(settings, client)
        second_result = fetch_news(settings, client)

    news = get_news(settings=settings)

    assert first_result["inserted"] >= 1
    assert second_result["inserted"] == 0
    assert second_result["duplicates"] >= first_result["inserted"]
    assert len(news) == first_result["inserted"]
    assert news[0]["title"] == "GlobalSim test headline"
    assert news[0]["extraction_status"] == "pending"


def test_fetch_failure_records_source_error_without_blocking_news_list(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'failure.sqlite3'}")
    get_settings.cache_clear()
    settings = get_settings()
    initialize_sqlite(settings)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="unavailable")

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        result = fetch_news(settings, client)

    sources = get_news_sources(settings)
    news = get_news(settings=settings)

    assert result["inserted"] == 0
    assert all(source["last_fetch_status"] == "error" for source in sources if source["enabled"])
    assert news == []


def test_news_api_supports_fetch_list_filters_and_source_toggle(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'api.sqlite3'}")
    get_settings.cache_clear()

    with TestClient(app) as client:
        sources_response = client.get("/api/news/sources")
        first_source = sources_response.json()[0]
        toggle_response = client.patch(
            f"/api/news/sources/{first_source['id']}",
            json={"enabled": not first_source["enabled"]},
        )
        news_response = client.get("/api/news", params={"extraction_status": "pending"})

    assert sources_response.status_code == 200
    assert first_source["id"]
    assert toggle_response.status_code == 200
    assert toggle_response.json()["enabled"] is (not first_source["enabled"])
    assert news_response.status_code == 200
    assert news_response.json() == []
