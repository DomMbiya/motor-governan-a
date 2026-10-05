"""Camada de Validação: a esteira determinística.

Valida o PROCESSO, não julga o projeto. Para cada etapa, devolve a lista exata
de pendências (campo, motivo, mensagem para o analista). Nenhuma etapa
seguinte, nenhum indicativo e nenhum parecer existem enquanto houver pendência.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.errors import InvalidInput
from app.domain.models import AnalysisData, DocumentContent, DocumentInfo, Evidence, StepId
from app.rules.schema import RuleBase
from app.validation.evidence import verify

STEP_ORDER = ("abertura", StepId.CLASSIFICACAO.value, StepId.CRITERIOS.value, StepId.NAO_ROTINA.value)


@dataclass(frozen=True)
class Issue:
    step: str
    target: str  # id da pergunta/critério; "" para a etapa como um todo
    field: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"step": self.step, "target": self.target, "field": self.field, "code": self.code, "message": self.message}


def check_known_ids(rules: RuleBase, data: AnalysisData) -> None:
    """Recusa ids fora da base de regras: protege contra cliente desatualizado."""
    criteria = {c.id for c in rules.criterios}
    unknown = set(data.criteria) - criteria
    questions = {q.id for q in rules.nao_rotina.perguntas}
    unknown |= {f"nao_rotina.{k}" for k in set(data.nao_rotina.answers) - questions}
    exclusions = {e.id for e in rules.nao_rotina.exclusoes.itens}
    unknown |= {f"exclusao.{k}" for k in set(data.nao_rotina.exclusions_marked) - exclusions}
    options = {o.id for o in rules.classificacao.opcoes}
    if data.classification.option_id and data.classification.option_id not in options:
        unknown.add(f"classificacao.{data.classification.option_id}")
    if unknown:
        raise InvalidInput(
            f"Itens que não existem na base de regras v{rules.version}: {', '.join(sorted(unknown))}. Recarregue a página para usar a versão correta.",
            details={"unknown": sorted(unknown)},
        )


class Validator:
    def __init__(self, rules: RuleBase, info: DocumentInfo | None, content: DocumentContent | None) -> None:
        self.rules = rules
        self.info = info
        self.content = content
        self.policy = rules.politicas

    # ------------------------------------------------------------ public
    def validate(self, data: AnalysisData) -> list[Issue]:
        issues: list[Issue] = []
        if self.info is None:
            issues.append(Issue("abertura", "", "document", "document_required", "Carregue o material do projeto para começar."))
        issues += self._classification(data)
        issues += self._criteria(data)
        issues += self._nao_rotina(data)
        return issues

    def annotate_verification(self, data: AnalysisData) -> AnalysisData:
        """Marca cada evidência como verificada ou não, com base no documento."""
        for ev in self._all_evidences(data):
            ok, _ = verify(ev, self.info, self.content)
            ev.verified = ok
        return data

    # ----------------------------------------------------------- helpers
    def _all_evidences(self, data: AnalysisData) -> list[Evidence]:
        evs = list(data.classification.evidences)
        for c in data.criteria.values():
            evs += c.evidences
        for a in data.nao_rotina.answers.values():
            evs += a.evidences
        return evs

    def _text(self, step: str, target: str, field: str, value: str, label: str, minimum: int | None = None) -> list[Issue]:
        minimum = minimum or self.policy.justificativa_min_caracteres
        size = len(value.strip())
        if size == 0:
            return [Issue(step, target, field, "required", f"{label}: preencha a justificativa.")]
        if size < minimum:
            return [Issue(step, target, field, "too_short", f"{label}: a justificativa precisa de pelo menos {minimum} caracteres ({size} até agora).")]
        return []

    def _evidences(self, step: str, target: str, evidences: list[Evidence], label: str) -> list[Issue]:
        if not evidences:
            return [Issue(step, target, "evidences", "evidence_required", f"{label}: anexe ao menos um trecho do documento.")]
        out: list[Issue] = []
        if len(evidences) > self.policy.evidencias_max_por_pergunta:
            out.append(Issue(step, target, "evidences", "too_many", f"{label}: use no máximo {self.policy.evidencias_max_por_pergunta} trechos."))
        for i, ev in enumerate(evidences, start=1):
            if len(ev.text) > self.policy.evidencia_max_caracteres:
                out.append(
                    Issue(
                        step,
                        target,
                        f"evidences.{ev.id}",
                        "evidence_too_long",
                        f"{label}: o trecho {i} passa de {self.policy.evidencia_max_caracteres} caracteres; selecione só a parte que sustenta a resposta.",
                    )
                )
            ok, reason = verify(ev, self.info, self.content)
            if not ok:
                out.append(Issue(step, target, f"evidences.{ev.id}", "evidence_not_found", f"{label}: {reason}"))
        return out

    def _classification(self, data: AnalysisData) -> list[Issue]:
        step, c = StepId.CLASSIFICACAO.value, data.classification
        label = "Classificação da atividade"
        issues: list[Issue] = []
        if not c.option_id:
            issues.append(Issue(step, "classificacao", "option_id", "required", f"{label}: escolha uma categoria."))
        issues += self._text(step, "classificacao", "justification", c.justification, label)
        issues += self._evidences(step, "classificacao", c.evidences, label)
        return issues

    def _criteria(self, data: AnalysisData) -> list[Issue]:
        step = StepId.CRITERIOS.value
        issues: list[Issue] = []
        for criterion in self.rules.criterios:
            resp = data.criteria.get(criterion.id)
            label = f"“{criterion.pergunta}”"
            if resp is None or resp.answer is None:
                issues.append(Issue(step, criterion.id, "answer", "required", f"{label}: escolha Sim, Não ou Inconclusivo."))
                if resp is None:
                    issues.append(Issue(step, criterion.id, "evidences", "evidence_required", f"{label}: anexe ao menos um trecho do documento."))
                    issues.append(Issue(step, criterion.id, "justification", "required", f"{label}: preencha a justificativa."))
                    continue
            issues += self._text(step, criterion.id, "justification", resp.justification, label)
            issues += self._evidences(step, criterion.id, resp.evidences, label)
        return issues

    def _nao_rotina(self, data: AnalysisData) -> list[Issue]:
        step, nr = StepId.NAO_ROTINA.value, data.nao_rotina
        issues: list[Issue] = []
        for q in sorted(self.rules.nao_rotina.perguntas, key=lambda q: q.ordem):
            ans = nr.answers.get(q.id)
            label = f"Pergunta {q.ordem}"
            text = ans.text if ans else ""
            size = len(text.strip())
            if size == 0:
                issues.append(Issue(step, q.id, "text", "required", f"{label}: escreva a resposta."))
            elif size < self.policy.justificativa_min_caracteres:
                issues.append(
                    Issue(
                        step,
                        q.id,
                        "text",
                        "too_short",
                        f"{label}: a resposta precisa de pelo menos {self.policy.justificativa_min_caracteres} caracteres ({size} até agora).",
                    )
                )
            issues += self._evidences(step, q.id, ans.evidences if ans else [], label)
        if nr.exclusions_marked:
            ordem = self.rules.nao_rotina.exclusoes.ordem
            issues += [
                Issue(step, "exclusoes", i.field, i.code, i.message.replace("a justificativa", "a explicação"))
                for i in self._text(step, "exclusoes", "exclusions_explanation", nr.exclusions_explanation, f"Pergunta {ordem} (exclusão marcada)")
            ]
        return issues


def issues_by_step(issues: list[Issue]) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = {s: [] for s in STEP_ORDER}
    for i in issues:
        grouped.setdefault(i.step, []).append(i.as_dict())
    return grouped
