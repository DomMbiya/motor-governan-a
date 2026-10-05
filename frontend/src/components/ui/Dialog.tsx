"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

/** Diálogo modal acessível baseado no elemento nativo <dialog> (foco preso, Esc fecha). */
export function Dialog({ open, onClose, title, description, children, footer, width = "max-w-lg" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-desc" : undefined}
      className={`w-[calc(100vw-2rem)] ${width} rounded-xl border border-line bg-white p-0 text-ink shadow-float backdrop:bg-ink/40 backdrop:backdrop-blur-[1px] open:animate-pop-in`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id="dialog-title" className="text-[16px] font-semibold">{title}</h2>
              {description && <p id="dialog-desc" className="mt-1 text-[13px] text-ink-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
