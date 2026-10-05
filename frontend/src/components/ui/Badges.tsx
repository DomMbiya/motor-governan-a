import clsx from "clsx";
import { CircleCheck, CircleHelp, CircleX, Lock } from "lucide-react";
import type { Answer, Outcome } from "@/lib/types";

export const ANSWER_LABEL: Record<Answer, string> = { sim: "Sim", nao: "Não", inconclusivo: "Inconclusivo" };

const ANSWER_STYLE: Record<Answer, string> = {
  sim: "bg-sim-bg text-sim ring-sim-line",
  nao: "bg-nao-bg text-nao ring-nao-line",
  inconclusivo: "bg-inc-bg text-inc ring-inc-line",
};
const ANSWER_ICON = { sim: CircleCheck, nao: CircleX, inconclusivo: CircleHelp };

export function AnswerBadge({ answer, className }: { answer: Answer | null; className?: string }) {
  if (!answer) {
    return <span className={clsx("inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium text-ink-faint ring-1 ring-inset ring-line", className)}>Sem resposta</span>;
  }
  const Icon = ANSWER_ICON[answer];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-inset", ANSWER_STYLE[answer], className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {ANSWER_LABEL[answer]}
    </span>
  );
}

export const OUTCOME_STYLE: Record<Outcome, { box: string; dot: string; label: string }> = {
  favoravel: { box: "bg-sim-bg text-sim ring-sim-line", dot: "bg-sim", label: "Favorável" },
  desfavoravel: { box: "bg-nao-bg text-nao ring-nao-line", dot: "bg-nao", label: "Desfavorável" },
  requer_especialista: { box: "bg-inc-bg text-inc ring-inc-line", dot: "bg-inc", label: "Requer especialista" },
  bloqueado: { box: "bg-paper-deep text-ink-muted ring-line", dot: "bg-ink-faint", label: "Em análise" },
};

export function OutcomeBadge({ outcome, className }: { outcome: Outcome | null; className?: string }) {
  if (!outcome) return <span className="text-ink-faint">—</span>;
  const s = OUTCOME_STYLE[outcome];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset", s.box, className)}>
      {outcome === "bloqueado" ? <Lock className="h-3 w-3" aria-hidden="true" /> : <span className={clsx("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden="true" />}
      {s.label}
    </span>
  );
}
