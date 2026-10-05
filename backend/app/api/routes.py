"""Rotas HTTP. Finas por design: validam a entrada e delegam ao serviço."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, UploadFile
from fastapi.responses import FileResponse, Response

from app.api.deps import Container, container
from app.audit import repository as audit
from app.domain.errors import InvalidInput
from app.domain.models import AnalysisCreate, OpinionInput
from app.reader.text import strip_accents

router = APIRouter(prefix="/api")


# ------------------------------------------------------------------ saúde
@router.get("/health")
def health(c: Container = Depends(container)) -> dict[str, Any]:
    active = c.rules.active()
    with c.analyses.db.read() as conn:
        chain = audit.verify_chain(conn)
    return {
        "status": "ok" if chain.ok else "degraded",
        "rules_version": active.version,
        "rules_rejected": [{"file": r.path.name, "reason": r.reason} for r in c.rules.rejected()],
        "audit_chain_ok": chain.ok,
        "audit_entries": chain.entries,
        "offline": True,
    }


# ----------------------------------------------------------------- regras
@router.get("/rules/active")
def active_rules(c: Container = Depends(container)) -> dict[str, Any]:
    loaded = c.rules.active()
    return {"version": loaded.version, "checksum": loaded.checksum, "rules": loaded.rules.model_dump(by_alias=True)}


@router.get("/rules/{version}")
def rules_version(version: str, c: Container = Depends(container)) -> dict[str, Any]:
    loaded = c.rules.get(version)
    return {"version": loaded.version, "checksum": loaded.checksum, "rules": loaded.rules.model_dump(by_alias=True)}


@router.get("/rules")
def rules_catalog(c: Container = Depends(container)) -> dict[str, Any]:
    return {
        "active": c.rules.active().version,
        "versions": [
            {
                "version": lr.version,
                "checksum": lr.checksum,
                "vigencia": lr.rules.metadados.vigencia,
                "changelog": [e.model_dump() for e in lr.rules.metadados.changelog],
                "criteria": len(lr.rules.criterios),
                "coverage_checked": lr.rules.coverage_size(),
            }
            for lr in c.rules.versions()
        ],
        "rejected": [{"file": r.path.name, "reason": r.reason} for r in c.rules.rejected()],
    }


# --------------------------------------------------------------- análises
@router.get("/analyses")
def list_analyses(c: Container = Depends(container)) -> dict[str, Any]:
    return c.analyses.portfolio()


@router.post("/analyses", status_code=201)
def create_analysis(payload: AnalysisCreate, c: Container = Depends(container)) -> dict[str, Any]:
    return c.analyses.create(payload)


@router.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: str, c: Container = Depends(container)) -> dict[str, Any]:
    return c.analyses.view(analysis_id)


@router.post("/analyses/{analysis_id}/document")
async def upload_document(analysis_id: str, file: UploadFile = File(...), c: Container = Depends(container)) -> dict[str, Any]:
    limit = c.analyses.settings.max_upload_mb * 1024 * 1024
    raw = await file.read(limit + 1)
    if len(raw) > limit:
        raise InvalidInput(f"O arquivo excede o limite de {c.analyses.settings.max_upload_mb} MB.")
    return c.analyses.attach_document(analysis_id, file.filename or "documento", raw)


@router.get("/analyses/{analysis_id}/document/file")
def document_file(analysis_id: str, c: Container = Depends(container)) -> FileResponse:
    path = c.analyses.document_pdf(analysis_id)
    return FileResponse(path, media_type="application/pdf", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/analyses/{analysis_id}/document/text")
def document_text(analysis_id: str, c: Container = Depends(container)) -> dict[str, Any]:
    return c.analyses.document_text(analysis_id)


@router.get("/analyses/{analysis_id}/suggestions")
def suggestions(analysis_id: str, c: Container = Depends(container)) -> dict[str, Any]:
    items = c.analyses.suggestions(analysis_id)
    return {
        "items": [
            {"id": s.id, "target": s.target, "text": s.text, "page": s.page, "paragraph": s.paragraph, "keywords": list(s.keywords), "score": s.score}
            for s in items
        ]
    }


@router.put("/analyses/{analysis_id}/steps/{step}")
def save_step(analysis_id: str, step: str, payload: Any = Body(...), c: Container = Depends(container)) -> dict[str, Any]:
    return c.analyses.save_step(analysis_id, step, payload)


@router.post("/analyses/{analysis_id}/steps/{step}/complete")
def complete_step(analysis_id: str, step: str, c: Container = Depends(container)) -> dict[str, Any]:
    return c.analyses.complete_step(analysis_id, step)


@router.post("/analyses/{analysis_id}/opinion")
def emit_opinion(analysis_id: str, payload: OpinionInput, c: Container = Depends(container)) -> dict[str, Any]:
    return c.analyses.finalize(analysis_id, payload)


@router.get("/analyses/{analysis_id}/dossier.pdf")
def dossier_pdf(analysis_id: str, download: bool = False, c: Container = Depends(container)) -> Response:
    path, rec = c.analyses.dossier_pdf(analysis_id)
    ascii_name = strip_accents(rec.project_name).lower()
    safe = "".join(ch if (ch.isascii() and ch.isalnum()) or ch in "-_" else "-" for ch in ascii_name)[:60].strip("-") or "projeto"
    filename = f"dossie-{safe}-{rec.id[:8]}.pdf"
    disposition = "attachment" if download else "inline"
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"{disposition}; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
            "X-Content-SHA256": rec.content_hash or "",
            "X-PDF-SHA256": rec.pdf_sha256 or "",
        },
    )


@router.get("/analyses/{analysis_id}/integrity")
def integrity(analysis_id: str, c: Container = Depends(container)) -> dict[str, Any]:
    r = c.analyses.integrity(analysis_id)
    return {
        "ok": r.content_hash_ok and r.pdf_hash_ok and r.chain_ok,
        "content_hash_ok": r.content_hash_ok,
        "pdf_hash_ok": r.pdf_hash_ok,
        "chain_ok": r.chain_ok,
        "chain_entries": r.chain_entries,
        "chain_broken_at": r.chain_broken_at,
        "content_hash": r.content_hash,
        "pdf_sha256": r.pdf_sha256,
        "audit_seq": r.audit_seq,
    }


@router.get("/analyses/{analysis_id}/audit")
def audit_trail(analysis_id: str, c: Container = Depends(container)) -> dict[str, Any]:
    return {"items": c.analyses.audit_trail(analysis_id)}
