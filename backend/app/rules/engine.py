"""Cálculo do indicativo a partir das regras declaradas no YAML.

Determinístico: mesmas respostas, mesmas regras, mesmo indicativo. A ordem
das regras no arquivo define a precedência (vale a primeira que corresponder).
O indicativo é uma recomendação; o parecer é sempre do analista.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from app.domain.models import AnalysisData
from app.rules.schema import RuleBase
from app.validation.service import Issue

BLOCKED = "bloqueado"


@dataclass(frozen=True)
class SpecialistPoint:
    kind: str  # "criterio" | "exclusao"
    target: str
    label: str
    detail: str


@dataclass(frozen=True)
class Indicative:
    outcome: str
    label: str
    description: str
    reason: str
    rule_id: str | None
    aligned_decision: str | None
    criteria_not_met: list[str] = field(default_factory=list)
    specialist_points: list[SpecialistPoint] = field(default_factory=list)
    pending: int = 0

    def as_dict(self) -> dict:
        return asdict(self)


def compute(rules: RuleBase, data: AnalysisData, issues: list[Issue]) -> Indicative:
    if issues:
        return Indicative(
            outcome=BLOCKED,
            label="Análise bloqueada",
            description="Há pendências obrigatórias. O indicativo só é calculado com a análise completa.",
            reason=f"{len(issues)} pendência(s) obrigatória(s) a resolver.",
            rule_id=None,
            aligned_decision=None,
            pending=len(issues),
        )

    answers = tuple(data.criteria[c.id].answer.value for c in rules.criterios)  # type: ignore[union-attr]
    exclusion_marked = bool(data.nao_rotina.exclusions_marked)
    rule = next(r for r in rules.indicativo.regras if r.quando.matches(answers, exclusion_marked))  # cobertura provada no carregamento
    outcome = rules.outcome(rule.resultado)

    not_met = [c.id for c in rules.criterios if data.criteria[c.id].answer.value == "nao"]  # type: ignore[union-attr]
    points: list[SpecialistPoint] = [
        SpecialistPoint("criterio", c.id, c.pergunta, data.criteria[c.id].justification)
        for c in rules.criterios
        if data.criteria[c.id].answer.value == "inconclusivo"  # type: ignore[union-attr]
    ]
    if exclusion_marked:
        labels = {i.id: i.rotulo for i in rules.nao_rotina.exclusoes.itens}
        for ex in data.nao_rotina.exclusions_marked:
            points.append(SpecialistPoint("exclusao", ex, labels[ex], data.nao_rotina.exclusions_explanation))

    return Indicative(
        outcome=outcome.id,
        label=outcome.rotulo,
        description=outcome.descricao,
        reason=rule.motivo,
        rule_id=rule.id,
        aligned_decision=outcome.parecer_alinhado,
        criteria_not_met=not_met,
        specialist_points=points,
    )
