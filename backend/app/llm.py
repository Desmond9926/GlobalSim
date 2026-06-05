import json
import sqlite3
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field, ValidationError

from backend.app.config import Settings


class EventExtractionPayload(BaseModel):
    title: str
    actor: str
    targets: list[str] = Field(default_factory=list)
    action: str
    domain: str
    intensity: float = Field(ge=0, le=1)
    summary: str
    occurred_at: str | None = None
    needs_review: bool = False


class DecisionOptionPayload(BaseModel):
    action: str
    score: float = Field(ge=0, le=1)
    rationale: str


class AgentDecisionPayload(BaseModel):
    round: int = Field(ge=1, le=5)
    agent_id: str
    perception: str
    goals_considered: list[str]
    options: list[DecisionOptionPayload]
    decision: str
    confidence: float = Field(ge=0, le=1)
    citations: list[dict[str, Any]] = Field(default_factory=list)


class LlmStatus(BaseModel):
    provider: Literal["mock", "openai", "deepseek"]
    mode: Literal["mock", "llm"]
    configured: bool
    model: str | None
    base_url: str | None
    has_api_key: bool


class LlmAdapter:
    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self.settings = settings
        self.provider = settings.normalized_llm_provider
        self.client = client

    def status(self) -> LlmStatus:
        return LlmStatus(
            provider=self.provider,  # type: ignore[arg-type]
            mode="llm" if self.settings.is_llm_configured else "mock",
            configured=self.settings.is_llm_configured,
            model=self.settings.llm_model,
            base_url=self.settings.effective_llm_base_url,
            has_api_key=bool(self.settings.llm_api_key),
        )

    def extract_event(
        self,
        news_row: sqlite3.Row,
        mock_payload: dict[str, Any],
    ) -> EventExtractionPayload:
        if not self.settings.is_llm_configured:
            return EventExtractionPayload.model_validate(mock_payload)

        messages = [
            {
                "role": "system",
                "content": (
                    "Extract one geopolitical event as strict JSON with keys: title, actor, targets, "
                    "action, domain, intensity, summary, occurred_at, needs_review. Use actor/targets "
                    "agent ids from china, usa, russia, eu, nato, un. intensity must be 0..1."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "title": news_row["title"],
                        "source": news_row["source"],
                        "summary": news_row["summary"],
                        "published_at": news_row["published_at"],
                        "url": news_row["url"],
                    },
                    ensure_ascii=True,
                ),
            },
        ]
        try:
            payload = self._chat_json(messages)
            return EventExtractionPayload.model_validate(payload)
        except (httpx.HTTPError, KeyError, TypeError, ValueError, ValidationError):
            fallback = dict(mock_payload)
            fallback["needs_review"] = True
            fallback["summary"] = f"LLM extraction failed; review mock fallback: {fallback['summary']}"
            return EventExtractionPayload.model_validate(fallback)

    def create_agent_decision(
        self,
        event: dict[str, Any],
        agent: dict[str, Any],
        round_number: int,
        mock_payload: dict[str, Any],
    ) -> AgentDecisionPayload:
        if not self.settings.is_llm_configured:
            return AgentDecisionPayload.model_validate(mock_payload)

        messages = [
            {
                "role": "system",
                "content": (
                    "Generate one geopolitical agent decision as strict JSON with keys: round, agent_id, "
                    "perception, goals_considered, options, decision, confidence, citations. options must "
                    "contain action, score, rationale. confidence and scores must be 0..1."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "event": event,
                        "agent": agent,
                        "round": round_number,
                    },
                    ensure_ascii=True,
                    sort_keys=True,
                ),
            },
        ]
        try:
            payload = self._chat_json(messages)
            payload["round"] = round_number
            payload["agent_id"] = agent["id"]
            return AgentDecisionPayload.model_validate(payload)
        except (httpx.HTTPError, KeyError, TypeError, ValueError, ValidationError):
            return AgentDecisionPayload.model_validate(mock_payload)

    def _chat_json(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        owns_client = self.client is None
        client = self.client or httpx.Client(timeout=30.0)
        try:
            response = client.post(
                f"{self.settings.effective_llm_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
                json={
                    "model": self.settings.llm_model,
                    "messages": messages,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        finally:
            if owns_client:
                client.close()


def get_llm_status(settings: Settings) -> dict[str, Any]:
    return LlmAdapter(settings).status().model_dump()
