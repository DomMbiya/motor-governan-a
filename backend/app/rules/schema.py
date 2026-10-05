"""Esquema tipado da base de regras (YAML).

A base de regras é a peça central do sistema. Este módulo garante que nenhum
arquivo inválido chegue ao fluxo do analista: além da forma (tipos, campos
obrigatórios), validamos a semântica (referências cruzadas, ids únicos) e
provamos que a lógica do indicativo cobre todas as combinações de respostas.
"""

from __future__ import annotations

import itertools
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
SLUG = re.compile(r"^[a-z][a-z0-9_]{1,48}$")

AnswerValue = Literal["sim", "nao", "inconclusivo"]
ANSWER_VALUES: tuple[AnswerValue, ...] = ("sim", "nao", "inconclusivo")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def _slug(value: str) -> str:
    if not SLUG.match(value):
        raise ValueError(f"id '{value}' inválido: use minúsculas, dígitos e _, começando por letra")
    return value


class ChangelogEntry(_Strict):
    versao: str
    data: str
    descricao: str = Field(min_length=5)


class Metadata(_Strict):
    versao: str
    vigencia: str
    titulo: str = Field(min_length=5)
    responsavel: str = Field(min_length=3)
    changelog: list[ChangelogEntry] = Field(min_length=1)

    @field_validator("versao")
    @classmethod
    def _semver(cls, v: str) -> str:
        if not SEMVER.match(v):
            raise ValueError("versao deve seguir o formato MAJOR.MINOR.PATCH (ex.: 1.0.0)")
        return v

    @model_validator(mode="after")
    def _changelog_has_current(self) -> Metadata:
        if not any(entry.versao == self.versao for entry in self.changelog):
            raise ValueError(f"o changelog não registra a versão atual {self.versao}")
        return self


class Policies(_Strict):
    justificativa_min_caracteres: int = Field(ge=1, le=500)
    divergencia_min_caracteres: int = Field(ge=1, le=1000)
    evidencia_max_caracteres: int = Field(ge=50, le=5000)
    evidencias_max_por_pergunta: int = Field(ge=1, le=20)
    sugestoes_max_por_pergunta: int = Field(ge=0, le=10)


class Source(_Strict):
    id: str
    titulo: str
    referencia: str | None = None
    observacao: str | None = None

    _id = field_validator("id")(_slug)


class ClassificationOption(_Strict):
    id: str
    rotulo: str
    descricao: str
    exemplo: str

    _id = field_validator("id")(_slug)


class Classification(_Strict):
    pergunta: str
    ajuda: str
    fonte: str
    opcoes: list[ClassificationOption] = Field(min_length=2)


class Criterion(_Strict):
    id: str
    rotulo: str
    pergunta: str
    definicao: str
    exemplo_sim: str
    exemplo_nao: str
    evidencia_suficiente: str
    fonte: str
    palavras_chave: list[str] = Field(default_factory=list)

    _id = field_validator("id")(_slug)

    @field_validator("palavras_chave")
    @classmethod
    def _keywords(cls, v: list[str]) -> list[str]:
        cleaned = [k.strip() for k in v]
        if any(not k for k in cleaned):
            raise ValueError("palavras_chave não pode conter itens vazios")
        if len(set(k.lower() for k in cleaned)) != len(cleaned):
            raise ValueError("palavras_chave contém itens repetidos")
        return cleaned


class NaoRotinaQuestion(_Strict):
    id: str
    ordem: int = Field(ge=1)
    pergunta: str
    ajuda: str
    palavras_chave: list[str] = Field(default_factory=list)

    _id = field_validator("id")(_slug)


class ExclusionItem(_Strict):
    id: str
    rotulo: str
    descricao: str

    _id = field_validator("id")(_slug)


class Exclusions(_Strict):
    ordem: int = Field(ge=1)
    pergunta: str
    ajuda: str
    fonte: str
    itens: list[ExclusionItem] = Field(min_length=1)


class NaoRotina(_Strict):
    titulo: str
    ajuda: str
    fonte: str
    perguntas: list[NaoRotinaQuestion] = Field(min_length=1)
    exclusoes: Exclusions

    @model_validator(mode="after")
    def _ordering(self) -> NaoRotina:
        orders = [q.ordem for q in self.perguntas] + [self.exclusoes.ordem]
        if sorted(orders) != list(range(1, len(orders) + 1)):
            raise ValueError("as ordens da prova de não rotina devem ser 1..N, sem lacunas nem repetições")
        return self


class IndicativeOutcome(_Strict):
    id: str
    rotulo: str
    descricao: str
    parecer_alinhado: str

    _id = field_validator("id")(_slug)


class Condition(_Strict):
    algum_criterio: AnswerValue | None = None
    todos_criterios: AnswerValue | None = None
    exclusao_marcada: bool | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> Condition:
        if self.algum_criterio is None and self.todos_criterios is None and self.exclusao_marcada is None:
            raise ValueError("a condição 'quando' precisa de ao menos um critério")
        return self

    def matches(self, answers: tuple[AnswerValue, ...], exclusion_marked: bool) -> bool:
        if self.algum_criterio is not None and self.algum_criterio not in answers:
            return False
        if self.todos_criterios is not None and any(a != self.todos_criterios for a in answers):
            return False
        return self.exclusao_marcada is None or self.exclusao_marcada == exclusion_marked


class IndicativeRule(_Strict):
    id: str
    quando: Condition
    resultado: str
    motivo: str = Field(min_length=10)

    @field_validator("id")
    @classmethod
    def _rule_id(cls, v: str) -> str:
        if not re.match(r"^[A-Z]{2,5}-\d{2,3}$", v):
            raise ValueError(f"id de regra '{v}' inválido (formato esperado: IND-01)")
        return v


class Indicative(_Strict):
    aviso: str
    resultados: list[IndicativeOutcome] = Field(min_length=1)
    regras: list[IndicativeRule] = Field(min_length=1)


class OpinionOption(_Strict):
    id: str
    rotulo: str
    descricao: str

    _id = field_validator("id")(_slug)


class Opinion(_Strict):
    opcoes: list[OpinionOption] = Field(min_length=2)


class DossierConfig(_Strict):
    titulo: str
    subtitulo: str
    ressalva: str = Field(min_length=10)


class GlossaryEntry(_Strict):
    termo: str
    definicao: str


class RuleBase(_Strict):
    schema_: Literal[1] = Field(alias="schema")
    metadados: Metadata
    politicas: Policies
    fontes: list[Source] = Field(min_length=1)
    classificacao: Classification
    criterios: list[Criterion] = Field(min_length=1)
    nao_rotina: NaoRotina
    indicativo: Indicative
    parecer: Opinion
    dossie: DossierConfig
    glossario: list[GlossaryEntry] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    # ------------------------------------------------------------------ helpers
    @property
    def version(self) -> str:
        return self.metadados.versao

    def source(self, source_id: str) -> Source:
        return next(s for s in self.fontes if s.id == source_id)

    def criterion(self, criterion_id: str) -> Criterion:
        return next(c for c in self.criterios if c.id == criterion_id)

    def outcome(self, outcome_id: str) -> IndicativeOutcome:
        return next(o for o in self.indicativo.resultados if o.id == outcome_id)

    def opinion_option(self, option_id: str) -> OpinionOption:
        return next(o for o in self.parecer.opcoes if o.id == option_id)

    # ------------------------------------------------------- semantic checks
    @model_validator(mode="after")
    def _semantic(self) -> RuleBase:
        errors: list[str] = []

        def unique(label: str, ids: list[str]) -> None:
            dupes = sorted({i for i in ids if ids.count(i) > 1})
            if dupes:
                errors.append(f"{label}: ids repetidos {dupes}")

        source_ids = {s.id for s in self.fontes}
        unique("fontes", [s.id for s in self.fontes])
        unique("classificacao.opcoes", [o.id for o in self.classificacao.opcoes])
        unique("criterios", [c.id for c in self.criterios])
        unique("nao_rotina.perguntas", [q.id for q in self.nao_rotina.perguntas])
        unique("nao_rotina.exclusoes.itens", [i.id for i in self.nao_rotina.exclusoes.itens])
        unique("indicativo.resultados", [o.id for o in self.indicativo.resultados])
        unique("indicativo.regras", [r.id for r in self.indicativo.regras])
        unique("parecer.opcoes", [o.id for o in self.parecer.opcoes])

        referenced_sources = [
            ("classificacao", self.classificacao.fonte),
            ("nao_rotina", self.nao_rotina.fonte),
            ("nao_rotina.exclusoes", self.nao_rotina.exclusoes.fonte),
            *((f"criterios.{c.id}", c.fonte) for c in self.criterios),
        ]
        for where, ref in referenced_sources:
            if ref not in source_ids:
                errors.append(f"{where}: fonte '{ref}' não existe em 'fontes'")

        outcome_ids = {o.id for o in self.indicativo.resultados}
        opinion_ids = {o.id for o in self.parecer.opcoes}
        for outcome in self.indicativo.resultados:
            if outcome.parecer_alinhado not in opinion_ids:
                errors.append(f"indicativo.resultados.{outcome.id}: parecer_alinhado '{outcome.parecer_alinhado}' não existe em 'parecer.opcoes'")
        for rule in self.indicativo.regras:
            if rule.resultado not in outcome_ids:
                errors.append(f"indicativo.regras.{rule.id}: resultado '{rule.resultado}' não existe")

        if errors:
            raise ValueError("; ".join(errors))

        self._prove_total_coverage()
        return self

    def _prove_total_coverage(self) -> None:
        """Garante que toda combinação possível de respostas produz um indicativo.

        Com N critérios há 3^N combinações, cada uma com ou sem exclusão marcada.
        Se alguma combinação ficar sem regra, o analista ficaria sem indicativo
        num caso real: recusamos o arquivo no carregamento, nunca em produção.
        """
        uncovered: list[str] = []
        for combo in itertools.product(ANSWER_VALUES, repeat=len(self.criterios)):
            for exclusion in (False, True):
                if not any(r.quando.matches(combo, exclusion) for r in self.indicativo.regras):
                    uncovered.append(f"{dict(zip((c.id for c in self.criterios), combo, strict=True))} exclusão={exclusion}")
        if uncovered:
            sample = "; ".join(uncovered[:3])
            raise ValueError(f"a lógica do indicativo não cobre {len(uncovered)} combinação(ões) de respostas. Exemplos: {sample}")

    def coverage_size(self) -> int:
        return (3 ** len(self.criterios)) * 2
