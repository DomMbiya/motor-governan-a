"""Serviço de aplicação: orquestra as sete etapas do fluxo do analista.

Responsabilidades separadas:
  regras (RulesRepository) | leitura (ingestion, reader) | validação (Validator)
  | indicativo (engine) | geração (dossier) | auditoria (audit) | persistência.
Este serviço só coordena; nenhuma regra de negócio mora aqui.
"""

from __future__ import annotations

import json
import logging
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from app.audit import repository as audit
from app.config import Settings
from app.domain.clock import iso, now_utc
from app.domain.errors import AnalysisLocked, Conflict, InvalidInput, NotFound, ValidationBlocked
from app.domain.hashing import canonical_json, sha256_bytes, sha256_json
from app.domain.models import (
    AnalysisCreate,
    AnalysisData,
    ClassificationResponse,
    CriterionResponse,
    DocumentContent,
    NaoRotinaResponse,
    Opinion,
    OpinionInput,
    StepId,
)
from app.dossier import canonical, pdf
from app.ingestion import service as ingestion
from app.persistence import analyses as repo
from app.persistence.analyses import AnalysisRecord
from app.persistence.db import Database
from app.reader.suggestions import Suggestion, suggest
from app.rules import engine
from app.rules.loader import LoadedRules, RulesRepository
from app.validation.service import STEP_ORDER, Validator, check_known_ids, issues_by_step

log = logging.getLogger("analysis")

CONTENT_FILE = "conteudo.json"
DOSSIER_PDF = "dossie.pdf"
DOSSIER_JSON = "dossie.json"

STEP_LABELS = {
    "abertura": "Abertura",
    "classificacao": "Classificação da atividade",
    "criterios": "Critérios de Frascati",
    "nao_rotina": "Prova de não rotina",
    "resumo": "Quadro-resumo",
    "parecer": "Parecer",
    "dossie": "Dossiê",
}

_STEP_PARSERS: dict[str, TypeAdapter[Any]] = {
    StepId.CLASSIFICACAO.value: TypeAdapter(ClassificationResponse),
    StepId.CRITERIOS.value: TypeAdapter(dict[str, CriterionResponse]),
    StepId.NAO_ROTINA.value: TypeAdapter(NaoRotinaResponse),
}


@dataclass(frozen=True)
class IntegrityReport:
    content_hash_ok: bool
    pdf_hash_ok: bool
    chain_ok: bool
    chain_entries: int
    chain_broken_at: int | None
    content_hash: str
    pdf_sha256: str
    audit_seq: int


class AnalysisService:
    def __init__(self, settings: Settings, db: Database, rules: RulesRepository) -> None:
        self.settings = settings
        self.db = db
        self.rules = rules

    # ----------------------------------------------------------- helpers
    def _dir(self, analysis_id: str) -> Path:
        try:
            uuid.UUID(analysis_id)
        except ValueError as exc:
            raise NotFound("Análise não encontrada.") from exc
        return self.settings.analyses_dir / analysis_id

    def _load(self, analysis_id: str) -> AnalysisRecord:
        self._dir(analysis_id)
        with self.db.read() as conn:
            return repo.get(conn, analysis_id)

    def _rules_for(self, rec: AnalysisRecord) -> LoadedRules:
        return self.rules.get(rec.rules_version, rec.rules_checksum)

    def _content(self, rec: AnalysisRecord) -> DocumentContent | None:
        path = self._dir(rec.id) / CONTENT_FILE
        if rec.document is None or not path.exists():
            return None
        return DocumentContent.model_validate_json(path.read_text("utf-8"))

    def _validator(self, rec: AnalysisRecord, rules: LoadedRules) -> Validator:
        return Validator(rules.rules, rec.document, self._content(rec))

    @staticmethod
    def _require_draft(rec: AnalysisRecord) -> None:
        if rec.finalized:
            raise AnalysisLocked("Esta análise já foi finalizada e é imutável. Abra uma nova análise para revisar o projeto.")

    # ------------------------------------------------------------ views
    def view(self, analysis_id: str) -> dict[str, Any]:
        rec = self._load(analysis_id)
        rules = self._rules_for(rec)
        validator = self._validator(rec, rules)
        issues = validator.validate(rec.data) if not rec.finalized else []
        grouped = issues_by_step(issues)
        indicative = rec.result if rec.finalized else engine.compute(rules.rules, rec.data, issues).as_dict()

        steps: list[dict[str, Any]] = []
        gate_open = True  # todas as etapas anteriores concluídas
        for sid in (*STEP_ORDER, "resumo", "parecer", "dossie"):
            complete = rec.finalized or (sid in STEP_ORDER and not grouped.get(sid))
            state = "complete" if complete else ("available" if gate_open else "locked")
            steps.append({"id": sid, "label": STEP_LABELS[sid], "state": state, "pending": len(grouped.get(sid, []))})
            if sid != "resumo":  # o quadro-resumo é de revisão: não exige ação para liberar o parecer
                gate_open = gate_open and complete

        return {
            "id": rec.id,
            "status": rec.status,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at,
            "analyst_name": rec.analyst_name,
            "project_name": rec.project_name,
            "area": rec.area,
            "rules": {"version": rec.rules_version, "checksum": rec.rules_checksum, "is_active": rec.rules_version == self.rules.active().version},
            "document": rec.document.model_dump() if rec.document else None,
            "data": rec.data.model_dump(mode="json"),
            "issues": grouped,
            "steps": steps,
            "indicative": indicative,
            "opinion": rec.opinion.model_dump() if rec.opinion else None,
            "integrity": (
                {"content_hash": rec.content_hash, "pdf_sha256": rec.pdf_sha256, "audit_seq": rec.audit_seq, "finalized_at": rec.finalized_at}
                if rec.finalized
                else None
            ),
        }

    def portfolio(self) -> dict[str, Any]:
        with self.db.read() as conn:
            records = repo.list_all(conn)
        items = []
        for rec in records:
            outcome = None
            if rec.finalized and rec.result:
                outcome = rec.result.get("outcome")
            elif rec.document is not None:
                try:
                    rules = self._rules_for(rec)
                    issues = self._validator(rec, rules).validate(rec.data)
                    outcome = engine.compute(rules.rules, rec.data, issues).outcome
                except Exception:  # noqa: BLE001 - portfólio nunca deve cair por uma análise
                    log.exception("portfolio.preview_failed", extra={"ctx": {"analysis_id": rec.id}})
            items.append(
                {
                    "id": rec.id,
                    "project_name": rec.project_name,
                    "area": rec.area,
                    "analyst_name": rec.analyst_name,
                    "status": rec.status,
                    "created_at": rec.created_at,
                    "finalized_at": rec.finalized_at,
                    "rules_version": rec.rules_version,
                    "indicative": outcome,
                    "decision": rec.opinion.decision if rec.opinion else None,
                    "divergent": rec.opinion.divergent if rec.opinion else None,
                    "inconclusive_criteria": [cid for cid, c in rec.data.criteria.items() if c.answer and c.answer.value == "inconclusivo"],
                    "has_document": rec.document is not None,
                }
            )
        divergences: dict[str, int] = {}
        for rec in records:
            if rec.opinion and rec.opinion.divergent:
                for cid, c in rec.data.criteria.items():
                    if c.answer and c.answer.value != "sim":
                        divergences[cid] = divergences.get(cid, 0) + 1
        return {"items": items, "divergence_by_criterion": divergences}

    # ----------------------------------------------------------- etapa 1
    def create(self, payload: AnalysisCreate) -> dict[str, Any]:
        active = self.rules.active()
        now = iso(now_utc())
        rec = AnalysisRecord(
            id=str(uuid.uuid4()),
            created_at=now,
            updated_at=now,
            status="draft",
            analyst_name=payload.analyst_name,
            project_name=payload.project_name,
            area=payload.area,
            rules_version=active.version,
            rules_checksum=active.checksum,
            document=None,
            data=AnalysisData(),
            opinion=None,
            result=None,
            content_hash=None,
            pdf_sha256=None,
            audit_seq=None,
            finalized_at=None,
        )
        with self.db.transaction() as conn:
            repo.insert(conn, rec)
            audit.append(
                conn,
                event="analysis.created",
                actor=rec.analyst_name,
                analysis_id=rec.id,
                payload={"rules_version": rec.rules_version, "rules_checksum": rec.rules_checksum},
            )
        log.info("analysis.created", extra={"ctx": {"analysis_id": rec.id, "rules_version": rec.rules_version}})
        return self.view(rec.id)

    def attach_document(self, analysis_id: str, filename: str, raw: bytes) -> dict[str, Any]:
        rec = self._load(analysis_id)
        self._require_draft(rec)
        if rec.document is not None and self._has_any_evidence(rec.data):
            raise Conflict("Esta análise já tem evidências ligadas ao documento atual. Para analisar outro material, abra uma nova análise.")
        target = self._dir(analysis_id) / "documento"
        staging = self._dir(analysis_id) / f".upload-{uuid.uuid4().hex[:8]}"
        try:
            ingested = ingestion.ingest(raw, filename, staging, self.settings.max_upload_mb * 1024 * 1024)
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        (staging / CONTENT_FILE).write_text(ingested.content.model_dump_json(), "utf-8")
        shutil.rmtree(target, ignore_errors=True)
        staging.rename(target)
        # O conteúdo extraído fica ao lado da análise para verificação de evidências.
        shutil.copyfile(target / CONTENT_FILE, self._dir(analysis_id) / CONTENT_FILE)

        rec.document = ingested.info
        rec.updated_at = iso(now_utc())
        with self.db.transaction() as conn:
            repo.update_draft(conn, rec)
            audit.append(
                conn,
                event="document.attached",
                actor=rec.analyst_name,
                analysis_id=rec.id,
                payload={
                    "sha256": ingested.info.sha256,
                    "format": ingested.info.source_format,
                    "pages": ingested.info.page_count,
                    "paragraphs": ingested.info.paragraph_count,
                    "ocr": ingested.info.ocr_applied,
                },
            )
        return self.view(analysis_id)

    def document_pdf(self, analysis_id: str) -> Path:
        rec = self._load(analysis_id)
        path = self._dir(analysis_id) / "documento" / ingestion.PDF_NAME
        if rec.document is None or rec.document.view != "pdf" or not path.exists():
            raise NotFound("Esta análise não tem um PDF para exibir.")
        return path

    def document_text(self, analysis_id: str) -> dict[str, Any]:
        rec = self._load(analysis_id)
        content = self._content(rec)
        if rec.document is None or content is None:
            raise NotFound("Nenhum documento carregado nesta análise.")
        return {"view": rec.document.view, "paragraphs": [p.model_dump() for p in content.paragraphs], "page_count": rec.document.page_count}

    @staticmethod
    def _has_any_evidence(data: AnalysisData) -> bool:
        return bool(
            data.classification.evidences or any(c.evidences for c in data.criteria.values()) or any(a.evidences for a in data.nao_rotina.answers.values())
        )

    # ------------------------------------------------------ etapas 2 a 4
    def save_step(self, analysis_id: str, step: str, payload: Any) -> dict[str, Any]:
        if step not in _STEP_PARSERS:
            raise NotFound(f"Etapa '{step}' não existe.")
        rec = self._load(analysis_id)
        self._require_draft(rec)
        if rec.document is None:
            raise Conflict("Carregue o material do projeto antes de responder às etapas.")
        try:
            parsed = _STEP_PARSERS[step].validate_python(payload)
        except ValidationError as exc:
            raise InvalidInput(
                "Os dados enviados para a etapa estão em formato inválido.",
                details=[{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()],
            ) from exc

        rules = self._rules_for(rec)
        if step == StepId.CLASSIFICACAO.value:
            rec.data.classification = parsed
        elif step == StepId.CRITERIOS.value:
            rec.data.criteria = parsed
        else:
            rec.data.nao_rotina = parsed
        check_known_ids(rules.rules, rec.data)

        validator = self._validator(rec, rules)
        validator.annotate_verification(rec.data)
        self._ensure_previous_steps_complete(validator, rec.data, step)
        rec.updated_at = iso(now_utc())
        with self.db.transaction() as conn:
            repo.update_draft(conn, rec)
        return self.view(analysis_id)

    def complete_step(self, analysis_id: str, step: str) -> dict[str, Any]:
        if step not in _STEP_PARSERS:
            raise NotFound(f"Etapa '{step}' não existe.")
        rec = self._load(analysis_id)
        self._require_draft(rec)
        rules = self._rules_for(rec)
        validator = self._validator(rec, rules)
        self._ensure_previous_steps_complete(validator, rec.data, step)
        pending = [i.as_dict() for i in validator.validate(rec.data) if i.step == step]
        if pending:
            raise ValidationBlocked(f"A etapa tem {len(pending)} pendência(s) obrigatória(s).", details=pending)
        key = {"classificacao": "classification", "criterios": "criteria", "nao_rotina": "nao_rotina"}[step]
        dumped = rec.data.model_dump(mode="json")[key]
        with self.db.transaction() as conn:
            audit.append(
                conn,
                event="step.completed",
                actor=rec.analyst_name,
                analysis_id=rec.id,
                payload={"step": step, "payload_sha256": sha256_json(dumped), "rules_version": rec.rules_version},
            )
        return self.view(analysis_id)

    @staticmethod
    def _ensure_previous_steps_complete(validator: Validator, data: AnalysisData, step: str) -> None:
        issues = validator.validate(data)
        idx = STEP_ORDER.index(step)
        blocking = [i for i in issues if i.step in STEP_ORDER[:idx]]
        if blocking:
            raise Conflict(
                f"Conclua a etapa '{STEP_LABELS[blocking[0].step]}' antes de continuar.",
                details=[i.as_dict() for i in blocking],
            )

    def suggestions(self, analysis_id: str) -> list[Suggestion]:
        rec = self._load(analysis_id)
        content = self._content(rec)
        if rec.document is None or content is None:
            return []
        return suggest(self._rules_for(rec).rules, rec.document, content)

    # ------------------------------------------------------ etapas 6 e 7
    def finalize(self, analysis_id: str, payload: OpinionInput) -> dict[str, Any]:
        rec = self._load(analysis_id)
        self._require_draft(rec)
        rules = self._rules_for(rec)
        policy = rules.rules.politicas
        if rec.document is None:
            raise Conflict("Carregue o material do projeto antes do parecer.")

        validator = self._validator(rec, rules)
        validator.annotate_verification(rec.data)
        issues = validator.validate(rec.data)
        if issues:
            raise ValidationBlocked(
                f"O parecer só pode ser emitido com a análise completa. Há {len(issues)} pendência(s).",
                details=[i.as_dict() for i in issues],
            )
        indicative = engine.compute(rules.rules, rec.data, issues)

        problems: list[dict[str, str]] = []
        if payload.decision not in {o.id for o in rules.rules.parecer.opcoes}:
            problems.append({"field": "decision", "message": "Escolha uma das opções de parecer."})
        if not payload.acknowledged:
            problems.append({"field": "acknowledged", "message": "Confirme que revisou o quadro-resumo e assume a responsabilidade pelo parecer."})
        if len(payload.justification.strip()) < policy.justificativa_min_caracteres:
            problems.append(
                {"field": "justification", "message": f"A justificativa do parecer precisa de pelo menos {policy.justificativa_min_caracteres} caracteres."}
            )
        divergent = payload.decision != indicative.aligned_decision
        if divergent and len(payload.divergence_justification.strip()) < policy.divergencia_min_caracteres:
            problems.append(
                {
                    "field": "divergence_justification",
                    "message": f"O parecer diverge do indicativo. Explique a divergência em pelo menos {policy.divergencia_min_caracteres} caracteres.",
                }
            )
        if problems:
            raise ValidationBlocked("O parecer tem pendências.", details=problems)

        now = iso(now_utc())
        opinion = Opinion(
            decision=payload.decision,
            justification=payload.justification.strip(),
            divergent=divergent,
            aligned_decision=indicative.aligned_decision or "",
            divergence_justification=payload.divergence_justification.strip() if divergent else None,
            signed_by=rec.analyst_name,
            signed_at=now,
        )
        dossier = canonical.build(
            analysis_id=rec.id,
            project_name=rec.project_name,
            area=rec.area,
            analyst_name=rec.analyst_name,
            created_at=rec.created_at,
            rules=rules.rules,
            rules_checksum=rules.checksum,
            document=rec.document,
            data=rec.data,
            indicative=indicative,
            opinion=opinion,
        )
        content_hash = sha256_json(dossier)
        folder = self._dir(rec.id)

        with self.db.transaction() as conn:
            finalized_entry = audit.append(
                conn,
                event="analysis.finalized",
                actor=rec.analyst_name,
                analysis_id=rec.id,
                payload={
                    "content_sha256": content_hash,
                    "indicative": indicative.outcome,
                    "rule_id": indicative.rule_id,
                    "decision": opinion.decision,
                    "divergent": divergent,
                    "rules_version": rec.rules_version,
                },
            )
            pdf_bytes = pdf.render(dossier, content_hash=content_hash, audit_seq=finalized_entry.seq, timezone=self.settings.timezone)
            pdf_hash = sha256_bytes(pdf_bytes)
            audit.append(
                conn,
                event="dossier.generated",
                actor="sistema",
                analysis_id=rec.id,
                payload={"pdf_sha256": pdf_hash, "bytes": len(pdf_bytes), "content_sha256": content_hash},
            )
            (folder / DOSSIER_JSON).write_text(canonical_json(dossier), "utf-8")
            (folder / DOSSIER_PDF).write_bytes(pdf_bytes)
            rec.opinion = opinion
            rec.result = indicative.as_dict()
            rec.content_hash = content_hash
            rec.pdf_sha256 = pdf_hash
            rec.audit_seq = finalized_entry.seq
            rec.finalized_at = now
            rec.updated_at = now
            repo.finalize(conn, rec)

        log.info(
            "analysis.finalized",
            extra={"ctx": {"analysis_id": rec.id, "indicative": indicative.outcome, "decision": opinion.decision, "divergent": divergent}},
        )
        return self.view(analysis_id)

    def dossier_pdf(self, analysis_id: str) -> tuple[Path, AnalysisRecord]:
        rec = self._load(analysis_id)
        path = self._dir(analysis_id) / DOSSIER_PDF
        if not rec.finalized or not path.exists():
            raise NotFound("O dossiê só existe depois que o parecer é emitido.")
        return path, rec

    def integrity(self, analysis_id: str) -> IntegrityReport:
        rec = self._load(analysis_id)
        if not rec.finalized or rec.content_hash is None or rec.pdf_sha256 is None or rec.audit_seq is None:
            raise NotFound("A verificação de integridade só existe para análises finalizadas.")
        folder = self._dir(analysis_id)
        stored = json.loads((folder / DOSSIER_JSON).read_text("utf-8")) if (folder / DOSSIER_JSON).exists() else None
        content_ok = stored is not None and sha256_json(stored) == rec.content_hash
        pdf_path = folder / DOSSIER_PDF
        pdf_ok = pdf_path.exists() and sha256_bytes(pdf_path.read_bytes()) == rec.pdf_sha256
        with self.db.read() as conn:
            chain = audit.verify_chain(conn)
            entries = audit.list_for_analysis(conn, analysis_id)
        recorded = next((e for e in entries if e.event == "analysis.finalized"), None)
        content_ok = content_ok and recorded is not None and recorded.payload.get("content_sha256") == rec.content_hash
        return IntegrityReport(
            content_hash_ok=content_ok,
            pdf_hash_ok=pdf_ok,
            chain_ok=chain.ok,
            chain_entries=chain.entries,
            chain_broken_at=chain.broken_at,
            content_hash=rec.content_hash,
            pdf_sha256=rec.pdf_sha256,
            audit_seq=rec.audit_seq,
        )

    def audit_trail(self, analysis_id: str) -> list[dict[str, Any]]:
        self._load(analysis_id)
        with self.db.read() as conn:
            entries = audit.list_for_analysis(conn, analysis_id)
        return [
            {"seq": e.seq, "ts": e.ts, "event": e.event, "actor": e.actor, "payload": e.payload, "entry_hash": e.entry_hash, "prev_hash": e.prev_hash}
            for e in entries
        ]
