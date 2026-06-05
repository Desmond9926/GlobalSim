from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/globalsim.sqlite3"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    llm_provider: str = "mock"
    llm_base_url: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def sqlite_path(self) -> Path | None:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            return None
        return Path(self.database_url.removeprefix(prefix))

    @property
    def normalized_llm_provider(self) -> str:
        provider = self.llm_provider.casefold().strip()
        if provider in {"openai", "deepseek"}:
            return provider
        return "mock"

    @property
    def effective_llm_base_url(self) -> str | None:
        if self.llm_base_url:
            return self.llm_base_url.rstrip("/")
        if self.normalized_llm_provider == "openai":
            return "https://api.openai.com/v1"
        if self.normalized_llm_provider == "deepseek":
            return "https://api.deepseek.com/v1"
        return None

    @property
    def is_llm_configured(self) -> bool:
        if self.normalized_llm_provider == "mock":
            return False
        return bool(self.llm_api_key and self.llm_model and self.effective_llm_base_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
