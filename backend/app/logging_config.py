"""Logs estruturados em JSON, sem conteúdo de documentos nem de respostas.

O que entra no log: rota, status, duração, ids e códigos de erro.
O que nunca entra: texto do projeto, evidências, justificativas (sigilo e LGPD).
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        extra = getattr(record, "ctx", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    for noisy in ("uvicorn.access",):
        logging.getLogger(noisy).disabled = True


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(rid)
        start = time.perf_counter()
        logger = logging.getLogger("http")
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("request.failed", extra={"ctx": {"method": request.method, "path": request.url.path}})
            raise
        finally:
            request_id_var.reset(token)
        duration = round((time.perf_counter() - start) * 1000, 1)
        response.headers["x-request-id"] = rid
        logger.info(
            "request",
            extra={"ctx": {"method": request.method, "path": request.url.path, "status": response.status_code, "ms": duration, "request_id": rid}},
        )
        return response
