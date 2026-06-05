import json
import sqlite3
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from xml.etree import ElementTree

import httpx

from backend.app.config import Settings, get_settings
from backend.app.llm import LlmAdapter

SEED_DATA_PATH = Path(__file__).parent / "seed_data" / "world_state.json"
NEWS_SOURCES_PATH = Path(__file__).parent / "seed_data" / "news_sources.json"


def connect(settings: Settings | None = None) -> sqlite3.Connection:
    settings = settings or get_settings()
    db_path = settings.sqlite_path
    if db_path is None:
        raise RuntimeError("Only sqlite:/// DATABASE_URL values are supported for Phase 1.")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_sqlite(settings: Settings | None = None) -> Path | None:
    settings = settings or get_settings()
    db_path = settings.sqlite_path
    if db_path is None:
        return None

    db_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(settings) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        create_schema(connection)
        import_seed_data(connection)
    return db_path


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS news_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            last_fetched_at TEXT,
            last_fetch_status TEXT NOT NULL DEFAULT 'never',
            last_error TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT,
            title TEXT NOT NULL,
            source TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            published_at TEXT,
            summary TEXT,
            fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            fingerprint TEXT NOT NULL UNIQUE,
            extraction_status TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY (source_id) REFERENCES news_sources(id)
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            actor_agent_id TEXT NOT NULL,
            action TEXT NOT NULL,
            domain TEXT NOT NULL,
            intensity REAL NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
            summary TEXT NOT NULL,
            occurred_at TEXT,
            needs_review INTEGER NOT NULL DEFAULT 0,
            source_news_ids TEXT NOT NULL DEFAULT '[]',
            targets TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (actor_agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            goals TEXT NOT NULL,
            capabilities TEXT NOT NULL,
            seed_version TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_agent_id TEXT NOT NULL,
            target_agent_id TEXT NOT NULL,
            friendliness REAL NOT NULL CHECK (friendliness >= -1 AND friendliness <= 1),
            trade_dependency REAL NOT NULL CHECK (trade_dependency >= 0 AND trade_dependency <= 1),
            military_tension REAL NOT NULL CHECK (military_tension >= 0 AND military_tension <= 1),
            summary TEXT NOT NULL,
            seed_version TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (source_agent_id, target_agent_id),
            FOREIGN KEY (source_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
            FOREIGN KEY (target_agent_id) REFERENCES agents(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS simulations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            source_event_id INTEGER,
            rounds INTEGER NOT NULL CHECK (rounds >= 1 AND rounds <= 5),
            status TEXT NOT NULL DEFAULT 'created',
            input_snapshot TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_event_id) REFERENCES events(id)
        );

        CREATE TABLE IF NOT EXISTS simulation_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            simulation_id INTEGER NOT NULL,
            branch_id INTEGER,
            round INTEGER NOT NULL,
            agent_id TEXT NOT NULL,
            perception TEXT NOT NULL,
            goals_considered TEXT NOT NULL,
            options TEXT NOT NULL,
            decision TEXT NOT NULL,
            confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
            citations TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
            FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS interventions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            simulation_id INTEGER NOT NULL,
            branch_id INTEGER,
            raw_text TEXT NOT NULL,
            parsed_payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending_confirmation',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            simulation_id INTEGER NOT NULL,
            parent_branch_id INTEGER,
            name TEXT NOT NULL,
            from_round INTEGER NOT NULL DEFAULT 0,
            intervention_id INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_branch_id) REFERENCES branches(id),
            FOREIGN KEY (intervention_id) REFERENCES interventions(id)
        );

        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            simulation_id INTEGER NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            markdown TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
        );
        """
    )
    ensure_news_source_column(connection)
    ensure_simulation_decision_branch_column(connection)
    connection.execute(
        """
        INSERT OR REPLACE INTO app_metadata (key, value)
        VALUES ('schema_version', 'phase8')
        """
    )
    import_news_sources(connection)


def ensure_news_source_column(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(news)").fetchall()
    }
    if "source_id" not in columns:
        connection.execute("ALTER TABLE news ADD COLUMN source_id TEXT")


def ensure_simulation_decision_branch_column(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(simulation_decisions)").fetchall()
    }
    if "branch_id" not in columns:
        connection.execute("ALTER TABLE simulation_decisions ADD COLUMN branch_id INTEGER")


def load_seed_data() -> dict[str, Any]:
    with SEED_DATA_PATH.open(encoding="utf-8") as seed_file:
        return json.load(seed_file)


def load_news_source_seed_data() -> list[dict[str, Any]]:
    with NEWS_SOURCES_PATH.open(encoding="utf-8") as source_file:
        return json.load(source_file)


def import_news_sources(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    for source in load_news_source_seed_data():
        connection.execute(
            """
            INSERT INTO news_sources (id, name, url, category, enabled)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                url = excluded.url,
                category = excluded.category,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                source["id"],
                source["name"],
                source["url"],
                source["category"],
                1 if source["enabled"] else 0,
            ),
        )
    return get_news_sources_from_connection(connection)


def import_seed_data(connection: sqlite3.Connection) -> dict[str, Any]:
    seed_data = load_seed_data()
    seed_version = seed_data["seed_version"]

    for agent in seed_data["agents"]:
        connection.execute(
            """
            INSERT INTO agents (id, name, type, goals, capabilities, seed_version)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                type = excluded.type,
                goals = excluded.goals,
                capabilities = excluded.capabilities,
                seed_version = excluded.seed_version,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                agent["id"],
                agent["name"],
                agent["type"],
                json.dumps(agent["goals"], ensure_ascii=True),
                json.dumps(agent["capabilities"], ensure_ascii=True, sort_keys=True),
                seed_version,
            ),
        )

    for relation in seed_data["relations"]:
        connection.execute(
            """
            INSERT INTO relations (
                source_agent_id,
                target_agent_id,
                friendliness,
                trade_dependency,
                military_tension,
                summary,
                seed_version
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_agent_id, target_agent_id) DO UPDATE SET
                friendliness = excluded.friendliness,
                trade_dependency = excluded.trade_dependency,
                military_tension = excluded.military_tension,
                summary = excluded.summary,
                seed_version = excluded.seed_version,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                relation["source"],
                relation["target"],
                relation["friendliness"],
                relation["trade_dependency"],
                relation["military_tension"],
                relation["summary"],
                seed_version,
            ),
        )

    connection.execute(
        """
        INSERT OR REPLACE INTO app_metadata (key, value)
        VALUES ('seed_version', ?), ('seed_imported_at', CURRENT_TIMESTAMP)
        """,
        (seed_version,),
    )
    return get_seed_status(connection)


def reset_seed_data(settings: Settings | None = None) -> dict[str, Any]:
    with connect(settings) as connection:
        create_schema(connection)
        connection.execute("DELETE FROM relations")
        connection.execute("DELETE FROM agents")
        return import_seed_data(connection)


def get_agents(settings: Settings | None = None) -> list[dict[str, Any]]:
    with connect(settings) as connection:
        rows = connection.execute(
            """
            SELECT id, name, type, goals, capabilities, seed_version, updated_at
            FROM agents
            ORDER BY name
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "type": row["type"],
            "goals": json.loads(row["goals"]),
            "capabilities": json.loads(row["capabilities"]),
            "seed_version": row["seed_version"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def get_world_state(settings: Settings | None = None) -> dict[str, Any]:
    agents = get_agents(settings)
    with connect(settings) as connection:
        rows = connection.execute(
            """
            SELECT
                source_agent_id,
                target_agent_id,
                friendliness,
                trade_dependency,
                military_tension,
                summary,
                seed_version
            FROM relations
            ORDER BY source_agent_id, target_agent_id
            """
        ).fetchall()
        status = get_seed_status(connection)

    edges = [
        {
            "source": row["source_agent_id"],
            "target": row["target_agent_id"],
            "friendliness": row["friendliness"],
            "trade_dependency": row["trade_dependency"],
            "military_tension": row["military_tension"],
            "summary": row["summary"],
            "seed_version": row["seed_version"],
        }
        for row in rows
    ]
    return {"nodes": agents, "edges": edges, "seed_status": status}


def get_seed_status(connection: sqlite3.Connection | None = None) -> dict[str, Any]:
    owns_connection = connection is None
    if connection is None:
        connection = connect()

    try:
        metadata = {
            row["key"]: row["value"]
            for row in connection.execute("SELECT key, value FROM app_metadata").fetchall()
        }
        agent_count = connection.execute("SELECT COUNT(*) AS count FROM agents").fetchone()["count"]
        relation_count = connection.execute("SELECT COUNT(*) AS count FROM relations").fetchone()["count"]
    finally:
        if owns_connection:
            connection.close()

    return {
        "schema_version": metadata.get("schema_version"),
        "seed_version": metadata.get("seed_version"),
        "seed_imported_at": metadata.get("seed_imported_at"),
        "agent_count": agent_count,
        "relation_count": relation_count,
    }


def get_runtime_status(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    sqlite_path = settings.sqlite_path
    database = {
        "url": settings.database_url,
        "sqlite_path": str(sqlite_path) if sqlite_path else None,
        "exists": bool(sqlite_path and sqlite_path.exists()),
        "reachable": False,
    }

    try:
        with connect(settings) as connection:
            create_schema(connection)
            connection.execute("SELECT 1").fetchone()
            seed_status = get_seed_status(connection)
            news_source_count = connection.execute("SELECT COUNT(*) AS count FROM news_sources").fetchone()["count"]
            database["reachable"] = True
    except (RuntimeError, sqlite3.Error) as exc:
        seed_status = {
            "schema_version": None,
            "seed_version": None,
            "seed_imported_at": None,
            "agent_count": 0,
            "relation_count": 0,
        }
        news_source_count = 0
        database["error"] = str(exc)

    checks = {
        "database": database["reachable"],
        "seed_agents": seed_status["agent_count"] == 6,
        "seed_relations": seed_status["relation_count"] > 0,
        "news_sources": news_source_count > 0,
    }

    return {
        "status": "ok" if all(checks.values()) else "degraded",
        "service": "globalsim-api",
        "api": {
            "host": settings.api_host,
            "port": settings.api_port,
        },
        "database": database,
        "seed_status": seed_status,
        "news_sources": {
            "count": news_source_count,
        },
        "llm": LlmAdapter(settings).status().model_dump(),
        "checks": checks,
    }


def get_news_sources(settings: Settings | None = None) -> list[dict[str, Any]]:
    with connect(settings) as connection:
        create_schema(connection)
        return get_news_sources_from_connection(connection)


def get_news_sources_from_connection(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT id, name, url, category, enabled, last_fetched_at, last_fetch_status, last_error
        FROM news_sources
        ORDER BY name
        """
    ).fetchall()
    return [serialize_news_source(row) for row in rows]


def serialize_news_source(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "url": row["url"],
        "category": row["category"],
        "enabled": bool(row["enabled"]),
        "last_fetched_at": row["last_fetched_at"],
        "last_fetch_status": row["last_fetch_status"],
        "last_error": row["last_error"],
    }


def set_news_source_enabled(source_id: str, enabled: bool, settings: Settings | None = None) -> dict[str, Any] | None:
    with connect(settings) as connection:
        create_schema(connection)
        cursor = connection.execute(
            """
            UPDATE news_sources
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (1 if enabled else 0, source_id),
        )
        if cursor.rowcount == 0:
            return None
        row = connection.execute(
            """
            SELECT id, name, url, category, enabled, last_fetched_at, last_fetch_status, last_error
            FROM news_sources
            WHERE id = ?
            """,
            (source_id,),
        ).fetchone()
    return serialize_news_source(row)


def get_news(
    source_id: str | None = None,
    extraction_status: str | None = None,
    since: str | None = None,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if source_id and source_id != "all":
        clauses.append("source_id = ?")
        params.append(source_id)
    if extraction_status and extraction_status != "all":
        clauses.append("extraction_status = ?")
        params.append(extraction_status)
    if since:
        clauses.append("COALESCE(published_at, fetched_at) >= ?")
        params.append(since)

    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with connect(settings) as connection:
        create_schema(connection)
        rows = connection.execute(
            f"""
            SELECT id, source_id, title, source, url, published_at, summary, fetched_at, fingerprint, extraction_status
            FROM news
            {where_clause}
            ORDER BY COALESCE(published_at, fetched_at) DESC, id DESC
            LIMIT 200
            """,
            params,
        ).fetchall()
    return [serialize_news(row) for row in rows]


def serialize_news(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "source_id": row["source_id"],
        "title": row["title"],
        "source": row["source"],
        "url": row["url"],
        "published_at": row["published_at"],
        "summary": row["summary"],
        "fetched_at": row["fetched_at"],
        "fingerprint": row["fingerprint"],
        "extraction_status": row["extraction_status"],
    }


def get_events(settings: Settings | None = None) -> list[dict[str, Any]]:
    with connect(settings) as connection:
        create_schema(connection)
        rows = connection.execute(
            """
            SELECT
                id,
                title,
                actor_agent_id,
                action,
                domain,
                intensity,
                summary,
                occurred_at,
                needs_review,
                source_news_ids,
                targets,
                created_at,
                updated_at
            FROM events
            ORDER BY COALESCE(occurred_at, created_at) DESC, id DESC
            LIMIT 200
            """
        ).fetchall()
    return [serialize_event(row) for row in rows]


def get_event(event_id: int, settings: Settings | None = None) -> dict[str, Any] | None:
    with connect(settings) as connection:
        create_schema(connection)
        row = connection.execute(
            """
            SELECT
                id,
                title,
                actor_agent_id,
                action,
                domain,
                intensity,
                summary,
                occurred_at,
                needs_review,
                source_news_ids,
                targets,
                created_at,
                updated_at
            FROM events
            WHERE id = ?
            """,
            (event_id,),
        ).fetchone()
    return serialize_event(row) if row else None


def update_event(event_id: int, updates: dict[str, Any], settings: Settings | None = None) -> dict[str, Any] | None:
    allowed_fields = {
        "actor": "actor_agent_id",
        "action": "action",
        "domain": "domain",
        "intensity": "intensity",
        "summary": "summary",
        "occurred_at": "occurred_at",
        "needs_review": "needs_review",
    }
    assignments: list[str] = []
    params: list[Any] = []
    if "targets" in updates:
        assignments.append("targets = ?")
        params.append(json.dumps(updates["targets"], ensure_ascii=True))

    for api_field, db_field in allowed_fields.items():
        if api_field not in updates:
            continue
        value = updates[api_field]
        if api_field == "needs_review":
            value = 1 if value else 0
        assignments.append(f"{db_field} = ?")
        params.append(value)

    if not assignments:
        return get_event(event_id, settings)

    params.append(event_id)
    with connect(settings) as connection:
        create_schema(connection)
        cursor = connection.execute(
            f"""
            UPDATE events
            SET {", ".join(assignments)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            params,
        )
        if cursor.rowcount == 0:
            return None
    return get_event(event_id, settings)


def create_simulation(
    event_id: int,
    agent_ids: list[str],
    rounds: int,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    if rounds < 1 or rounds > 5:
        raise ValueError("rounds must be between 1 and 5")

    normalized_agent_ids = list(dict.fromkeys(agent_ids))
    if not normalized_agent_ids:
        raise ValueError("at least one participating agent is required")

    with connect(settings) as connection:
        create_schema(connection)
        event_row = fetch_event_row(connection, event_id)
        if event_row is None:
            return None

        placeholders = ",".join("?" for _ in normalized_agent_ids)
        agent_rows = connection.execute(
            f"""
            SELECT id, name, type, goals, capabilities, seed_version, updated_at
            FROM agents
            WHERE id IN ({placeholders})
            ORDER BY id
            """,
            normalized_agent_ids,
        ).fetchall()
        found_agent_ids = {row["id"] for row in agent_rows}
        missing_agent_ids = [agent_id for agent_id in normalized_agent_ids if agent_id not in found_agent_ids]
        if missing_agent_ids:
            raise ValueError(f"unknown participating agents: {', '.join(missing_agent_ids)}")

        agents_by_id = {row["id"]: serialize_agent(row) for row in agent_rows}
        ordered_agents = [agents_by_id[agent_id] for agent_id in normalized_agent_ids]
        event = serialize_event(event_row)
        adapter = LlmAdapter(settings or get_settings())
        llm_status = adapter.status()
        input_snapshot = {
            "event": event,
            "agents": ordered_agents,
            "rounds": rounds,
            "mode": llm_status.mode,
            "llm_provider": llm_status.provider,
            "llm_model": llm_status.model,
        }
        title = f"{event['title']} - {rounds} round {input_snapshot['mode']} simulation"
        cursor = connection.execute(
            """
            INSERT INTO simulations (title, source_event_id, rounds, status, input_snapshot)
            VALUES (?, ?, ?, 'completed', ?)
            """,
            (title, event_id, rounds, json.dumps(input_snapshot, ensure_ascii=True, sort_keys=True)),
        )
        simulation_id = cursor.lastrowid

        decisions = simulation_decisions(event, ordered_agents, rounds, adapter)
        for decision in decisions:
            connection.execute(
                """
                INSERT INTO simulation_decisions (
                    simulation_id,
                    round,
                    agent_id,
                    perception,
                    goals_considered,
                    options,
                    decision,
                    confidence,
                    citations
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    simulation_id,
                    decision["round"],
                    decision["agent_id"],
                    decision["perception"],
                    json.dumps(decision["goals_considered"], ensure_ascii=True),
                    json.dumps(decision["options"], ensure_ascii=True, sort_keys=True),
                    decision["decision"],
                    decision["confidence"],
                    json.dumps(decision["citations"], ensure_ascii=True, sort_keys=True),
                ),
            )

    return get_simulation(simulation_id, settings)


def get_simulations(settings: Settings | None = None) -> list[dict[str, Any]]:
    with connect(settings) as connection:
        create_schema(connection)
        rows = connection.execute(
            """
            SELECT id, title, source_event_id, rounds, status, input_snapshot, created_at, updated_at
            FROM simulations
            ORDER BY created_at DESC, id DESC
            LIMIT 100
            """
        ).fetchall()
    return [serialize_simulation(row, []) for row in rows]


def get_simulation(simulation_id: int, settings: Settings | None = None) -> dict[str, Any] | None:
    with connect(settings) as connection:
        create_schema(connection)
        simulation_row = connection.execute(
            """
            SELECT id, title, source_event_id, rounds, status, input_snapshot, created_at, updated_at
            FROM simulations
            WHERE id = ?
            """,
            (simulation_id,),
        ).fetchone()
        if simulation_row is None:
            return None

        decision_rows = connection.execute(
            """
            SELECT
                id,
                simulation_id,
                branch_id,
                round,
                agent_id,
                perception,
                goals_considered,
                options,
                decision,
                confidence,
                citations,
                created_at
            FROM simulation_decisions
            WHERE simulation_id = ?
            ORDER BY round, id
            """,
            (simulation_id,),
        ).fetchall()
        branch_rows = connection.execute(
            """
            SELECT id, simulation_id, parent_branch_id, name, from_round, intervention_id, created_at
            FROM branches
            WHERE simulation_id = ?
            ORDER BY created_at, id
            """,
            (simulation_id,),
        ).fetchall()
        intervention_rows = connection.execute(
            """
            SELECT id, simulation_id, branch_id, raw_text, parsed_payload, status, created_at
            FROM interventions
            WHERE simulation_id = ?
            ORDER BY created_at, id
            """,
            (simulation_id,),
        ).fetchall()

    return serialize_simulation(
        simulation_row,
        [serialize_simulation_decision(row) for row in decision_rows],
        [serialize_branch(row) for row in branch_rows],
        [serialize_intervention(row) for row in intervention_rows],
    )


def fetch_event_row(connection: sqlite3.Connection, event_id: int) -> sqlite3.Row | None:
    return connection.execute(
        """
        SELECT
            id,
            title,
            actor_agent_id,
            action,
            domain,
            intensity,
            summary,
            occurred_at,
            needs_review,
            source_news_ids,
            targets,
            created_at,
            updated_at
        FROM events
        WHERE id = ?
        """,
        (event_id,),
    ).fetchone()


def serialize_agent(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "goals": json.loads(row["goals"]),
        "capabilities": json.loads(row["capabilities"]),
        "seed_version": row["seed_version"],
        "updated_at": row["updated_at"],
    }


def serialize_simulation(
    row: sqlite3.Row,
    decisions: list[dict[str, Any]],
    branches: list[dict[str, Any]] | None = None,
    interventions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    snapshot = json.loads(row["input_snapshot"])
    return {
        "id": row["id"],
        "title": row["title"],
        "source_event_id": row["source_event_id"],
        "rounds": row["rounds"],
        "status": row["status"],
        "input_snapshot": snapshot,
        "participant_agent_ids": [agent["id"] for agent in snapshot.get("agents", [])],
        "decisions": decisions,
        "branches": branches or [],
        "interventions": interventions or [],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def serialize_simulation_decision(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "simulation_id": row["simulation_id"],
        "branch_id": row["branch_id"],
        "round": row["round"],
        "agent_id": row["agent_id"],
        "perception": row["perception"],
        "goals_considered": json.loads(row["goals_considered"]),
        "options": json.loads(row["options"]),
        "decision": row["decision"],
        "confidence": row["confidence"],
        "citations": json.loads(row["citations"]),
        "created_at": row["created_at"],
    }


def serialize_branch(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "simulation_id": row["simulation_id"],
        "parent_branch_id": row["parent_branch_id"],
        "name": row["name"],
        "from_round": row["from_round"],
        "intervention_id": row["intervention_id"],
        "created_at": row["created_at"],
    }


def serialize_intervention(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "simulation_id": row["simulation_id"],
        "branch_id": row["branch_id"],
        "raw_text": row["raw_text"],
        "parsed_payload": json.loads(row["parsed_payload"]),
        "status": row["status"],
        "created_at": row["created_at"],
    }


def simulation_decisions(
    event: dict[str, Any],
    agents: list[dict[str, Any]],
    rounds: int,
    adapter: LlmAdapter,
) -> list[dict[str, Any]]:
    decisions = []
    for round_number in range(1, rounds + 1):
        for agent in agents:
            mock_payload = mock_agent_decision(event, agent, round_number)
            decisions.append(
                adapter.create_agent_decision(event, agent, round_number, mock_payload).model_dump()
            )
    return decisions


def parse_intervention(
    simulation_id: int,
    raw_text: str,
    from_round: int | None = None,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    normalized_text = " ".join(raw_text.split())
    if not normalized_text:
        raise ValueError("intervention text is required")

    with connect(settings) as connection:
        create_schema(connection)
        simulation_row = connection.execute(
            """
            SELECT id, title, source_event_id, rounds, status, input_snapshot, created_at, updated_at
            FROM simulations
            WHERE id = ?
            """,
            (simulation_id,),
        ).fetchone()
        if simulation_row is None:
            return None

        snapshot = json.loads(simulation_row["input_snapshot"])
        bounded_from_round = max(0, min(from_round if from_round is not None else simulation_row["rounds"], simulation_row["rounds"]))
        parsed_payload = mock_parse_intervention(normalized_text, snapshot, bounded_from_round)
        cursor = connection.execute(
            """
            INSERT INTO interventions (simulation_id, raw_text, parsed_payload)
            VALUES (?, ?, ?)
            """,
            (simulation_id, normalized_text, json.dumps(parsed_payload, ensure_ascii=True, sort_keys=True)),
        )
        row = connection.execute(
            """
            SELECT id, simulation_id, branch_id, raw_text, parsed_payload, status, created_at
            FROM interventions
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return serialize_intervention(row)


def create_branch_from_intervention(
    simulation_id: int,
    intervention_id: int,
    branch_name: str | None = None,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    with connect(settings) as connection:
        create_schema(connection)
        simulation_row = connection.execute(
            """
            SELECT id, title, source_event_id, rounds, status, input_snapshot, created_at, updated_at
            FROM simulations
            WHERE id = ?
            """,
            (simulation_id,),
        ).fetchone()
        if simulation_row is None:
            return None

        intervention_row = connection.execute(
            """
            SELECT id, simulation_id, branch_id, raw_text, parsed_payload, status, created_at
            FROM interventions
            WHERE id = ? AND simulation_id = ?
            """,
            (intervention_id, simulation_id),
        ).fetchone()
        if intervention_row is None:
            return None
        if intervention_row["status"] == "confirmed" and intervention_row["branch_id"] is not None:
            branch = get_simulation_branch(simulation_id, intervention_row["branch_id"], settings)
            return branch

        snapshot = json.loads(simulation_row["input_snapshot"])
        parsed_payload = json.loads(intervention_row["parsed_payload"])
        from_round = int(parsed_payload.get("from_round", simulation_row["rounds"]))
        name = (branch_name or parsed_payload.get("suggested_branch_name") or f"Branch from intervention {intervention_id}").strip()
        cursor = connection.execute(
            """
            INSERT INTO branches (simulation_id, parent_branch_id, name, from_round, intervention_id)
            VALUES (?, NULL, ?, ?, ?)
            """,
            (simulation_id, name, from_round, intervention_id),
        )
        branch_id = cursor.lastrowid
        connection.execute(
            """
            UPDATE interventions
            SET branch_id = ?, status = 'confirmed'
            WHERE id = ?
            """,
            (branch_id, intervention_id),
        )

        event = dict(snapshot["event"])
        event["summary"] = f"{event['summary']} Intervention assumption: {parsed_payload['assumption']}"
        event["targets"] = parsed_payload.get("targets", event.get("targets", []))
        event["intensity"] = round(max(0.05, min(1.0, event["intensity"] + parsed_payload.get("intensity_delta", 0))), 2)
        agents = snapshot.get("agents", [])
        adapter = LlmAdapter(settings or get_settings())
        decisions = simulation_decisions(event, agents, simulation_row["rounds"], adapter)
        for decision in decisions:
            decision["decision"] = f"[{name}] {decision['decision']}"
            decision["citations"] = [
                *decision["citations"],
                {"type": "intervention", "id": intervention_id, "summary": parsed_payload["assumption"]},
            ]
            connection.execute(
                """
                INSERT INTO simulation_decisions (
                    simulation_id,
                    branch_id,
                    round,
                    agent_id,
                    perception,
                    goals_considered,
                    options,
                    decision,
                    confidence,
                    citations
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    simulation_id,
                    branch_id,
                    decision["round"],
                    decision["agent_id"],
                    decision["perception"],
                    json.dumps(decision["goals_considered"], ensure_ascii=True),
                    json.dumps(decision["options"], ensure_ascii=True, sort_keys=True),
                    decision["decision"],
                    decision["confidence"],
                    json.dumps(decision["citations"], ensure_ascii=True, sort_keys=True),
                ),
            )

    return get_simulation_branch(simulation_id, branch_id, settings)


def get_simulation_branches(simulation_id: int, settings: Settings | None = None) -> dict[str, Any] | None:
    simulation = get_simulation(simulation_id, settings)
    if simulation is None:
        return None
    original_decisions = [decision for decision in simulation["decisions"] if decision["branch_id"] is None]
    return {
        "simulation_id": simulation_id,
        "original": {
            "id": None,
            "name": "原始推演",
            "from_round": 0,
            "decisions": original_decisions,
        },
        "branches": [
            {
                **branch,
                "decisions": [
                    decision for decision in simulation["decisions"] if decision["branch_id"] == branch["id"]
                ],
            }
            for branch in simulation["branches"]
        ],
        "interventions": simulation["interventions"],
    }


def get_simulation_branch(
    simulation_id: int,
    branch_id: int,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    branches_payload = get_simulation_branches(simulation_id, settings)
    if branches_payload is None:
        return None
    for branch in branches_payload["branches"]:
        if branch["id"] == branch_id:
            return branch
    return None


def get_report(simulation_id: int, settings: Settings | None = None) -> dict[str, Any] | None:
    simulation = get_simulation(simulation_id, settings)
    if simulation is None:
        return None

    report_content = build_report_content(simulation, settings)
    markdown = render_report_markdown(report_content)
    with connect(settings) as connection:
        create_schema(connection)
        existing_row = connection.execute(
            """
            SELECT id
            FROM reports
            WHERE simulation_id = ?
            """,
            (simulation_id,),
        ).fetchone()
        if existing_row:
            connection.execute(
                """
                UPDATE reports
                SET title = ?, content = ?, markdown = ?, updated_at = CURRENT_TIMESTAMP
                WHERE simulation_id = ?
                """,
                (
                    report_content["title"],
                    json.dumps(report_content, ensure_ascii=True, sort_keys=True),
                    markdown,
                    simulation_id,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO reports (simulation_id, title, content, markdown)
                VALUES (?, ?, ?, ?)
                """,
                (
                    simulation_id,
                    report_content["title"],
                    json.dumps(report_content, ensure_ascii=True, sort_keys=True),
                    markdown,
                ),
            )
        row = connection.execute(
            """
            SELECT id, simulation_id, title, content, markdown, created_at, updated_at
            FROM reports
            WHERE simulation_id = ?
            """,
            (simulation_id,),
        ).fetchone()

    return serialize_report(row)


def get_report_markdown(simulation_id: int, settings: Settings | None = None) -> dict[str, Any] | None:
    report = get_report(simulation_id, settings)
    if report is None:
        return None
    return {
        "simulation_id": simulation_id,
        "title": report["title"],
        "markdown": report["markdown"],
    }


def serialize_report(row: sqlite3.Row) -> dict[str, Any]:
    content = json.loads(row["content"])
    return {
        "id": row["id"],
        "simulation_id": row["simulation_id"],
        "title": row["title"],
        **content,
        "markdown": row["markdown"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def build_report_content(simulation: dict[str, Any], settings: Settings | None = None) -> dict[str, Any]:
    event = simulation["input_snapshot"].get("event", {})
    original_decisions = [decision for decision in simulation["decisions"] if decision["branch_id"] is None]
    branches_by_id = {branch["id"]: branch["name"] for branch in simulation["branches"]}
    all_decisions = simulation["decisions"]
    source_links = report_source_links(event, all_decisions, settings)
    risks = report_risks(event, all_decisions)
    key_variables = report_key_variables(event, all_decisions, simulation)
    key_judgments = report_key_judgments(event, original_decisions, risks)

    return {
        "simulation_id": simulation["id"],
        "title": f"Research Brief: {event.get('title', simulation['title'])}",
        "event_summary": {
            "title": event.get("title", simulation["title"]),
            "actor": event.get("actor", "unknown"),
            "targets": event.get("targets", []),
            "action": event.get("action", "unknown"),
            "domain": event.get("domain", "unknown"),
            "intensity": event.get("intensity", 0),
            "summary": event.get("summary", "No event summary available."),
            "occurred_at": event.get("occurred_at"),
        },
        "key_judgments": key_judgments,
        "agent_responses": report_agent_responses(original_decisions),
        "timeline": report_timeline(all_decisions, branches_by_id),
        "risks": risks,
        "key_variables": key_variables,
        "source_links": source_links,
        "branch_count": len(simulation["branches"]),
        "generated_mode": simulation["input_snapshot"].get("mode", "mock"),
    }


def report_key_judgments(
    event: dict[str, Any],
    decisions: list[dict[str, Any]],
    risks: list[dict[str, Any]],
) -> list[str]:
    top_decisions = [decision["decision"] for decision in decisions[:3]]
    top_risk = risks[0]
    actor = str(event.get("actor", "unknown")).upper()
    domain = event.get("domain", "unknown")
    return [
        f"{actor} remains the initiating actor in the {domain} track, with responses shaped by the event intensity.",
        f"The leading risk is {top_risk['name']} at {top_risk['probability']}% with {top_risk['uncertainty']} uncertainty.",
        "Initial agent responses converge on " + "; ".join(top_decisions) if top_decisions else "No agent responses were recorded.",
    ]


def report_agent_responses(decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest_by_agent: dict[str, dict[str, Any]] = {}
    for decision in decisions:
        latest_by_agent[decision["agent_id"]] = decision
    return [
        {
            "agent_id": agent_id,
            "latest_round": decision["round"],
            "decision": decision["decision"],
            "confidence": decision["confidence"],
            "goals_considered": decision["goals_considered"],
        }
        for agent_id, decision in sorted(latest_by_agent.items())
    ]


def report_timeline(
    decisions: list[dict[str, Any]],
    branches_by_id: dict[int, str],
) -> list[dict[str, Any]]:
    return [
        {
            "round": decision["round"],
            "agent_id": decision["agent_id"],
            "branch": branches_by_id.get(decision["branch_id"], "原始推演") if decision["branch_id"] else "原始推演",
            "perception": decision["perception"],
            "decision": decision["decision"],
            "confidence": decision["confidence"],
        }
        for decision in decisions
    ]


def report_risks(event: dict[str, Any], decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    intensity = float(event.get("intensity", 0) or 0)
    confidence_values = [float(decision.get("confidence", 0)) for decision in decisions]
    average_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0.5
    uncertainty = "High" if average_confidence < 0.65 else "Medium" if average_confidence < 0.8 else "Low"
    escalation_probability = bounded_percentage(28 + intensity * 52)
    alignment_probability = bounded_percentage(24 + len({decision["agent_id"] for decision in decisions}) * 6 + intensity * 18)
    information_probability = bounded_percentage(18 + (1 - average_confidence) * 48)
    return [
        {
            "name": "Escalation persistence",
            "level": risk_level(escalation_probability),
            "probability": escalation_probability,
            "uncertainty": uncertainty,
            "rationale": "Driven by event intensity and the persistence of multi-round agent responses.",
        },
        {
            "name": "Coalition alignment stress",
            "level": risk_level(alignment_probability),
            "probability": alignment_probability,
            "uncertainty": "Medium" if len(decisions) >= 3 else "High",
            "rationale": "Estimated from participant count and the spread of agent decisions.",
        },
        {
            "name": "Information ambiguity",
            "level": risk_level(information_probability),
            "probability": information_probability,
            "uncertainty": uncertainty,
            "rationale": "Higher when decision confidence is lower or source context is thin.",
        },
    ]


def report_key_variables(
    event: dict[str, Any],
    decisions: list[dict[str, Any]],
    simulation: dict[str, Any],
) -> list[dict[str, Any]]:
    unique_agents = sorted({decision["agent_id"] for decision in decisions})
    average_confidence = (
        sum(float(decision["confidence"]) for decision in decisions) / len(decisions)
        if decisions
        else 0
    )
    return [
        {
            "name": "Event intensity",
            "value": f"{float(event.get('intensity', 0) or 0):.2f}",
            "assessment": "High leverage" if float(event.get("intensity", 0) or 0) >= 0.65 else "Moderate leverage",
        },
        {
            "name": "Participating agents",
            "value": str(len(unique_agents)),
            "assessment": ", ".join(unique_agents) if unique_agents else "none",
        },
        {
            "name": "Branch pressure",
            "value": str(len(simulation["branches"])),
            "assessment": "Scenario divergence present" if simulation["branches"] else "Original path only",
        },
        {
            "name": "Mean confidence",
            "value": f"{average_confidence:.2f}",
            "assessment": "Low uncertainty" if average_confidence >= 0.8 else "Review advised",
        },
    ]


def report_source_links(
    event: dict[str, Any],
    decisions: list[dict[str, Any]],
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    news_ids = set(int(news_id) for news_id in event.get("source_news_ids", []) if str(news_id).isdigit())
    for decision in decisions:
        for citation in decision.get("citations", []):
            if citation.get("type") == "news":
                for news_id in citation.get("ids", []):
                    if str(news_id).isdigit():
                        news_ids.add(int(news_id))

    links: list[dict[str, Any]] = []
    if news_ids:
        placeholders = ",".join("?" for _ in news_ids)
        with connect(settings) as connection:
            create_schema(connection)
            rows = connection.execute(
                f"""
                SELECT id, title, source, url
                FROM news
                WHERE id IN ({placeholders})
                ORDER BY id
                """,
                sorted(news_ids),
            ).fetchall()
        links.extend(
            {
                "type": "news",
                "id": row["id"],
                "title": row["title"],
                "source": row["source"],
                "url": row["url"],
            }
            for row in rows
        )

    if not links and event.get("title"):
        links.append(
            {
                "type": "event",
                "id": event.get("id"),
                "title": event.get("title"),
                "source": "simulation event snapshot",
                "url": None,
            }
        )
    return links


def bounded_percentage(value: float) -> int:
    return int(round(max(5, min(95, value))))


def risk_level(probability: int) -> str:
    if probability >= 65:
        return "High"
    if probability >= 40:
        return "Medium"
    return "Low"


def render_report_markdown(report: dict[str, Any]) -> str:
    event = report["event_summary"]
    lines = [
        f"# {report['title']}",
        "",
        "## Event Summary",
        "",
        f"- Actor: {event['actor']}",
        f"- Targets: {', '.join(event['targets']) if event['targets'] else 'none'}",
        f"- Action: {event['action']}",
        f"- Domain: {event['domain']}",
        f"- Intensity: {float(event['intensity']):.2f}",
        f"- Summary: {event['summary']}",
        "",
        "## Key Judgments",
        "",
    ]
    lines.extend(f"- {judgment}" for judgment in report["key_judgments"])
    lines.extend(["", "## Agent Responses", ""])
    lines.extend(
        f"- {response['agent_id'].upper()} round {response['latest_round']}: {response['decision']} "
        f"(confidence {response['confidence']:.2f})"
        for response in report["agent_responses"]
    )
    lines.extend(["", "## Timeline", ""])
    lines.extend(
        f"- Round {item['round']} / {item['branch']} / {item['agent_id'].upper()}: {item['decision']}"
        for item in report["timeline"]
    )
    lines.extend(["", "## Risk Analysis", ""])
    lines.extend(
        f"- {risk['name']}: {risk['level']}, {risk['probability']}%, uncertainty {risk['uncertainty']}. {risk['rationale']}"
        for risk in report["risks"]
    )
    lines.extend(["", "## Key Variables", ""])
    lines.extend(
        f"- {variable['name']}: {variable['value']} - {variable['assessment']}"
        for variable in report["key_variables"]
    )
    lines.extend(["", "## Sources", ""])
    lines.extend(
        f"- [{source['title']}]({source['url']}) - {source['source']}"
        if source.get("url")
        else f"- {source['title']} - {source['source']}"
        for source in report["source_links"]
    )
    return "\n".join(lines).strip() + "\n"


def mock_parse_intervention(raw_text: str, snapshot: dict[str, Any], from_round: int) -> dict[str, Any]:
    lowered = raw_text.casefold()
    agent_aliases = {
        "eu": ["欧盟", "european union", " eu "],
        "usa": ["美国", "usa", "united states"],
        "china": ["中国", "china"],
        "russia": ["俄罗斯", "russia"],
        "nato": ["北约", "nato"],
        "un": ["联合国", "united nations", " un "],
    }
    actors = [
        agent_id
        for agent_id, aliases in agent_aliases.items()
        if any(alias in f" {lowered} " for alias in aliases)
    ]
    policy_shift = "refrain_from_sanctions" if "不跟进制裁" in raw_text or "not follow sanctions" in lowered else "changed_position"
    domain = "economic" if "制裁" in raw_text or "sanction" in lowered else snapshot.get("event", {}).get("domain", "diplomacy")
    action = "reduce_escalation" if "不" in raw_text or "not " in lowered else "increase_pressure"
    targets = actors or [snapshot.get("event", {}).get("actor", "un")]
    branch_name_actor = actors[0].upper() if actors else "Assumption"
    return {
        "assumption": raw_text,
        "actors": actors,
        "targets": targets,
        "domain": domain,
        "policy_shift": policy_shift,
        "action": action,
        "from_round": from_round,
        "intensity_delta": -0.12 if action == "reduce_escalation" else 0.12,
        "expected_effect": "reduces alignment pressure and opens a lower-escalation branch",
        "suggested_branch_name": f"{branch_name_actor} intervention branch",
        "requires_confirmation": True,
    }


def mock_simulation_decisions(event: dict[str, Any], agents: list[dict[str, Any]], rounds: int) -> list[dict[str, Any]]:
    decisions = []
    for round_number in range(1, rounds + 1):
        for agent in agents:
            decisions.append(mock_agent_decision(event, agent, round_number))
    return decisions


def mock_agent_decision(event: dict[str, Any], agent: dict[str, Any], round_number: int) -> dict[str, Any]:
    stance = agent_stance(agent["id"], event)
    domain = event["domain"]
    primary_goal = agent["goals"][0] if agent["goals"] else "stability"
    secondary_goal = agent["goals"][round_number % len(agent["goals"])] if agent["goals"] else primary_goal
    options = [
        {
            "action": f"{stance}_signal",
            "score": round(min(0.95, 0.46 + event["intensity"] * 0.28 + round_number * 0.04), 2),
            "rationale": f"Aligns {agent['name']} with {primary_goal} in the {domain} track.",
        },
        {
            "action": "de_escalate_contact",
            "score": round(max(0.15, 0.68 - event["intensity"] * 0.18 + round_number * 0.02), 2),
            "rationale": "Keeps diplomatic optionality open while monitoring counterparts.",
        },
        {
            "action": "hold_position",
            "score": round(max(0.1, 0.52 - round_number * 0.03), 2),
            "rationale": "Preserves resources until more information arrives.",
        },
    ]
    selected = max(options, key=lambda option: option["score"])
    confidence = round(min(0.94, 0.55 + event["intensity"] * 0.2 + round_number * 0.04), 2)
    return {
        "round": round_number,
        "agent_id": agent["id"],
        "perception": (
            f"Round {round_number}: {agent['name']} reads {event['actor']} {event['action']} "
            f"as a {domain} signal with intensity {event['intensity']:.2f}."
        ),
        "goals_considered": [primary_goal, secondary_goal],
        "options": options,
        "decision": f"{agent['name']} chooses {selected['action']} and references {event['title']}.",
        "confidence": confidence,
        "citations": [
            {
                "type": "event",
                "id": event["id"],
                "title": event["title"],
            },
            {
                "type": "news",
                "ids": event["source_news_ids"],
            },
        ],
    }


def agent_stance(agent_id: str, event: dict[str, Any]) -> str:
    if agent_id == event["actor"]:
        return "reinforce"
    if agent_id in event["targets"]:
        return "contest"
    if agent_id in {"un", "eu"}:
        return "mediate"
    if event["domain"] == "security" and agent_id == "nato":
        return "deterrence"
    return "monitor"


def extract_events_from_news(news_ids: list[int], settings: Settings | None = None) -> dict[str, Any]:
    if not news_ids:
        return {"created": 0, "events": [], "news": get_news(settings=settings)}

    with connect(settings) as connection:
        create_schema(connection)
        placeholders = ",".join("?" for _ in news_ids)
        news_rows = connection.execute(
            f"""
            SELECT id, source_id, title, source, url, published_at, summary, fetched_at, fingerprint, extraction_status
            FROM news
            WHERE id IN ({placeholders})
            ORDER BY id
            """,
            news_ids,
        ).fetchall()

        adapter = LlmAdapter(settings or get_settings())
        events = []
        for news_row in news_rows:
            event_payload = adapter.extract_event(news_row, mock_extract_event(news_row)).model_dump()
            cursor = connection.execute(
                """
                INSERT INTO events (
                    title,
                    actor_agent_id,
                    action,
                    domain,
                    intensity,
                    summary,
                    occurred_at,
                    needs_review,
                    source_news_ids,
                    targets
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_payload["title"],
                    event_payload["actor"],
                    event_payload["action"],
                    event_payload["domain"],
                    event_payload["intensity"],
                    event_payload["summary"],
                    event_payload["occurred_at"],
                    1 if event_payload["needs_review"] else 0,
                    json.dumps([news_row["id"]], ensure_ascii=True),
                    json.dumps(event_payload["targets"], ensure_ascii=True),
                ),
            )
            status = "needs_review" if event_payload["needs_review"] else "extracted"
            connection.execute(
                """
                UPDATE news
                SET extraction_status = ?
                WHERE id = ?
                """,
                (status, news_row["id"]),
            )
            event_row = connection.execute(
                """
                SELECT
                    id,
                    title,
                    actor_agent_id,
                    action,
                    domain,
                    intensity,
                    summary,
                    occurred_at,
                    needs_review,
                    source_news_ids,
                    targets,
                    created_at,
                    updated_at
                FROM events
                WHERE id = ?
                """,
                (cursor.lastrowid,),
            ).fetchone()
            events.append(serialize_event(event_row))

    return {"created": len(events), "events": events, "news": get_news(settings=settings)}


def mock_extract_event(news_row: sqlite3.Row) -> dict[str, Any]:
    text = " ".join(
        value
        for value in [news_row["title"], news_row["summary"], news_row["source"]]
        if value
    ).casefold()
    actor = detect_agent(text)
    targets = [agent_id for agent_id in detect_agents(text) if agent_id != actor]
    action = detect_action(text)
    domain = detect_domain(text)
    needs_review = actor is None or action == "needs_review"
    if actor is None:
        actor = "un"

    summary = news_row["summary"] or news_row["title"]
    if needs_review:
        summary = f"Needs review: {summary}"

    return {
        "title": news_row["title"],
        "actor": actor,
        "targets": targets,
        "action": action,
        "domain": domain,
        "intensity": detect_intensity(text, needs_review),
        "summary": summary,
        "occurred_at": news_row["published_at"] or news_row["fetched_at"],
        "needs_review": needs_review,
    }


def detect_agents(text: str) -> list[str]:
    aliases = {
        "usa": ["usa", "u.s.", "us ", "united states", "white house", "washington"],
        "china": ["china", "chinese", "beijing"],
        "russia": ["russia", "russian", "moscow"],
        "eu": ["european union", " eu ", "brussels"],
        "nato": ["nato"],
        "un": ["united nations", " u.n.", " un ", "security council"],
    }
    detected = []
    padded_text = f" {text} "
    for agent_id, keywords in aliases.items():
        if any(keyword in padded_text for keyword in keywords):
            detected.append(agent_id)
    return detected


def detect_agent(text: str) -> str | None:
    agents = detect_agents(text)
    return agents[0] if agents else None


def detect_action(text: str) -> str:
    actions = [
        ("sanction", "sanctions"),
        ("condemn", "condemnation"),
        ("negotiate", "negotiation"),
        ("deploy", "deployment"),
        ("attack", "attack"),
        ("announce", "announcement"),
        ("warn", "warning"),
        ("meet", "meeting"),
    ]
    for keyword, action in actions:
        if keyword in text:
            return action
    return "needs_review"


def detect_domain(text: str) -> str:
    if any(keyword in text for keyword in ["military", "deploy", "attack", "missile", "nato"]):
        return "security"
    if any(keyword in text for keyword in ["sanction", "trade", "export", "market", "energy"]):
        return "economic"
    if any(keyword in text for keyword in ["climate", "health", "aid", "humanitarian"]):
        return "humanitarian"
    return "diplomacy"


def detect_intensity(text: str, needs_review: bool) -> float:
    if needs_review:
        return 0.3
    if any(keyword in text for keyword in ["attack", "invasion", "missile", "war"]):
        return 0.85
    if any(keyword in text for keyword in ["sanction", "deploy", "warning"]):
        return 0.68
    if any(keyword in text for keyword in ["meet", "talk", "statement"]):
        return 0.42
    return 0.5


def serialize_event(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "actor": row["actor_agent_id"],
        "targets": json.loads(row["targets"]),
        "action": row["action"],
        "domain": row["domain"],
        "intensity": row["intensity"],
        "summary": row["summary"],
        "occurred_at": row["occurred_at"],
        "needs_review": bool(row["needs_review"]),
        "source_news_ids": json.loads(row["source_news_ids"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def fetch_news(settings: Settings | None = None, client: httpx.Client | None = None) -> dict[str, Any]:
    with connect(settings) as connection:
        create_schema(connection)
        sources = connection.execute(
            """
            SELECT id, name, url, category, enabled, last_fetched_at, last_fetch_status, last_error
            FROM news_sources
            WHERE enabled = 1
            ORDER BY name
            """
        ).fetchall()

    source_results = []
    inserted_total = 0
    duplicate_total = 0
    owns_client = client is None
    client = client or httpx.Client(timeout=12.0, follow_redirects=True)
    try:
        for source in sources:
            result = fetch_single_news_source(source, client, settings)
            source_results.append(result)
            inserted_total += result["inserted"]
            duplicate_total += result["duplicates"]
    finally:
        if owns_client:
            client.close()

    return {
        "sources_checked": len(sources),
        "inserted": inserted_total,
        "duplicates": duplicate_total,
        "results": source_results,
        "news": get_news(settings=settings),
    }


def fetch_single_news_source(
    source: sqlite3.Row,
    client: httpx.Client,
    settings: Settings | None = None,
) -> dict[str, Any]:
    fetched_at = utc_now()
    try:
        response = client.get(source["url"])
        response.raise_for_status()
        entries = parse_rss_entries(response.text)
        inserted, duplicates = save_news_entries(source, entries, fetched_at, settings)
        status = "ok"
        error = None
    except Exception as exc:
        inserted = 0
        duplicates = 0
        status = "error"
        error = str(exc)[:500]

    with connect(settings) as connection:
        connection.execute(
            """
            UPDATE news_sources
            SET last_fetched_at = ?, last_fetch_status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (fetched_at, status, error, source["id"]),
        )

    return {
        "source_id": source["id"],
        "source": source["name"],
        "status": status,
        "inserted": inserted,
        "duplicates": duplicates,
        "error": error,
    }


def parse_rss_entries(feed_xml: str) -> list[dict[str, str | None]]:
    root = ElementTree.fromstring(feed_xml)
    entries = []
    for item in root.findall(".//item"):
        title = text_from_xml(item, "title")
        url = text_from_xml(item, "link") or text_from_xml(item, "guid")
        if not title or not url:
            continue
        entries.append(
            {
                "title": title,
                "url": url,
                "published_at": normalize_datetime(
                    text_from_xml(item, "pubDate") or text_from_xml(item, "published")
                ),
                "summary": text_from_xml(item, "description"),
            }
        )

    for entry in root.findall(".//{http://www.w3.org/2005/Atom}entry"):
        title = text_from_xml(entry, "{http://www.w3.org/2005/Atom}title")
        url = atom_link(entry)
        if not title or not url:
            continue
        entries.append(
            {
                "title": title,
                "url": url,
                "published_at": normalize_datetime(text_from_xml(entry, "{http://www.w3.org/2005/Atom}updated")),
                "summary": text_from_xml(entry, "{http://www.w3.org/2005/Atom}summary"),
            }
        )
    return entries


def text_from_xml(element: ElementTree.Element, tag: str) -> str | None:
    child = element.find(tag)
    if child is None or child.text is None:
        return None
    text = child.text.strip()
    return text or None


def atom_link(entry: ElementTree.Element) -> str | None:
    for link in entry.findall("{http://www.w3.org/2005/Atom}link"):
        href = link.attrib.get("href")
        if href and link.attrib.get("rel", "alternate") == "alternate":
            return href
    return None


def normalize_datetime(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def save_news_entries(
    source: sqlite3.Row,
    entries: list[dict[str, str | None]],
    fetched_at: str,
    settings: Settings | None = None,
) -> tuple[int, int]:
    inserted = 0
    duplicates = 0
    with connect(settings) as connection:
        for entry in entries:
            fingerprint = news_fingerprint(entry["url"], entry["title"])
            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO news (
                    source_id, title, source, url, published_at, summary, fetched_at, fingerprint, extraction_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    source["id"],
                    entry["title"],
                    source["name"],
                    entry["url"],
                    entry["published_at"],
                    entry["summary"],
                    fetched_at,
                    fingerprint,
                ),
            )
            if cursor.rowcount:
                inserted += 1
            else:
                duplicates += 1
    return inserted, duplicates


def news_fingerprint(url: str | None, title: str | None) -> str:
    canonical_url = canonicalize_url(url or "")
    if canonical_url:
        return canonical_url
    return "title:" + " ".join((title or "").casefold().split())


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.netloc:
        return url.strip().casefold()
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.scheme.casefold()}://{parsed.netloc.casefold()}{path}"


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
