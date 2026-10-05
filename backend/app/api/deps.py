"""Injeção de dependências: uma instância de cada serviço por processo."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from app.rules.loader import RulesRepository
from app.services.analysis_service import AnalysisService


@dataclass(frozen=True)
class Container:
    rules: RulesRepository
    analyses: AnalysisService


def container(request: Request) -> Container:
    return request.app.state.container
