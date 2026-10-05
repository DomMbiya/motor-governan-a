"""Modelos de domínio da análise preliminar.

Os modelos aceitam rascunhos incompletos (o analista salva aos poucos).
Quem decide se algo está completo é a Camada de Validação, nunca o modelo:
assim a regra de negócio fica num só lugar e o rascunho nunca se perde.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Answer(StrEnum):
    SIM = "sim"
    NAO = "nao"
    INCONCLUSIVO = "inconclusivo"


class EvidenceOrigin(StrEnum):
    ANALYST_SELECTED = "selecionado_analista"
    ASSISTANT_CONFIRMED = "sugerido_confirmado"


class StepId(StrEnum):
    CLASSIFICACAO = "classificacao"
    CRITERIOS = "criterios"
    NAO_ROTINA = "nao_rotina"


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Rect(_Model):
    """Retângulo normalizado (0..1) relativo à página, para destacar a seleção."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(ge=0, le=1)
    h: float = Field(ge=0, le=1)


class Locator(_Model):
    page: int | None = Field(default=None, ge=1, le=10_000)
    paragraph: int | None = Field(default=None, ge=1, le=1_000_000)
    rects: list[Rect] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _has_position(self) -> Locator:
        if self.page is None and self.paragraph is None:
            raise ValueError("a localização da evidência precisa de página ou parágrafo")
        return self


class Evidence(_Model):
    id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    text: str = Field(min_length=1, max_length=10_000)
    locator: Locator
    origin: EvidenceOrigin = EvidenceOrigin.ANALYST_SELECTED
    keyword: str | None = Field(default=None, max_length=80)
    verified: bool = False  # definido pelo servidor; o valor enviado pelo cliente é ignorado

    @model_validator(mode="after")
    def _keyword_only_for_suggestions(self) -> Evidence:
        if self.origin is EvidenceOrigin.ANALYST_SELECTED:
            self.keyword = None
        return self


class CriterionResponse(_Model):
    answer: Answer | None = None
    justification: str = Field(default="", max_length=4000)
    evidences: list[Evidence] = Field(default_factory=list, max_length=20)


class ClassificationResponse(_Model):
    option_id: str | None = Field(default=None, max_length=64)
    justification: str = Field(default="", max_length=4000)
    evidences: list[Evidence] = Field(default_factory=list, max_length=20)


class NaoRotinaAnswer(_Model):
    text: str = Field(default="", max_length=4000)
    evidences: list[Evidence] = Field(default_factory=list, max_length=20)


class NaoRotinaResponse(_Model):
    answers: dict[str, NaoRotinaAnswer] = Field(default_factory=dict)
    exclusions_marked: list[str] = Field(default_factory=list, max_length=20)
    exclusions_explanation: str = Field(default="", max_length=4000)

    @field_validator("exclusions_marked")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class AnalysisData(_Model):
    classification: ClassificationResponse = Field(default_factory=ClassificationResponse)
    criteria: dict[str, CriterionResponse] = Field(default_factory=dict)
    nao_rotina: NaoRotinaResponse = Field(default_factory=NaoRotinaResponse)


class Paragraph(_Model):
    n: int
    text: str
    page: int | None = None


class DocumentInfo(_Model):
    original_filename: str
    source_format: Literal["pdf", "docx", "txt", "md", "csv", "xlsx"]
    view: Literal["pdf", "text"]
    page_count: int
    paragraph_count: int
    sha256: str
    size_bytes: int
    uploaded_at: str
    ocr_applied: bool = False
    warnings: list[str] = Field(default_factory=list)


class DocumentContent(_Model):
    """Texto extraído, usado para verificar evidências e sugerir trechos."""

    pages: list[str] = Field(default_factory=list)
    paragraphs: list[Paragraph] = Field(default_factory=list)


class OpinionInput(_Model):
    decision: str = Field(min_length=1, max_length=64)
    justification: str = Field(default="", max_length=6000)
    divergence_justification: str = Field(default="", max_length=6000)
    acknowledged: bool = Field(description="O analista confirma que leu o quadro-resumo e assume a responsabilidade pelo parecer.")


class Opinion(_Model):
    decision: str
    justification: str
    divergent: bool
    aligned_decision: str
    divergence_justification: str | None
    signed_by: str
    signed_at: str


class AnalysisCreate(_Model):
    analyst_name: str = Field(min_length=3, max_length=120)
    project_name: str = Field(min_length=3, max_length=200)
    area: str = Field(min_length=2, max_length=120)
    lgpd_acknowledged: bool

    @model_validator(mode="after")
    def _lgpd(self) -> AnalysisCreate:
        if not self.lgpd_acknowledged:
            raise ValueError("é preciso confirmar a ciência sobre o tratamento do nome do analista")
        return self
