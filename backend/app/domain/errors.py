"""Erros de domínio com código estável, status HTTP e mensagem para o analista."""

from __future__ import annotations

from typing import Any


class DomainError(Exception):
    code = "domain_error"
    status = 400

    def __init__(self, message: str, *, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class NotFound(DomainError):
    code = "not_found"
    status = 404


class InvalidInput(DomainError):
    code = "invalid_input"
    status = 422


class Conflict(DomainError):
    code = "conflict"
    status = 409


class AnalysisLocked(Conflict):
    code = "analysis_locked"


class ValidationBlocked(DomainError):
    """A esteira recusou a operação porque há pendências obrigatórias."""

    code = "validation_blocked"
    status = 422


class UnsupportedDocument(DomainError):
    code = "unsupported_document"
    status = 415


class RulesError(DomainError):
    code = "rules_error"
    status = 500
