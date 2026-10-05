# Motor Determinístico Focado em Governança

Apoio à decisão para a **análise preliminar** de enquadramento de projetos na Lei do Bem, feito para a equipe interna de P&D do BNB (Hackathon STS 2026).

**O processo é determinístico; a decisão é humana.** O sistema conduz as sete etapas sempre na mesma ordem. Ele bloqueia respostas sem evidência do documento e calcula um *indicativo*. Quem emite e assina o parecer é o analista, e o dossiê registra tudo com hash de integridade.

## Como rodar

### Com Docker (recomendado para a demo)

```bash
docker compose up --build
# abra http://localhost:3000
```

A API roda numa rede interna sem saída para a internet, e a interface só escuta em `127.0.0.1`. Nada sai da máquina.

### Sem Docker (desenvolvimento)

```bash
# API: Python 3.12
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# Interface: Node 20
cd frontend
npm install          # copia o worker do pdf.js para /public (sem CDN)
npm run dev          # http://localhost:3000, com proxy de /api para a porta 8000
```

O Plano B de formatos usa ferramentas locais opcionais: LibreOffice converte DOCX e Tesseract (`tesseract-ocr-por`) faz o OCR de PDFs escaneados. A imagem Docker já traz os dois. Sem eles, o sistema recusa esses formatos com uma mensagem clara.

### Testes e qualidade

```bash
cd backend && pytest && ruff check app tests scripts      # 25 testes
cd frontend && npm run typecheck && npm run lint && npm run build
```

## Roteiro da demo (pitch, 0:30 a 2:15)

Use o projeto fictício `amostras/projeto_ficticio_PRJ-2025-017.pdf`, criado pela equipe. A demo pública não usa a massa de dados oficial do evento.

1. **Nova análise.** Preencha nome, projeto e área, carregue o PDF e confirme a ciência sobre a LGPD. A abertura registra analista, data, versão das regras e o SHA-256 do documento.
2. **Classificação.** Escolha "Desenvolvimento experimental" e **selecione com o mouse**, no PDF, o trecho "Formulamos a hipótese…". No popover, clique em *Anexar evidência*: o trecho aparece como "Conferido no documento", com a página.
3. **Critérios de Frascati.** Para cada critério, abra *trechos candidatos do assistente de leitura* e confirme um. Marque **"Havia incerteza?" como Inconclusivo** e mostre o aviso de que o ponto irá para o especialista.
4. **Não rotina.** Responda as três perguntas e marque a exclusão "Comprar e configurar software pronto", explicando o conflito.
5. **Quadro-resumo.** O indicativo é "Requer especialista" (regra IND-02). Clique numa página da tabela: o documento rola até o trecho.
6. **Parecer.** Escolha "Enquadra". A interface exige a justificativa da divergência. Assine.
7. **Dossiê.** O selo aparece com o hash do conteúdo. Clique em *Verificar integridade* (três checagens aprovadas) e mostre o PDF à esquerda.

**Fechamento técnico (opcional).** Em `/regras`, mostre a lógica do indicativo e a prova de cobertura das 486 combinações. Depois copie `backend/rules/regras_v1.0.0.yaml` para `regras_v1.1.0.yaml`, mude a versão, acrescente uma linha no changelog e altere um texto de ajuda. Ao recarregar a página, a versão 1.1.0 já está ativa. Análises antigas continuam presas à versão 1.0.0.

## Arquitetura

| Camada | Onde | Responsabilidade |
| --- | --- | --- |
| Interface | `frontend/` (Next.js 14, Tailwind, react-pdf) | Tela dividida, seleção de evidência com página e posição, wizard de sete etapas |
| API | `backend/app/api` (FastAPI) | Rotas finas que validam a entrada e delegam |
| Base de regras | `backend/rules/*.yaml` + `app/rules` | Perguntas, ajudas, fontes, palavras-chave e lógica do indicativo; validação e versionamento |
| Camada Leitora | `app/ingestion`, `app/reader` | Extração local (PyMuPDF, LibreOffice, Tesseract) e sugestão de trechos por palavras-chave |
| Camada de Validação | `app/validation`, `app/rules/engine.py` | Bloqueia pendências, confere evidências contra o documento e calcula o indicativo |
| Camada Geradora | `app/dossier` | Conteúdo canônico com SHA-256 e PDF do dossiê (ReportLab) |
| Auditoria | `app/audit`, `app/persistence` | SQLite com registros encadeados por hash e gatilhos que impedem alterações |

## Decisões de implementação

- **Hash do dossiê.** Um PDF não pode conter o próprio hash. O dossiê imprime o SHA-256 do *conteúdo canônico* (respostas, evidências, regras e parecer). O SHA-256 do *arquivo PDF* fica no log de auditoria, e a verificação confere os dois e a cadeia inteira.
- **Evidência verificável.** Cada trecho é conferido no servidor contra o texto extraído da página ou do parágrafo indicado. Um trecho escrito de memória é recusado, e é isso que impede a análise de virar um questionário solto.
- **Regras imutáveis por versão.** Cada versão é registrada com o checksum do arquivo. Um arquivo alterado sem mudança de versão é recusado, porque um dossiê antigo nunca pode passar a apontar para regras diferentes.
- **Cobertura provada.** Ao carregar o YAML, o validador testa todas as combinações de respostas (3^5 × 2 = 486) e recusa regras que deixem algum caso sem indicativo.
- **Imutabilidade no banco.** Gatilhos do SQLite recusam UPDATE e DELETE na trilha de auditoria e em análises finalizadas, mesmo fora da aplicação.
- **"IA" honesta.** No MVP, o assistente é heurístico (palavras-chave da base de regras). Ele só aponta trechos, nunca responde critérios, e o dossiê registra o que foi sugerido e confirmado.
- **Acessibilidade.** Toda seleção com o mouse tem alternativa por teclado: *Informar trecho*, verificado pelo servidor, e o botão de anexar parágrafo no modo texto. Também há foco visível, `prefers-reduced-motion` e rótulos para leitores de tela.

## Dados e LGPD

- O único dado pessoal tratado é o nome do analista.
- Os logs não registram conteúdo de documentos nem respostas.
- Ao fim do evento, rode `./scripts/apagar_dados_do_evento.sh` para apagar documentos, análises, dossiês e a trilha de auditoria. A base de regras é mantida.

## Fora do MVP (próximos passos, conforme a seção 10 da proposta)

- Modelo de linguagem local, se a organização permitir.
- Integração com os sistemas do banco.
- Perfis de revisor e aprovador.
- Assinatura digital.

Antes do Dia 1, confirme com o material oficial a redação do decreto e o número da instrução normativa. As fontes estão sinalizadas como "a confirmar" no YAML e no dossiê.
