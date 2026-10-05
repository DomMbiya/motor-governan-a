"""Relógio único da aplicação: grava em UTC, exibe no fuso configurado."""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo


def now_utc() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def display(value: str, tz: str) -> str:
    return parse(value).astimezone(ZoneInfo(tz)).strftime("%d/%m/%Y às %H:%M:%S")
