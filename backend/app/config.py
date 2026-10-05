"""Configuração por variáveis de ambiente. Nenhum valor aponta para fora da máquina."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    rules_dir: Path
    active_rules_version: str | None
    max_upload_mb: int
    timezone: str
    log_level: str
    allowed_origins: tuple[str, ...]

    @property
    def db_path(self) -> Path:
        return self.data_dir / "motor.db"

    @property
    def analyses_dir(self) -> Path:
        return self.data_dir / "analises"


@lru_cache
def get_settings() -> Settings:
    base = Path(__file__).resolve().parent.parent
    origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    return Settings(
        data_dir=Path(os.getenv("DATA_DIR", base / "data")),
        rules_dir=Path(os.getenv("RULES_DIR", base / "rules")),
        active_rules_version=os.getenv("RULES_ACTIVE_VERSION") or None,
        max_upload_mb=int(os.getenv("MAX_UPLOAD_MB", "25")),
        timezone=os.getenv("APP_TIMEZONE", "America/Fortaleza"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        allowed_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
    )
