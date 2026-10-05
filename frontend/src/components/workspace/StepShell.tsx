"use client";

import { CircleAlert, CloudOff, Loader2, Check } from "lucide-react";
import { fmtTime } from "@/lib/format";
import { useWorkspace } from "./WorkspaceContext";

interface Props {
  number: number;
  title: string;
  lead: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

/** Moldura de cada etapa: título, orientação e rodapé fixo com o estado do salvamento e a ação principal. */
export function StepShell({ number, title, lead, children, actions }: Props) {
  return (
    <section aria-labelledby="step-title" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-5 scroll-thin sm:px-7">
        <p className="text-[12.5px] font-medium text-petrol-600">Etapa {number} de 7</p>
        <h1 id="step-title" className="mt-0.5 text-[21px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        <div className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">{lead}</div>
        <div className="mt-5">{children}</div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-5 py-3 sm:px-7">
          <SaveIndicator />
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
    </section>
  );
}

export function SaveIndicator() {
  const { save, readOnly, flush } = useWorkspace();
  if (readOnly) return <p className="text-[12.5px] text-ink-muted">Análise finalizada: somente leitura.</p>;
  const base = "flex items-center gap-1.5 text-[12.5px]";
  return (
    <p role="status" aria-live="polite" className={base}>
      {save.status === "saving" && <><Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" aria-hidden="true" /><span className="text-ink-muted">Salvando…</span></>}
      {save.status === "pending" && <span className="text-ink-faint">Alterações não salvas</span>}
      {save.status === "saved" && save.at && <><Check className="h-3.5 w-3.5 text-sim" aria-hidden="true" /><span className="text-ink-muted">Rascunho salvo às {fmtTime(save.at)}</span></>}
      {save.status === "error" && (
        <>
          <CloudOff className="h-3.5 w-3.5 text-nao" aria-hidden="true" />
          <span className="text-nao">Não salvo.</span>
          <button type="button" onClick={() => void flush()} className="font-medium text-nao underline underline-offset-2">Tentar de novo</button>
        </>
      )}
      {save.status === "idle" && <span className="text-ink-faint">Rascunho salvo automaticamente</span>}
    </p>
  );
}

export function IssueList({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <ul className="mt-2 space-y-1" aria-label="Pendências">
      {messages.map((m) => (
        <li key={m} className="flex items-start gap-1.5 text-[12.5px] text-nao">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {m}
        </li>
      ))}
    </ul>
  );
}
