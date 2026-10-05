from __future__ import annotations

from pathlib import Path

import pytest

from app.domain.models import AnalysisData, CriterionResponse, NaoRotinaResponse
from app.rules.engine import BLOCKED, compute
from app.rules.loader import parse_rules_file

RULES = parse_rules_file(Path(__file__).resolve().parents[1] / "rules" / "regras_v1.0.0.yaml").rules
IDS = [c.id for c in RULES.criterios]


def _data(answers: list[str], exclusions: list[str] | None = None) -> AnalysisData:
    return AnalysisData(
        criteria={cid: CriterionResponse(answer=a, justification="x" * 30) for cid, a in zip(IDS, answers, strict=True)},
        nao_rotina=NaoRotinaResponse(exclusions_marked=exclusions or []),
    )


@pytest.mark.parametrize(
    ("answers", "exclusions", "outcome", "rule", "aligned"),
    [
        (["sim"] * 5, [], "favoravel", "IND-04", "enquadra"),
        (["sim"] * 5, ["software_pronto"], "requer_especialista", "IND-03", "encaminhar_especialista"),
        (["sim", "sim", "inconclusivo", "sim", "sim"], [], "requer_especialista", "IND-02", "encaminhar_especialista"),
        (["sim", "nao", "inconclusivo", "sim", "sim"], [], "desfavoravel", "IND-01", "nao_enquadra"),
        (["nao"] * 5, ["operacao"], "desfavoravel", "IND-01", "nao_enquadra"),
    ],
)
def test_indicative_follows_proposal_table(answers, exclusions, outcome, rule, aligned) -> None:
    result = compute(RULES, _data(answers, exclusions), [])
    assert (result.outcome, result.rule_id, result.aligned_decision) == (outcome, rule, aligned)


def test_specialist_points_list_inconclusive_and_exclusions() -> None:
    result = compute(RULES, _data(["sim", "sim", "inconclusivo", "sim", "sim"], ["manutencao"]), [])
    kinds = sorted((p.kind, p.target) for p in result.specialist_points)
    assert kinds == [("criterio", "incerteza"), ("exclusao", "manutencao")]


def test_pending_issues_block_the_indicative() -> None:
    from app.validation.service import Issue

    result = compute(RULES, AnalysisData(), [Issue("criterios", "novidade", "answer", "required", "x")])
    assert result.outcome == BLOCKED and result.aligned_decision is None and result.pending == 1


def test_same_input_same_output() -> None:
    data = _data(["sim", "inconclusivo", "sim", "sim", "sim"])
    assert compute(RULES, data, []) == compute(RULES, data, [])
