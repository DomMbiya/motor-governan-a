"""Renderização do dossiê em PDF (ReportLab).

O PDF precisa ser lido por alguém que não participou da análise, talvez
anos depois. Por isso cada bloco responde sozinho: qual regra, qual trecho do
documento (com página), quem decidiu e quando.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.domain.clock import display

INK = colors.HexColor("#132A30")
PETROL = colors.HexColor("#0E5563")
MUTED = colors.HexColor("#5B6B70")
RULE = colors.HexColor("#D5DDDC")
PAPER = colors.HexColor("#F3F6F5")
ANSWER_COLORS = {"sim": colors.HexColor("#2C7A57"), "nao": colors.HexColor("#B03A35"), "inconclusivo": colors.HexColor("#9A6210")}
OUTCOME_COLORS = {"favoravel": ANSWER_COLORS["sim"], "desfavoravel": ANSWER_COLORS["nao"], "requer_especialista": ANSWER_COLORS["inconclusivo"]}
AMBER_BG = colors.HexColor("#FBF3E4")

_FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")


def _register_fonts() -> tuple[str, str, str]:
    files = {"Dossie": "DejaVuSans.ttf", "Dossie-Bold": "DejaVuSans-Bold.ttf", "Dossie-Mono": "DejaVuSansMono.ttf"}
    if all((_FONT_DIR / f).exists() for f in files.values()):
        for name, f in files.items():
            if name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(name, str(_FONT_DIR / f)))
        return "Dossie", "Dossie-Bold", "Dossie-Mono"
    return "Helvetica", "Helvetica-Bold", "Courier"


REGULAR, BOLD, MONO = _register_fonts()


def _styles() -> dict[str, ParagraphStyle]:
    base = ParagraphStyle("base", fontName=REGULAR, fontSize=9.5, leading=13.5, textColor=INK, alignment=TA_LEFT)
    return {
        "base": base,
        "title": ParagraphStyle("title", parent=base, fontName=BOLD, fontSize=17, leading=21, textColor=colors.white),
        "subtitle": ParagraphStyle("subtitle", parent=base, fontSize=9.5, leading=13, textColor=colors.HexColor("#CFE3E6")),
        "h2": ParagraphStyle("h2", parent=base, fontName=BOLD, fontSize=12, leading=16, textColor=PETROL, spaceBefore=12, spaceAfter=6),
        "h3": ParagraphStyle("h3", parent=base, fontName=BOLD, fontSize=10, leading=14, spaceBefore=6, spaceAfter=2),
        "label": ParagraphStyle("label", parent=base, fontSize=8, leading=11, textColor=MUTED),
        "small": ParagraphStyle("small", parent=base, fontSize=8.5, leading=12, textColor=MUTED),
        "quote": ParagraphStyle("quote", parent=base, fontSize=9, leading=13, textColor=INK),
        "mono": ParagraphStyle("mono", parent=base, fontName=MONO, fontSize=7.6, leading=10.5),
        "badge": ParagraphStyle("badge", parent=base, fontName=BOLD, fontSize=9, leading=12, textColor=colors.white),
    }


S = _styles()


def _p(text: Any, style: str = "base") -> Paragraph:
    return Paragraph(escape("" if text is None else str(text)).replace("\n", "<br/>"), S[style])


def _kv_table(rows: list[tuple[str, Any]], widths: tuple[float, float] = (42 * mm, 132 * mm), mono_keys: tuple[str, ...] = ()) -> Table:
    data = [[_p(k, "label"), _p(v, "mono" if k in mono_keys else "base")] for k, v in rows]
    t = Table(data, colWidths=widths, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return t


def _badge(text: str, color: colors.Color) -> Table:
    t = Table([[_p(text, "badge")]], hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), color),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return t


def _location(ev: dict[str, Any]) -> str:
    parts = []
    if ev["pagina"]:
        parts.append(f"p. {ev['pagina']}")
    if ev["paragrafo"]:
        parts.append(f"§ {ev['paragrafo']}")
    return ", ".join(parts)


def _evidence_block(ev: dict[str, Any], index: int) -> Table:
    meta = f"Trecho {index} ({_location(ev)}). Origem: {ev['origem_rotulo']}."
    if ev.get("palavras_chave"):
        meta += f" Palavras-chave: {ev['palavras_chave']}."
    meta += " Conferido no documento: " + ("sim." if ev["conferido_no_documento"] else "não.")
    t = Table([[_p(f"“{ev['texto']}”", "quote")], [_p(meta, "small")]], colWidths=[170 * mm], hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("LINEBEFORE", (0, 0), (0, -1), 2, PETROL),
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
            ]
        )
    )
    return t


def _evidences(evs: list[dict[str, Any]]) -> list:
    out: list = []
    for i, ev in enumerate(evs, start=1):
        out += [_evidence_block(ev, i), Spacer(1, 4)]
    return out


def _callout(flowables: list, bg: colors.Color, border: colors.Color) -> Table:
    t = Table([[f] for f in flowables], colWidths=[174 * mm], hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.8, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, 0), 7),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
            ]
        )
    )
    return t


class _NumberedCanvas(rl_canvas.Canvas):
    """Canvas com 'página X de Y' e rodapé de integridade em todas as páginas."""

    footer_note = ""
    short_hash = ""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved: list[dict] = []

    def showPage(self) -> None:  # noqa: N802 - API do ReportLab
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._footer(total)
            super().showPage()
        super().save()

    def _footer(self, total: int) -> None:
        w, _ = A4
        self.setStrokeColor(RULE)
        self.setLineWidth(0.5)
        self.line(18 * mm, 14 * mm, w - 18 * mm, 14 * mm)
        self.setFont(REGULAR, 7.5)
        self.setFillColor(MUTED)
        self.drawString(18 * mm, 9.5 * mm, self.footer_note)
        self.drawRightString(w - 18 * mm, 9.5 * mm, f"Conteúdo {self.short_hash}   |   Página {self._pageNumber} de {total}")


def _document_summary(docinfo: dict[str, Any]) -> str:
    size = f"{docinfo['paginas']} páginas" if docinfo["paginas"] else f"{docinfo['paragrafos']} parágrafos"
    ocr = ", OCR local" if docinfo["ocr"] else ""
    return f"{docinfo['arquivo']} ({size}{ocr})"


def render(dossier: dict[str, Any], *, content_hash: str, audit_seq: int, timezone: str) -> bytes:
    buf = BytesIO()
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
        title=dossier["titulo"],
        author=dossier["identificacao"]["analista"],
        subject=f"Análise {dossier['identificacao']['analise_id']}",
        creator="Motor Determinístico Focado em Governança",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main", leftPadding=0, rightPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])

    ident, base, docinfo = dossier["identificacao"], dossier["base_normativa"], dossier["documento_analisado"]
    ind, par = dossier["indicativo"], dossier["parecer"]
    story: list = []

    # Cabeçalho
    header = Table(
        [[_p(dossier["titulo"], "title")], [_p(f"{ident['projeto']} — {ident['area_responsavel']}", "subtitle")]],
        colWidths=[doc.width],
    )
    header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PETROL),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, 0), 12),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
            ]
        )
    )
    story += [header, Spacer(1, 8)]
    story.append(_callout([_p(dossier["ressalva"], "base")], AMBER_BG, colors.HexColor("#E4C489")))

    # 1. Identificação
    story.append(_p("1. Identificação", "h2"))
    story.append(
        _kv_table(
            [
                ("Projeto", ident["projeto"]),
                ("Área responsável", ident["area_responsavel"]),
                ("Analista", ident["analista"]),
                ("Análise aberta em", display(ident["aberta_em"], timezone)),
                ("Parecer assinado em", display(par["assinado_em"], timezone)),
                ("Identificador da análise", ident["analise_id"]),
            ],
            mono_keys=("Identificador da análise",),
        )
    )

    # 2. Integridade
    story.append(_p("2. Integridade e rastreabilidade", "h2"))
    story.append(
        _kv_table(
            [
                ("Hash do conteúdo (SHA-256)", content_hash),
                ("Registro de auditoria", f"nº {audit_seq} (cadeia de registros encadeados por hash)"),
                ("Base de regras", f"versão {base['versao_regras']}, vigente desde {base['vigencia']}"),
                ("Checksum das regras", base["checksum_arquivo_regras"]),
                (
                    "Documento analisado",
                    _document_summary(docinfo),
                ),
                ("SHA-256 do documento", docinfo["sha256"]),
            ],
            mono_keys=("Hash do conteúdo (SHA-256)", "Checksum das regras", "SHA-256 do documento"),
        )
    )
    story.append(Spacer(1, 3))
    story.append(
        _p(
            "O hash do conteúdo é calculado sobre todas as respostas, evidências, regras e o parecer deste dossiê. "
            "O hash do arquivo PDF fica registrado no log de auditoria. Qualquer alteração posterior é detectável.",
            "small",
        )
    )

    # 3. Base normativa
    story.append(_p("3. Base normativa utilizada", "h2"))
    for src in base["fontes"]:
        line = f"<b>{escape(src['titulo'])}</b>"
        if src.get("referencia"):
            line += f": {escape(src['referencia'])}"
        if src.get("observacao"):
            line += f" <font color='#9A6210'>({escape(src['observacao'])})</font>"
        story.append(Paragraph(line, S["base"]))
        story.append(Spacer(1, 2))

    # 4. Classificação
    cl = dossier["classificacao"]
    story.append(CondPageBreak(60 * mm))
    story.append(_p("4. Classificação da atividade", "h2"))
    story.append(
        _kv_table(
            [
                ("Categoria", cl["categoria"]),
                ("O que significa", cl["descricao"]),
                ("Justificativa", cl["justificativa"]),
                ("Regra de referência", cl["regra_referencia"]),
            ]
        )
    )
    story.append(Spacer(1, 4))
    story += _evidences(cl["evidencias"])

    # 5. Critérios
    story.append(CondPageBreak(60 * mm))
    story.append(_p("5. Critérios de Frascati", "h2"))
    for c in dossier["criterios_frascati"]:
        head = Table(
            [[_p(c["pergunta"], "h3"), _badge(c["resposta_rotulo"], ANSWER_COLORS[c["resposta"]])]],
            colWidths=[doc.width - 40 * mm, 40 * mm],
        )
        head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
        block = [head, _p(c["definicao"], "small"), Spacer(1, 3), _p(f"Justificativa: {c['justificativa']}"), Spacer(1, 4)]
        block += _evidences(c["evidencias"])
        block += [_p(f"Regra: {c['regra_referencia']}", "small"), Spacer(1, 8)]
        story.append(KeepTogether(block))

    # 6. Prova de não rotina
    nr = dossier["prova_nao_rotina"]
    story.append(CondPageBreak(60 * mm))
    story.append(_p("6. Prova de não rotina", "h2"))
    story.append(_p("Argumento estruturado: solução existente, obstáculo técnico, exclusões típicas e conhecimento gerado.", "small"))
    story.append(Spacer(1, 4))
    for a in nr["argumento"]:
        block = [_p(f"{a['ordem']}. {a['pergunta']}", "h3"), _p(a["resposta"]), Spacer(1, 4)]
        block += _evidences(a["evidencias"])
        story.append(KeepTogether(block))
    if nr["exclusoes_marcadas"]:
        labels = "; ".join(e["rotulo"] for e in nr["exclusoes_marcadas"])
        story.append(
            _callout(
                [_p("Exclusões típicas marcadas", "h3"), _p(labels), Spacer(1, 3), _p(f"Explicação do analista: {nr['explicacao_exclusoes']}")],
                AMBER_BG,
                colors.HexColor("#E4C489"),
            )
        )
    else:
        story.append(_p("Nenhuma exclusão típica foi marcada pelo analista.", "small"))
    story.append(_p(f"Regra: {nr['regra_referencia']}", "small"))

    # 7. Indicativo e parecer
    story.append(CondPageBreak(80 * mm))
    story.append(_p("7. Indicativo e parecer", "h2"))
    story.append(_p(ind["aviso"], "small"))
    story.append(Spacer(1, 6))
    ind_color = OUTCOME_COLORS.get(ind["resultado"], PETROL)
    story.append(
        _kv_table(
            [
                ("Indicativo calculado", ind["rotulo"]),
                ("Motivo", ind["motivo"]),
                ("Regra aplicada", f"{ind['regra_aplicada']} (base de regras v{base['versao_regras']})"),
            ]
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        Table(
            [[_badge(f"Parecer do analista: {par['decisao_rotulo']}", ind_color if not par["diverge_do_indicativo"] else INK)]],
            hAlign="LEFT",
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        _kv_table(
            [("Justificativa do parecer", par["justificativa"]), ("Assinado por", par["assinado_por"]), ("Data e hora", display(par["assinado_em"], timezone))]
        )
    )
    if par["diverge_do_indicativo"]:
        story.append(Spacer(1, 6))
        story.append(
            _callout(
                [
                    _p("O parecer diverge do indicativo calculado", "h3"),
                    _p(f"Indicativo: {ind['rotulo']}. Parecer: {par['decisao_rotulo']}."),
                    Spacer(1, 3),
                    _p(f"Justificativa da divergência: {par['justificativa_divergencia']}"),
                ],
                AMBER_BG,
                colors.HexColor("#C98A2B"),
            )
        )

    # 8. Pontos para especialista
    pts = dossier["pontos_para_especialista"]
    if pts:
        story.append(CondPageBreak(40 * mm))
        story.append(_p("8. Pontos para avaliação especializada", "h2"))
        story.append(_p("Itens a levar à consultoria especializada, com o registro já feito pelo analista.", "small"))
        story.append(Spacer(1, 4))
        for i, pt in enumerate(pts, start=1):
            kind = "Critério inconclusivo" if pt["tipo"] == "criterio" else "Exclusão típica marcada"
            story.append(_kv_table([(f"{i}. {kind}", pt["item"]), ("Registro do analista", pt["registro_do_analista"])]))
            story.append(Spacer(1, 4))

    story.append(Spacer(1, 10))
    story.append(_callout([_p(dossier["ressalva"], "base")], AMBER_BG, colors.HexColor("#E4C489")))

    class _Canvas(_NumberedCanvas):
        footer_note = "Dossiê de análise preliminar de enquadramento"
        short_hash = content_hash[:16]

    doc.build(story, canvasmaker=_Canvas)
    return buf.getvalue()
