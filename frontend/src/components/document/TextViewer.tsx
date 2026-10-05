"use client";

import clsx from "clsx";
import { Paperclip } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { Paragraph } from "@/lib/types";
import type { TextSelectionInfo } from "./PdfViewer";

export interface ParagraphSelection extends Omit<TextSelectionInfo, "page"> {
  page: number | null;
  paragraph: number;
}

interface Props {
  analysisId: string;
  selectable: boolean;
  canAttach: boolean;
  highlightTerms: string[];
  marked: { paragraph: number; id: string }[];
  jump: { paragraph: number | null; evidenceId: string | null; nonce: number } | null;
  onSelection: (sel: ParagraphSelection | null) => void;
  onSelectionError: (message: string) => void;
  onAttachParagraph: (p: Paragraph) => void;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Plano B de formatos (DOCX sem conversão, OCR, TXT, CSV, XLSX):
 * o texto aparece em parágrafos numerados e a evidência cita o número do parágrafo.
 * Cada parágrafo tem um botão de anexar acessível por teclado.
 */
export default function TextViewer({ analysisId, selectable, canAttach, highlightTerms, marked, jump, onSelection, onSelectionError, onAttachParagraph }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api<{ paragraphs: Paragraph[] }>(`/api/analyses/${analysisId}/document/text`)
      .then((r) => setParagraphs(r.paragraphs))
      .catch((e) => setError(errorMessage(e)));
  }, [analysisId]);

  useEffect(() => {
    if (!jump?.paragraph || !host.current) return;
    host.current.querySelector(`[data-paragraph="${jump.paragraph}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (jump.evidenceId) {
      setFlash(jump.evidenceId);
      const t = window.setTimeout(() => setFlash(null), 1300);
      return () => window.clearTimeout(t);
    }
  }, [jump]);

  const termRe = useMemo(() => {
    const terms = highlightTerms.filter((t) => t.trim().length > 2);
    return terms.length ? new RegExp(`(${terms.map(escapeRe).join("|")})`, "giu") : null;
  }, [highlightTerms]);

  const markedBy = useMemo(() => {
    const m = new Map<number, string[]>();
    marked.forEach((x) => m.set(x.paragraph, [...(m.get(x.paragraph) ?? []), x.id]));
    return m;
  }, [marked]);

  const handleSelection = useCallback(() => {
    if (!selectable || !host.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      onSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const node = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement);
    const a = node(range.startContainer)?.closest<HTMLElement>("[data-paragraph]");
    const b = node(range.endContainer)?.closest<HTMLElement>("[data-paragraph]");
    if (!a || !host.current.contains(a)) return;
    if (a !== b) {
      onSelection(null);
      onSelectionError("Selecione um trecho dentro de um único parágrafo.");
      return;
    }
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text.length < 3) return;
    const r = range.getBoundingClientRect();
    const h = host.current.getBoundingClientRect();
    onSelection({
      text,
      paragraph: Number(a.dataset.paragraph),
      page: a.dataset.pageNo ? Number(a.dataset.pageNo) : null,
      rects: [],
      top: r.bottom - h.top + 8,
      left: Math.min(Math.max(16, r.left - h.left + r.width / 2 - 160), h.width - 336),
    });
  }, [onSelection, onSelectionError, selectable]);

  if (error) return <p role="alert" className="p-6 text-nao">{error}</p>;
  if (!paragraphs) return <div className="flex h-64 items-center justify-center text-ink-muted"><Spinner label="Carregando o texto…" /></div>;

  let lastPage: number | null = null;
  return (
    <div ref={host} className="relative h-full overflow-auto bg-paper-deep/70 scroll-thin" onMouseUp={handleSelection} onTouchEnd={() => window.setTimeout(handleSelection, 50)} onScroll={() => onSelection(null)}>
      <article className="mx-auto my-6 max-w-[72ch] rounded-sm bg-white px-2 py-6 shadow-sheet ring-1 ring-line sm:px-4">
        {paragraphs.map((p) => {
          const ids = markedBy.get(p.n) ?? [];
          const header = p.page !== null && p.page !== lastPage;
          lastPage = p.page;
          return (
            <Fragment key={p.n}>
              {header && <p className="mx-3 mb-2 mt-4 border-b border-line pb-1 text-2xs text-ink-faint first:mt-0">Página {p.page}</p>}
              <div
                data-paragraph={p.n}
                data-page-no={p.page ?? undefined}
                className={clsx(
                  "group relative grid grid-cols-[2.5rem_1fr] gap-2 rounded-md px-1 py-1.5 transition-colors",
                  ids.length > 0 && "bg-petrol-50 ring-1 ring-inset ring-petrol-100",
                  ids.some((id) => id === flash) && "animate-flash",
                )}
              >
                <span className="select-none pt-0.5 text-right font-mono text-2xs text-ink-faint" aria-hidden="true">§{p.n}</span>
                <p className="pr-8 text-[14px] leading-relaxed">
                  {termRe
                    ? p.text.split(termRe).map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded-sm bg-inc/20 px-0.5 text-inherit">{part}</mark> : part))
                    : p.text}
                </p>
                {canAttach && (
                  <button
                    type="button"
                    onClick={() => onAttachParagraph(p)}
                    className="absolute right-1 top-1 rounded p-1 text-ink-faint opacity-0 transition-opacity hover:bg-white hover:text-petrol-600 focus:opacity-100 group-hover:opacity-100"
                    aria-label={`Anexar o parágrafo ${p.n} como evidência`}
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Fragment>
          );
        })}
      </article>
    </div>
  );
}
