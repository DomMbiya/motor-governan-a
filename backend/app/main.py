"""Ponto de entrada da API do Motor Determinístico Focado em Governança."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.deps import Container
from app.api.routes import router
from app.config import Settings, get_settings
from app.domain.errors import DomainError
from app.logging_config import RequestContextMiddleware, configure_logging
from app.persistence.db import Database
from app.rules.loader import RulesRepository
from app.services.analysis_service import AnalysisService

log = logging.getLogger("app")

FIELD_LABELS = {
    "analyst_name": "Nome do analista",
    "project_name": "Nome do projeto",
    "area": "Área responsável",
    "lgpd_acknowledged": "Ciência sobre dados pessoais",
    "decision": "Parecer",
    "acknowledged": "Confirmação de responsabilidade",
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    db = Database(settings.db_path)
    rules = RulesRepository(settings.rules_dir, db, settings.active_rules_version)
    analyses = AnalysisService(settings, db, rules)

    app = FastAPI(
        title="Motor Determinístico Focado em Governança",
        description="Apoio à decisão para análise preliminar de enquadramento na Lei do Bem. O processo é determinístico; a decisão é humana.",
        version="1.0.0",
    )
    app.state.container = Container(rules=rules, analyses=analyses)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["*"],
        expose_headers=["x-request-id", "X-Content-SHA256", "X-PDF-SHA256", "Content-Disposition"],
    )

    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        level = logging.ERROR if exc.status >= 500 else logging.INFO
        log.log(level, "domain_error", extra={"ctx": {"code": exc.code, "status": exc.status}})
        return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}})

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = []
        for e in exc.errors():
            loc = [str(p) for p in e["loc"] if p not in ("body",)]
            field = loc[-1] if loc else ""
            msg = str(e["msg"]).removeprefix("Value error, ")
            details.append({"field": field, "label": FIELD_LABELS.get(field, field), "message": msg})
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "invalid_input", "message": "Alguns campos precisam de correção.", "details": details}},
        )

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unexpected_error")
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Erro inesperado no servidor. O ocorrido foi registrado nos logs.", "details": None}},
        )

    app.include_router(router)
    return app


app = create_app()
