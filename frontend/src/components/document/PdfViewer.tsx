"use client";

import clsx from "clsx";
import { FileWarning } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { Spinner } from "@/components/ui/Spinner";
import type { Rect } from "@/lib/types";

// Worker servido localmente a partir de /public (copiado no postinstall): sem CDN.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface Overlay { id: string; page: number; rects: Rect[]; tone: "active" | "muted" }
export interface TextSelectionInfo { text: string; page: number; rects: Rect[]; top: number; left: number }

interface Props {
  url: string;
  zoom: number;
  selectable: boolean;
  highlightTerms: string[];
  overlays: Overlay[];
  jump: { page: number | null; evidenceId: string | null; nonce: number } | null;
  onPageCount?: (n: number) => void;
  onVisiblePage?: (n: number) => void;
  onSelection: (sel: TextSelectionInfo | null) => void;
  onSelectionError: (message: string) => void;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function PdfViewer({ url, zoom, selectable, highlightTerms, overlays, jump, onPageCount, onVisiblePage, onSelection, onSelectionError }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [rendered, setRendered] = useState<Set<number>>(() => new Set([1, 2]));
  const [flashId, setFlashId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Largura disponível -> largura da página (o zoom multiplica o "ajustar à largura").
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor((entry?.contentRect.width ?? 600) - 48))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pageWidth = Math.round(width * zoom);

  // Renderização preguiçosa: só as páginas próximas da área visível.
  useEffect(() => {
    const root = scroller.current;
    if (!root || pages === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.page));
        if (visible.length) {
          setRendered((prev) => {
            const next = new Set(prev);
            visible.forEach((p) => [p - 1, p, p + 1].forEach((q) => q >= 1 && q <= pages && next.add(q)));
            return next.size === prev.size ? prev : next;
          });
        }
      },
      { root, rootMargin: "600px 0px" },
    );
    const centre = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (top) onVisiblePage?.(Number((top.target as HTMLElement).dataset.page));
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    root.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
      io.observe(el);
      centre.observe(el);
    });
    return () => {
      io.disconnect();
      centre.disconnect();
    };
  }, [pages, onVisiblePage]);

  // Ir até uma evidência ou página.
  useEffect(() => {
    if (!jump?.page || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-page="${jump.page}"]`);
    if (!el) return;
    setRendered((prev) => new Set(prev).add(jump.page!));
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (jump.evidenceId) {
      setFlashId(jump.evidenceId);
      const t = window.setTimeout(() => setFlashId(null), 1300);
      return () => window.clearTimeout(t);
    }
  }, [jump]);

  const termRe = useMemo(() => {
    const terms = highlightTerms.filter((t) => t.trim().length > 2);
    return terms.length ? new RegExp(`(${terms.map(escapeRe).join("|")})`, "giu") : null;
  }, [highlightTerms]);

  const renderText = useCallback(
    ({ str }: { str: string }) => {
      const safe = escapeHtml(str);
      return termRe ? safe.replace(termRe, '<mark class="kw">$1</mark>') : safe;
    },
    [termRe],
  );

  const handleSelection = useCallback(() => {
    if (!selectable) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      onSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const startEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) as Element | null;
    const endEl = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement) as Element | null;
    const startPage = startEl?.closest<HTMLElement>("[data-page]");
    const endPage = endEl?.closest<HTMLElement>("[data-page]");
    if (!startPage || !scroller.current?.contains(startPage)) return;
    if (startPage !== endPage) {
      onSelection(null);
      onSelectionError("Selecione um trecho dentro de uma única página.");
      return;
    }
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text.length < 3) return;
    const box = startPage.getBoundingClientRect();
    const rects: Rect[] = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .slice(0, 120)
      .map((r) => ({
        x: Math.max(0, (r.left - box.left) / box.width),
        y: Math.max(0, (r.top - box.top) / box.height),
        w: Math.min(1, r.width / box.width),
        h: Math.min(1, r.height / box.height),
      }));
    const last = range.getBoundingClientRect();
    const host = scroller.current.getBoundingClientRect();
    onSelection({
      text,
      page: Number(startPage.dataset.page),
      rects,
      top: last.bottom - host.top + 8,
      left: Math.min(Math.max(16, last.left - host.left + last.width / 2 - 160), host.width - 336),
    });
  }, [onSelection, onSelectionError, selectable]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-ink-muted">
        <FileWarning className="h-8 w-8 text-nao" aria-hidden="true" />
        <p className="font-medium text-ink">Não foi possível exibir o PDF</p>
        <p className="max-w-sm text-[13px]">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      className="relative h-full overflow-auto bg-paper-deep/70 scroll-thin"
      onMouseUp={handleSelection}
      onKeyUp={(e) => e.shiftKey && handleSelection()}
      onTouchEnd={() => window.setTimeout(handleSelection, 50)}
      onScroll={() => onSelection(null)}
    >
      <Document
        file={url}
        loading={<div className="flex h-64 items-center justify-center text-ink-muted"><Spinner label="Abrindo o documento…" /></div>}
        onLoadSuccess={async (pdf) => {
          setPages(pdf.numPages);
          onPageCount?.(pdf.numPages);
          const first = await pdf.getPage(1);
          const vp = first.getViewport({ scale: 1 });
          setRatio(vp.height / vp.width);
        }}
        onLoadError={(e) => setError(e.message || "Arquivo inválido ou corrompido.")}
        className="flex flex-col items-center gap-5 px-6 py-6"
      >
        {pageWidth > 0 &&
          Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              data-page={n}
              className="relative bg-white shadow-sheet ring-1 ring-line"
              style={{ width: pageWidth, minHeight: Math.round(pageWidth * ratio) }}
              aria-label={`Página ${n} de ${pages}`}
              role="region"
            >
              {rendered.has(n) ? (
                <Page
                  pageNumber={n}
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer
                  customTextRenderer={renderText}
                  loading={<div style={{ height: Math.round(pageWidth * ratio) }} />}
                />
              ) : (
                <div style={{ height: Math.round(pageWidth * ratio) }} />
              )}
              {overlays
                .filter((o) => o.page === n)
                .flatMap((o) =>
                  o.rects.map((r, i) => (
                    <span
                      key={`${o.id}-${i}`}
                      aria-hidden="true"
                      className={clsx(
                        "pointer-events-none absolute rounded-[2px] mix-blend-multiply",
                        o.tone === "active" ? "bg-petrol-600/15 ring-1 ring-petrol-600/30" : "bg-ink/[0.06]",
                        flashId === o.id && "animate-flash",
                      )}
                      style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                    />
                  )),
                )}
              <span className="pointer-events-none absolute -left-0 bottom-1 right-2 text-right text-2xs text-ink-faint">{n}</span>
            </div>
          ))}
      </Document>
    </div>
  );
}
