"use client";

import clsx from "clsx";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type Tone = "success" | "error" | "info";
interface ToastItem { id: number; tone: Tone; title: string; body?: string }
interface ToastApi { notify: (tone: Tone, title: string, body?: string) => void }

const ToastContext = createContext<ToastApi | null>(null);
const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const TONES = { success: "border-sim-line", error: "border-nao-line", info: "border-line" };
const ICON_TONES = { success: "text-sim", error: "text-nao", info: "text-petrol-600" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (tone: Tone, title: string, body?: string) => {
      const id = ++seq.current;
      setItems((all) => [...all.slice(-1), { id, tone, title, body }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 2800);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 top-[7.25rem] z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={clsx("pointer-events-auto flex animate-pop-in gap-3 rounded-lg border bg-white p-3 shadow-float", TONES[t.tone])}>
              <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", ICON_TONES[t.tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">{t.body}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-ink-faint hover:text-ink" aria-label="Fechar aviso">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de ToastProvider");
  return ctx;
}
