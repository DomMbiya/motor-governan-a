"""Gera o relatório de um projeto FICTÍCIO criado pela equipe para a demonstração.

Conforme a seção 8 da proposta, a demo pública não usa a massa de dados
oficial do evento. Este documento imita o formato de um relatório de projeto
interno, com trechos que sustentam (e um que tensiona) os critérios.

Uso: python scripts/gerar_projeto_ficticio.py [saida.pdf]
"""

from __future__ import annotations

import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

SECTIONS: list[tuple[str, list[str]]] = [
    (
        "Relatório Técnico de Projeto — PRJ-2025-017 (documento fictício)",
        [
            "Projeto: Modelo preditivo de risco climático para o microcrédito rural. Área responsável: Superintendência de Inovação e Dados. Período: março de 2025 a agosto de 2025.",
            "Este documento é fictício e foi criado pela equipe do hackathon exclusivamente para demonstração. Não contém dados reais de clientes nem informações fiscais.",
            "Resumo. O projeto investigou se a combinação de séries climáticas, imagens de satélite e histórico de pagamentos permitiria antecipar, com pelo menos 90 dias, o risco de atraso em operações de microcrédito rural no semiárido.",
        ],
    ),
    (
        "1. Contexto e soluções existentes",
        [
            "As soluções disponíveis no mercado para análise de crédito rural utilizam modelos de escore treinados com dados cadastrais e não incorporam variáveis climáticas locais.",
            "A equipe avaliou três alternativas comerciais. Nenhuma atendia ao problema, pois todas exigiam histórico de produção declarado, informação que pequenos produtores do semiárido raramente possuem. Essa limitação técnica impedia o uso direto das ferramentas existentes.",
            "Não há solução pronta que relacione estiagem prolongada, índice de vegetação e comportamento de pagamento no nível do município.",
        ],
    ),
    (
        "2. Hipótese e objetivos",
        [
            "Formulamos a hipótese de que a queda do índice de vegetação medido por satélite antecede em cerca de três meses o aumento de atrasos nas parcelas do microcrédito rural.",
            "O objetivo foi construir e validar um modelo que transformasse essa hipótese em um sinal de alerta antecipado, algo que a área de crédito não conseguia produzir com as ferramentas atuais.",
        ],
    ),
    (
        "3. Incerteza técnica",
        [
            "Não havia garantia de que o modelo atingiria a precisão mínima exigida pela área de risco, de 75% de sensibilidade com no máximo 20% de falsos alarmes.",
            "O principal obstáculo técnico era a baixa resolução temporal das imagens de satélite em períodos chuvosos, quando a cobertura de nuvens elimina parte das observações. Não se sabia se técnicas de interpolação preservariam o sinal necessário.",
            "Também era desconhecido se o comportamento de pagamento responderia ao clima de forma estável entre municípios com perfis produtivos diferentes.",
        ],
    ),
    (
        "4. Metodologia",
        [
            "A metodologia seguiu um protocolo experimental em quatro rodadas. Cada rodada teve plano de trabalho, métricas definidas previamente e registro dos resultados em ata técnica.",
            "Os experimentos compararam três famílias de modelos com validação temporal, sempre treinando com dados anteriores ao período avaliado para evitar vazamento de informação.",
            "O cronograma previa a revisão das hipóteses ao final de cada rodada, com decisão registrada sobre continuar, ajustar ou encerrar a linha de investigação.",
        ],
    ),
    (
        "5. Resultados e conhecimento gerado",
        [
            "Constatamos que a interpolação simples destruía o sinal climático; somente a combinação com dados de estações meteorológicas recuperou a capacidade preditiva.",
            "Aprendemos que o sinal é forte em municípios dependentes de lavoura de sequeiro e fraco onde predomina a pecuária, um resultado negativo que redefine o escopo de uso do modelo.",
            "O modelo final atingiu 78% de sensibilidade com 18% de falsos alarmes na validação temporal.",
        ],
    ),
    (
        "6. Reprodutibilidade",
        [
            "Todo o código, os parâmetros e as versões dos dados estão documentados no repositório interno do projeto, com instruções para reproduzir cada rodada experimental.",
            "Um relatório técnico detalhado foi produzido para permitir que outra equipe replique os testes e transfira o conhecimento para outras linhas de crédito.",
        ],
    ),
    (
        "7. Atividades de suporte",
        [
            "Parte do esforço foi dedicada à configuração do painel de monitoramento adquirido de um fornecedor, usado apenas para exibir os alertas gerados pelo modelo.",
            "Essa configuração seguiu o manual do fornecedor e não envolveu desenvolvimento técnico novo.",
        ],
    ),
]


def build_pdf(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = ParagraphStyle("b", fontName="Helvetica", fontSize=10.5, leading=15, spaceAfter=8)
    head = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=13, leading=17, spaceAfter=10, spaceBefore=4)
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    story: list = []
    for i, (title, paragraphs) in enumerate(SECTIONS):
        story.append(Paragraph(title, head))
        story += [Paragraph(p, body) for p in paragraphs]
        story.append(Spacer(1, 6))
        if i in (2, 4):
            story.append(PageBreak())
    doc.build(story)
    return path


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "amostras" / "projeto_ficticio_PRJ-2025-017.pdf"
    print(build_pdf(out))
