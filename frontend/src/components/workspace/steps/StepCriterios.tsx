"use client";

import clsx from "clsx";
import { ArrowRight, BookMarked, ChevronDown, CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ANSWER_LABEL, AnswerBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { GlossaryText } from "@/components/ui/GlossaryText";
import { TextArea } from "@/components/ui/TextArea";
import type { Answer, Criterion, StepId } from "@/lib/types";
import { EvidenceSlot } from "../EvidenceSlot";
import { IssueList, StepShell } from "../StepShell";
import { type Target, useIssues, useWorkspace } from "../WorkspaceContext";

const ANSWERS: { id: Answer; icon: typeof CircleCheck; on: string; hint: string }[] = [
  { id: "sim", icon: CircleCheck, on: "border-sim bg-sim-bg text-sim ring-1 ring-sim", hint: "O documento sustenta o critério." },
  { id: "nao", icon: CircleX, on: "border-nao bg-nao-bg text-nao ring-1 ring-nao", hint: "O documento mostra que o critério não foi atendido." },
  { id: "inconclusivo", icon: CircleHelp, on: "border-inc bg-inc-bg text-inc ring-1 ring-inc", hint: "Há dúvida real. O ponto irá para avaliação especializada." },
];

const targetOf = (c: Criterion): Target => ({ step: "criterios", key: c.id, label: c.pergunta, keywords: c.palavras_chave });

export function StepCriterios({ goTo }: { goTo: (s: StepId) => void }) {
  const ws = useWorkspace();
  const { rules, view, readOnly } = ws;
  const [busy, setBusy] = useState(false);
  const pendingIds = new Set((view.issues.criterios ?? []).map((i) => i.target));
  const [open, setOpen] = useState<string | null>(() => rules.criterios.find((c) => pendingIds.has(c.id))?.id ?? rules.criterios[0]?.id ?? null);

  useEffect(() => {
    const c = rules.criterios.find((x) => x.id === open);
    ws.setTarget(c ? targetOf(c) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const answered = rules.criterios.filter((c) => ws.draft.criteria[c.id]?.answer).length;

  return (
    <StepShell
      number={3}
      title="Cinco critérios de Frascati"
      lead={
        <>
          Responda cada critério com base no documento. Se a resposta for Sim para todos, o projeto <em>provavelmente</em> é pesquisa. Na dúvida real, marque Inconclusivo: é uma resposta válida.
        </>
      }
      actions={
        !readOnly && (
          <Button
            variant="primary"
            loading={busy}
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              const ok = await ws.completeStep("criterios");
              setBusy(false);
              if (ok) goTo("nao_rotina");
              else {
                const first = rules.criterios.find((c) => (ws.view.issues.criterios ?? []).some((i) => i.target === c.id));
                if (first) setOpen(first.id);
              }
            }}
          >
            Concluir e ir para a não rotina
          </Button>
        )
      }
    >
      <p className="mb-3 text-[12.5px] text-ink-muted" aria-live="polite">{answered} de {rules.criterios.length} critérios respondidos</p>
      <div className="space-y-2.5">
        {rules.criterios.map((c, i) => (
          <CriterionCard key={c.id} criterion={c} index={i + 1} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
        ))}
      </div>
    </StepShell>
  );
}

function CriterionCard({ criterion: c, index, open, onToggle }: { criterion: Criterion; index: number; open: boolean; onToggle: () => void }) {
  const ws = useWorkspace();
  const { rules, readOnly } = ws;
  const resp = ws.draft.criteria[c.id] ?? { answer: null, justification: "", evidences: [] };
  const issues = useIssues("criterios", c.id);
  const panelId = useId();
  const groupName = useId();
  const source = rules.fontes.find((s) => s.id === c.fonte);
  const fieldIssue = (f: string) => issues.visible.find((i) => i.field === f)?.message ?? null;

  const set = (patch: Partial<typeof resp>) =>
    ws.updateDraft("criterios", (d) => ({ ...d, criteria: { ...d.criteria, [c.id]: { ...(d.criteria[c.id] ?? resp), ...patch } } }));

  return (
    <article className={clsx("rounded-lg border bg-white transition-shadow", open ? "border-petrol-200 shadow-sheet" : "border-line", issues.visible.length > 0 && !open && "border-nao-line")}>
      <h2>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left">
          <span className="w-5 text-right text-[12.5px] tabular-nums text-ink-faint" aria-hidden="true">{index}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium">{c.pergunta}</span>
            {!open && <span className="block truncate text-[12.5px] text-ink-muted">{c.definicao}</span>}
          </span>
          <span className="hidden text-2xs text-ink-muted sm:inline">{resp.evidences.length} {resp.evidences.length === 1 ? "trecho" : "trechos"}</span>
          <AnswerBadge answer={resp.answer} />
          <ChevronDown className={clsx("h-4 w-4 text-ink-faint transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </h2>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-line px-4 pb-4 pt-3.5">
          <div className="text-[13.5px] leading-relaxed text-ink-soft">
            <GlossaryText text={c.definicao} glossary={rules.glossario} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-sim-bg/60 px-3 py-2 text-[12.5px] leading-snug"><span className="font-medium text-sim">Exemplo de sim. </span>{c.exemplo_sim}</div>
            <div className="rounded-md bg-nao-bg/60 px-3 py-2 text-[12.5px] leading-snug"><span className="font-medium text-nao">Exemplo de não. </span>{c.exemplo_nao}</div>
          </div>
          <p className="text-[12.5px] text-ink-muted">
            <span className="font-medium text-ink-soft">O que conta como evidência: </span>{c.evidencia_suficiente}
          </p>

          <fieldset>
            <legend className="field-label">Resposta</legend>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
              {ANSWERS.map((a) => {
                const checked = resp.answer === a.id;
                const Icon = a.icon;
                return (
                  <label
                    key={a.id}
                    className={clsx(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13.5px] font-medium transition-colors focus-within:ring-2 focus-within:ring-petrol-500",
                      checked ? a.on : "border-line-strong bg-white text-ink-soft hover:border-ink-faint",
                      readOnly && "cursor-default",
                    )}
                    title={a.hint}
                  >
                    <input type="radio" name={groupName} className="sr-only" checked={checked} disabled={readOnly} onChange={() => set({ answer: a.id })} />
                    <Icon className="h-4 w-4" aria-hidden="true" /> {ANSWER_LABEL[a.id]}
                  </label>
                );
              })}
            </div>
            {resp.answer === "inconclusivo" && (
              <p className="mt-2 text-[12.5px] text-inc">Este ponto será listado no dossiê para avaliação especializada, com as evidências já reunidas.</p>
            )}
            <IssueList messages={fieldIssue("answer") ? [fieldIssue("answer")!] : []} />
          </fieldset>

          <TextArea
            label="Justificativa"
            value={resp.justification}
            onChange={(v) => set({ justification: v })}
            min={rules.politicas.justificativa_min_caracteres}
            disabled={readOnly}
            error={fieldIssue("justification")}
            hint="Por que o trecho anexado sustenta essa resposta?"
          />

          <EvidenceSlot target={targetOf(c)} suggestionKey={`criterio:${c.id}`} issues={issues.visible} />

          <p className="flex items-center gap-1.5 text-2xs text-ink-faint">
            <BookMarked className="h-3 w-3" aria-hidden="true" /> Regra: {source?.titulo}, critério {c.rotulo.toLowerCase()}
          </p>
        </div>
      )}
    </article>
  );
}
