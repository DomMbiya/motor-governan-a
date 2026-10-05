"""Verificação de que cada evidência existe de fato no documento.

É o que impede a análise de virar um questionário respondido de memória:
um trecho só conta se estiver na página (ou parágrafo) indicada.
"""

from __future__ import annotations

from app.domain.models import DocumentContent, DocumentInfo, Evidence
from app.reader.text import for_matching


def verify(evidence: Evidence, info: DocumentInfo | None, content: DocumentContent | None) -> tuple[bool, str | None]:
    if info is None or content is None:
        return False, "Nenhum documento foi carregado para esta análise."
    needle = for_matching(evidence.text)
    if len(needle) < 3:
        return False, "O trecho é curto demais para servir de evidência."
    loc = evidence.locator
    if info.view == "pdf":
        if loc.page is None or not 1 <= loc.page <= len(content.pages):
            return False, f"A página {loc.page} não existe no documento."
        if needle in for_matching(content.pages[loc.page - 1]):
            return True, None
        return False, f"O trecho não foi encontrado na página {loc.page} do documento."
    if loc.paragraph is None or not 1 <= loc.paragraph <= len(content.paragraphs):
        return False, f"O parágrafo {loc.paragraph} não existe no documento."
    paragraph = content.paragraphs[loc.paragraph - 1]
    if needle in for_matching(paragraph.text):
        return True, None
    return False, f"O trecho não foi encontrado no parágrafo {loc.paragraph} do documento."
