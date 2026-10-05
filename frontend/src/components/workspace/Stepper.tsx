"use client";

import clsx from "clsx";
import { Check, Lock } from "lucide-react";
import type { StepId, StepInfo } from "@/lib/types";

interface Props { steps: StepInfo[]; current: StepId; onSelect: (id: StepId) => void }

/** As sete etapas, sempre na mesma ordem. Etapas futuras ficam travadas até a anterior estar completa. */
export function Stepper({ steps, current, onSelect }: Props) {
  return (
    <nav aria-label="Etapas da análise" className="border-b border-line bg-white">
      <ol className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3 py-2 scroll-thin sm:px-5">
        {steps.map((s, i) => {
          const isCurrent = s.id === current;
          const locked = s.state === "locked";
          return (
            <li key={s.id} className="flex shrink-0 items-center">
              <button
                type="button"
                disabled={locked}
                onClick={() => onSelect(s.id)}
                aria-current={isCurrent ? "step" : undefined}
                title={locked ? "Conclua a etapa anterior para liberar esta" : undefined}
                className={clsx(
                  "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  isCurrent ? "bg-petrol-50 text-petrol-800" : locked ? "cursor-not-allowed text-ink-faint" : "text-ink-soft hover:bg-paper",
                )}
              >
                <span
                  className={clsx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular-nums",
                    s.state === "complete" ? "bg-petrol-600 text-white" : isCurrent ? "border-[1.5px] border-petrol-600 text-petrol-700" : "border border-line-strong",
                  )}
                  aria-hidden="true"
                >
                  {s.state === "complete" ? <Check className="h-3 w-3" strokeWidth={3} /> : locked ? <Lock className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span className={clsx("whitespace-nowrap", isCurrent && "font-medium")}>{s.label}</span>
                {s.pending > 0 && s.state !== "locked" && !isCurrent && (
                  <span className="rounded-full bg-paper-deep px-1.5 text-2xs tabular-nums text-ink-muted" aria-label={`${s.pending} pendências`}>{s.pending}</span>
                )}
                <span className="sr-only">{s.state === "complete" ? "(concluída)" : locked ? "(travada)" : "(disponível)"}</span>
              </button>
              {i < steps.length - 1 && <span className="mx-0.5 h-px w-3 bg-line-strong" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
