"use client";

import clsx from "clsx";
import { FileText, Highlighter, Minus, Paperclip, Plus, ScanText, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import type { Paragraph } from "@/lib/types";
import type { Overlay, TextSelectionInfo } from "./PdfViewer";
import type { ParagraphSelection } from "./TextViewer";

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-ink-muted"><Spinner label="Preparando o visualizador…" /></div>,
});
const TextViewer = dynamic(() => import("./TextViewer"), { ssr: false });

const ZOOMS = [0.75, 0.9, 1, 1.15, 1.3, 1.5];

type Selection = (TextSelectionInfo & { paragraph?: undefined }) | ParagraphSelection;

export function DocumentPane({ mode }: { mode: "project" | "dossier" }) {
  const ws = useWorkspace();
  const { notify } = useToast();
  const { view, draft, target, highlights, setHighlights, readOnly } = ws;
  const doc = view.document;
  const [zoomIdx, setZoomIdx] = useState(2);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(doc?.page_count ?? 0);

  const selectable = mode === "project" && !readOnly;
  const terms = useMemo(() => (highlights && target ? target.keywords : []), [highlights, target]);

  // Todas as evidências do rascunho, destacadas na página; as da pergunta ativa em cor plena.
  const { overlays, marked } = useMemo(() => {
    const out: Overlay[] = [];
    const paras: { paragraph: number; id: string }[] = [];
    const push = (step: string, key: string, evs: typeof draft.classification.evidences) =>
      evs.forEach((e) => {
        const active = target?.step === step && target.key === key;
        if (e.locator.page && e.locator.rects.length) out.push({ id: e.id, page: e.locator.page, rects: e.locator.rects, tone: active ? "active" : "muted" });
        if (e.locator.paragraph && active) paras.push({ paragraph: e.locator.paragraph, id: e.id });
      });
    push("classificacao", "classificacao", draft.classification.evidences);
    Object.entries(draft.criteria).forEach(([k, c]) => push("criterios", k, c.evidences));
    Object.entries(draft.nao_rotina.answers).forEach(([k, a]) => push("nao_rotina", k, a.evidences));
    return { overlays: out, marked: paras };
  }, [draft, target]);

  const clear = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, clear]);

  const attach = () => {
    if (!selection) return;
    const ok = ws.addEvidence({
      text: selection.text,
      origin: "selecionado_analista",
      locator: { page: selection.page, paragraph: selection.paragraph ?? null, rects: selection.rects },
    });
    if (ok) clear();
  };

  const attachParagraph = (p: Paragraph) =>
    ws.addEvidence({ text: p.text, origin: "selecionado_analista", locator: { page: p.page, paragraph: p.n, rects: [] } });

  if (!doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-ink-muted">
        <FileText className="h-8 w-8 text-ink-faint" aria-hidden="true" />
        <p className="font-medium text-ink">Nenhum documento carregado</p>
        <p className="max-w-xs text-[13px]">Carregue o relatório do projeto na etapa de abertura. A análise inteira se apoia nele.</p>
      </div>
    );
  }

  const isPdf = mode === "dossier" || doc.view === "pdf";
  const url = mode === "dossier" ? `/api/analyses/${view.id}/dossier.pdf` : `/api/analyses/${view.id}/document/file`;

  return (
    <section aria-label={mode === "dossier" ? "Dossiê gerado" : "Material do projeto"} className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-white px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={doc.original_filename}>
            {mode === "dossier" ? "Dossiê de análise preliminar" : doc.original_filename}
          </p>
          <p className="text-2xs text-ink-muted">
            {mode === "dossier"
              ? "PDF gerado e registrado na trilha de auditoria"
              : doc.view === "pdf"
                ? `Página ${currentPage} de ${pageCount || doc.page_count}`
                : `${doc.paragraph_count} parágrafos numerados${doc.ocr_applied ? ", texto obtido por OCR local" : ""}`}
          </p>
        </div>
        {mode === "project" && (
          <button
            type="button"
            onClick={() => setHighlights(!highlights)}
            aria-pressed={highlights}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] transition-colors",
              highlights ? "bg-inc-bg text-inc" : "text-ink-muted hover:bg-paper",
            )}
            title="Destaca no documento as palavras-chave da pergunta aberta"
          >
            <Highlighter className="h-3.5 w-3.5" aria-hidden="true" /> Destaques do assistente
          </button>
        )}
        {isPdf && (
          <div className="flex items-center rounded-md border border-line" role="group" aria-label="Zoom">
            <button type="button" className="p-1.5 text-ink-soft hover:text-ink disabled:text-ink-faint" disabled={zoomIdx === 0} onClick={() => setZoomIdx((i) => i - 1)} aria-label="Diminuir zoom">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-11 text-center text-2xs tabular-nums text-ink-soft" aria-live="polite">{Math.round((ZOOMS[zoomIdx] ?? 1) * 100)}%</span>
            <button type="button" className="p-1.5 text-ink-soft hover:text-ink disabled:text-ink-faint" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx((i) => i + 1)} aria-label="Aumentar zoom">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {mode === "project" && (doc.warnings.length > 0 || doc.ocr_applied) && (
        <div className="flex items-start gap-2 border-b border-inc-line bg-inc-bg px-4 py-2 text-[12.5px] text-inc">
          {doc.ocr_applied ? <ScanText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p>{doc.warnings.join(" ")}</p>
        </div>
      )}

      {selectable && !target && (
        <p className="border-b border-line bg-petrol-50 px-4 py-1.5 text-[12.5px] text-petrol-700">
          Abra uma pergunta à direita para anexar trechos deste documento como evidência.
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        {isPdf ? (
          <PdfViewer
            key={url}
            url={url}
            zoom={ZOOMS[zoomIdx] ?? 1}
            selectable={selectable}
            highlightTerms={mode === "project" ? terms : []}
            overlays={mode === "project" ? overlays : []}
            jump={mode === "project" ? ws.jump : null}
            onPageCount={setPageCount}
            onVisiblePage={setCurrentPage}
            onSelection={setSelection}
            onSelectionError={(m) => notify("info", "Seleção inválida", m)}
          />
        ) : (
          <TextViewer
            analysisId={view.id}
            selectable={selectable}
            canAttach={selectable && Boolean(target)}
            highlightTerms={terms}
            marked={marked}
            jump={ws.jump}
            onSelection={setSelection}
            onSelectionError={(m) => notify("info", "Seleção inválida", m)}
            onAttachParagraph={attachParagraph}
          />
        )}

        {selection && (
          <div
            role="dialog"
            aria-label="Anexar trecho selecionado"
            className="absolute z-20 w-[320px] animate-pop-in rounded-lg border border-line bg-white p-3 shadow-float"
            style={{ top: Math.max(8, selection.top), left: Math.max(8, selection.left) }}
          >
            <p className="line-clamp-3 text-[12.5px] italic leading-snug text-ink-soft">“{selection.text}”</p>
            <p className="mt-2 text-2xs text-ink-muted">
              {selection.paragraph ? `Parágrafo ${selection.paragraph}` : `Página ${selection.page}`}
              {target ? <> · anexar a <span className="font-medium text-ink">{target.label}</span></> : " · nenhuma pergunta aberta"}
            </p>
            <div className="mt-2.5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={clear}>Cancelar</Button>
              <Button size="sm" variant="primary" disabled={!target} onClick={attach} icon={<Paperclip className="h-3.5 w-3.5" />} autoFocus>
                Anexar evidência
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
