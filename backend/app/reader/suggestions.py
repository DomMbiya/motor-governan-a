"""Assistente de leitura (Camada Leitora, parte 2).

Destaca trechos candidatos a evidência usando as palavras-chave da base de
regras. Ele NUNCA responde um critério: apenas aponta onde olhar. Qualquer
trecho sugerido só vira evidência depois que o analista o confirma, e o dossiê
registra essa origem.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.domain.hashing import sha256_text
from app.domain.models import DocumentContent, DocumentInfo
from app.reader.text import collapse_ws, for_keywords
from app.rules.schema import RuleBase

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\"“(])")
MIN_LEN, MAX_LEN = 40, 600


@dataclass(frozen=True)
class Suggestion:
    id: str
    target: str  # "criterio:<id>" | "nao_rotina:<id>"
    text: str
    page: int | None
    paragraph: int | None
    keywords: tuple[str, ...]
    score: int


@dataclass(frozen=True)
class _Unit:
    text: str
    page: int | None
    paragraph: int | None
    norm: str


_TERMINAL = tuple('.;:!?,)\u201d"')


def _is_heading(line: str, next_line: str | None) -> bool:
    """Título de seção: linha curta, sem pontuação final, seguida de linha que começa com maiúscula."""
    line = line.strip()
    return (
        0 < len(line) <= 80
        and not line.endswith(_TERMINAL)
        and (next_line is None or next_line.strip()[:1].isupper() or next_line.strip()[:1].isdigit())
        and (line[:1].isupper() or line[:1].isdigit())
    )


def _pdf_blocks(page: str) -> list[str]:
    """Agrupa as linhas da página em blocos de prosa, separando títulos de seção."""
    lines = [ln for ln in page.splitlines() if ln.strip()]
    blocks: list[str] = []
    current: list[str] = []
    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if _is_heading(line, nxt) and (not current or current[-1].rstrip().endswith(_TERMINAL)):
            if current:
                blocks.append(" ".join(current))
                current = []
            blocks.append(line)
            continue
        current.append(line.strip())
    if current:
        blocks.append(" ".join(current))
    return [collapse_ws(b) for b in blocks]


def _units(info: DocumentInfo, content: DocumentContent) -> list[_Unit]:
    units: list[_Unit] = []
    if info.view == "pdf":
        for page_no, page in enumerate(content.pages, start=1):
            for block in _pdf_blocks(page):
                for sentence in _SENTENCE_SPLIT.split(block):
                    s = sentence.strip()
                    if MIN_LEN <= len(s) <= MAX_LEN:
                        units.append(_Unit(s, page_no, None, for_keywords(s)))
    else:
        for p in content.paragraphs:
            for sentence in _SENTENCE_SPLIT.split(p.text):
                s = sentence.strip()
                if MIN_LEN <= len(s) <= MAX_LEN:
                    units.append(_Unit(s, p.page, p.n, for_keywords(s)))
    return units


def _pattern(keyword: str) -> re.Pattern[str]:
    return re.compile(rf"(?<!\w){re.escape(for_keywords(keyword))}(?!\w)")


def suggest(rules: RuleBase, info: DocumentInfo, content: DocumentContent) -> list[Suggestion]:
    units = _units(info, content)
    limit = rules.politicas.sugestoes_max_por_pergunta
    targets = [(f"criterio:{c.id}", c.palavras_chave) for c in rules.criterios]
    targets += [(f"nao_rotina:{q.id}", q.palavras_chave) for q in rules.nao_rotina.perguntas]

    out: list[Suggestion] = []
    for target, keywords in targets:
        if not keywords or limit == 0:
            continue
        patterns = [(k, _pattern(k)) for k in keywords]
        scored: list[tuple[int, int, _Unit, tuple[str, ...]]] = []
        for idx, unit in enumerate(units):
            hits = tuple(k for k, pat in patterns if pat.search(unit.norm))
            if hits:
                scored.append((len(hits), -idx, unit, hits))
        scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
        for score, _, unit, hits in scored[:limit]:
            sid = sha256_text(f"{target}|{unit.page}|{unit.paragraph}|{unit.text}")[:16]
            out.append(Suggestion(sid, target, unit.text, unit.page, unit.paragraph, hits, score))
    return out
