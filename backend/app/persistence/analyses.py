"""Repositório de análises (SQLite + arquivos locais por análise)."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any

from app.domain.errors import NotFound
from app.domain.models import AnalysisData, DocumentInfo, Opinion


@dataclass
class AnalysisRecord:
    id: str
    created_at: str
    updated_at: str
    status: str
    analyst_name: str
    project_name: str
    area: str
    rules_version: str
    rules_checksum: str
    document: DocumentInfo | None
    data: AnalysisData
    opinion: Opinion | None
    result: dict[str, Any] | None
    content_hash: str | None
    pdf_sha256: str | None
    audit_seq: int | None
    finalized_at: str | None

    @property
    def finalized(self) -> bool:
        return self.status == "finalized"


def _from_row(r: sqlite3.Row) -> AnalysisRecord:
    return AnalysisRecord(
        id=r["id"],
        created_at=r["created_at"],
        updated_at=r["updated_at"],
        status=r["status"],
        analyst_name=r["analyst_name"],
        project_name=r["project_name"],
        area=r["area"],
        rules_version=r["rules_version"],
        rules_checksum=r["rules_checksum"],
        document=DocumentInfo.model_validate_json(r["document_json"]) if r["document_json"] else None,
        data=AnalysisData.model_validate_json(r["data_json"]),
        opinion=Opinion.model_validate_json(r["opinion_json"]) if r["opinion_json"] else None,
        result=json.loads(r["result_json"]) if r["result_json"] else None,
        content_hash=r["content_hash"],
        pdf_sha256=r["pdf_sha256"],
        audit_seq=r["audit_seq"],
        finalized_at=r["finalized_at"],
    )


def insert(conn: sqlite3.Connection, rec: AnalysisRecord) -> None:
    conn.execute(
        """INSERT INTO analyses (id, created_at, updated_at, status, analyst_name, project_name, area,
               rules_version, rules_checksum, document_json, data_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            rec.id,
            rec.created_at,
            rec.updated_at,
            rec.status,
            rec.analyst_name,
            rec.project_name,
            rec.area,
            rec.rules_version,
            rec.rules_checksum,
            rec.document.model_dump_json() if rec.document else None,
            rec.data.model_dump_json(),
        ),
    )


def get(conn: sqlite3.Connection, analysis_id: str) -> AnalysisRecord:
    row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if row is None:
        raise NotFound("Análise não encontrada.")
    return _from_row(row)


def list_all(conn: sqlite3.Connection) -> list[AnalysisRecord]:
    return [_from_row(r) for r in conn.execute("SELECT * FROM analyses ORDER BY created_at DESC")]


def update_draft(conn: sqlite3.Connection, rec: AnalysisRecord) -> None:
    conn.execute(
        "UPDATE analyses SET updated_at = ?, document_json = ?, data_json = ? WHERE id = ? AND status = 'draft'",
        (rec.updated_at, rec.document.model_dump_json() if rec.document else None, rec.data.model_dump_json(), rec.id),
    )


def finalize(conn: sqlite3.Connection, rec: AnalysisRecord) -> None:
    assert rec.opinion is not None and rec.result is not None
    conn.execute(
        """UPDATE analyses SET status = 'finalized', updated_at = ?, data_json = ?, opinion_json = ?, result_json = ?,
               content_hash = ?, pdf_sha256 = ?, audit_seq = ?, finalized_at = ?
           WHERE id = ? AND status = 'draft'""",
        (
            rec.updated_at,
            rec.data.model_dump_json(),
            rec.opinion.model_dump_json(),
            json.dumps(rec.result, ensure_ascii=False),
            rec.content_hash,
            rec.pdf_sha256,
            rec.audit_seq,
            rec.finalized_at,
            rec.id,
        ),
    )
