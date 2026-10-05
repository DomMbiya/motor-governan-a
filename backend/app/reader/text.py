"""Normalização de texto usada para verificar evidências e casar palavras-chave.

A verificação compara o trecho selecionado no navegador (pdf.js) com o texto
extraído no servidor (PyMuPDF). Os dois motores diferem em quebras de linha,
espaços e ligaduras tipográficas; por isso comparamos sem espaços, em NFKC e
sem diferença entre maiúsculas e minúsculas. O conteúdo continua exato.
"""

from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")
_SOFT = dict.fromkeys(map(ord, "\u00ad\u200b\u200c\u200d\ufeff"), None)


def for_matching(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_SOFT).casefold()
    return _WS.sub("", text)


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def for_keywords(text: str) -> str:
    return _WS.sub(" ", strip_accents(unicodedata.normalize("NFKC", text)).casefold()).strip()


def collapse_ws(text: str) -> str:
    return _WS.sub(" ", text).strip()
