"""Conteúdo canônico do dossiê.

Este é o objeto que recebe o hash de integridade. Ele reúne, de forma
autoexplicativa, tudo o que o guia exige: qual regra, qual informação do
projeto, quem decidiu e quando. O PDF é apenas uma apresentação dele.

Por que não o hash do próprio PDF dentro do PDF? Um arquivo não pode conter o
próprio hash. Imprimimos o hash do conteúdo canônico; o hash do arquivo PDF
fica registrado no log de auditoria.
"""

from __future__ import annotations

from typing import Any

from app.domain.models import AnalysisData, DocumentInfo, Evidence, EvidenceOrigin, Opinion
from app.rules.engine import Indicative
from app.rules.schema import RuleBase

SCHEMA = "dossie-analise-preliminar/1"

ORIGIN_LABEL = {
    EvidenceOrigin.ANALYST_SELECTED: "Selecionado pelo analista",
    EvidenceOrigin.ASSISTANT_CONFIRMED: "Sugerido pelo assistente de leitura e confirmado pelo analista",
}

ANSWER_LABEL = {"sim": "Sim", "nao": "Não", "inconclusivo": "Inconclusivo"}


def _evidence(ev: Evidence) -> dict[str, Any]:
    return {
        "texto": ev.text,
        "pagina": ev.locator.page,
        "paragrafo": ev.locator.paragraph,
        "origem": ev.origin.value,
        "origem_rotulo": ORIGIN_LABEL[ev.origin],
        "palavras_chave": ev.keyword,
        "conferido_no_documento": ev.verified,
    }


def build(
    *,
    analysis_id: str,
    project_name: str,
    area: str,
    analyst_name: str,
    created_at: str,
    rules: RuleBase,
    rules_checksum: str,
    document: DocumentInfo,
    data: AnalysisData,
    indicative: Indicative,
    opinion: Opinion,
) -> dict[str, Any]:
    used_sources = {rules.classificacao.fonte, rules.nao_rotina.fonte, rules.nao_rotina.exclusoes.fonte}
    used_sources |= {c.fonte for c in rules.criterios}

    classification_option = rules.classificacao.opcoes
    chosen = next(o for o in classification_option if o.id == data.classification.option_id)

    criteria = []
    for c in rules.criterios:
        resp = data.criteria[c.id]
        source = rules.source(c.fonte)
        criteria.append(
            {
                "id": c.id,
                "pergunta": c.pergunta,
                "definicao": c.definicao,
                "resposta": resp.answer.value if resp.answer else None,
                "resposta_rotulo": ANSWER_LABEL[resp.answer.value] if resp.answer else None,
                "justificativa": resp.justification,
                "evidencias": [_evidence(e) for e in resp.evidences],
                "regra_referencia": f"{source.titulo}, critério: {c.rotulo.lower()}",
            }
        )

    nr = rules.nao_rotina
    answers = []
    for q in sorted(nr.perguntas, key=lambda q: q.ordem):
        a = data.nao_rotina.answers[q.id]
        answers.append({"ordem": q.ordem, "id": q.id, "pergunta": q.pergunta, "resposta": a.text, "evidencias": [_evidence(e) for e in a.evidences]})
    exclusion_labels = {i.id: i.rotulo for i in nr.exclusoes.itens}

    return {
        "schema": SCHEMA,
        "titulo": rules.dossie.titulo,
        "ressalva": rules.dossie.ressalva,
        "identificacao": {
            "analise_id": analysis_id,
            "projeto": project_name,
            "area_responsavel": area,
            "analista": analyst_name,
            "aberta_em": created_at,
        },
        "base_normativa": {
            "versao_regras": rules.version,
            "vigencia": rules.metadados.vigencia,
            "checksum_arquivo_regras": rules_checksum,
            "fontes": [{"id": s.id, "titulo": s.titulo, "referencia": s.referencia, "observacao": s.observacao} for s in rules.fontes if s.id in used_sources],
        },
        "documento_analisado": {
            "arquivo": document.original_filename,
            "formato": document.source_format,
            "sha256": document.sha256,
            "paginas": document.page_count,
            "paragrafos": document.paragraph_count,
            "ocr": document.ocr_applied,
        },
        "classificacao": {
            "categoria_id": chosen.id,
            "categoria": chosen.rotulo,
            "descricao": chosen.descricao,
            "justificativa": data.classification.justification,
            "evidencias": [_evidence(e) for e in data.classification.evidences],
            "regra_referencia": rules.source(rules.classificacao.fonte).titulo,
        },
        "criterios_frascati": criteria,
        "prova_nao_rotina": {
            "argumento": answers,
            "exclusoes_marcadas": [{"id": e, "rotulo": exclusion_labels[e]} for e in data.nao_rotina.exclusions_marked],
            "explicacao_exclusoes": data.nao_rotina.exclusions_explanation or None,
            "regra_referencia": rules.source(nr.fonte).titulo,
        },
        "indicativo": {
            "resultado": indicative.outcome,
            "rotulo": indicative.label,
            "motivo": indicative.reason,
            "regra_aplicada": indicative.rule_id,
            "parecer_alinhado": indicative.aligned_decision,
            "aviso": rules.indicativo.aviso,
        },
        "parecer": {
            "decisao": opinion.decision,
            "decisao_rotulo": rules.opinion_option(opinion.decision).rotulo,
            "justificativa": opinion.justification,
            "diverge_do_indicativo": opinion.divergent,
            "justificativa_divergencia": opinion.divergence_justification,
            "assinado_por": opinion.signed_by,
            "assinado_em": opinion.signed_at,
        },
        "pontos_para_especialista": [{"tipo": p.kind, "id": p.target, "item": p.label, "registro_do_analista": p.detail} for p in indicative.specialist_points],
    }
