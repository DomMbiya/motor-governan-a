"use client";

import clsx from "clsx";
import { ArrowRight, ChevronDown, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { GlossaryText } from "@/components/ui/GlossaryText";
import { TextArea } from "@/components/ui/TextArea";
import type { NaoRotinaQuestion, StepId } from "@/lib/types";
import { EvidenceSlot } from "../EvidenceSlot";
import { StepShell } from "../StepShell";
import { type Target, useIssues, useWorkspace } from "../WorkspaceContext";

type Item = { kind: "pergunta"; ordem: number; q: NaoRotinaQuestion } | { kind: "exclusoes"; ordem: number };

const targetOf = (q: NaoRotinaQuestion): Target => ({ step: "nao_rotina", key: q.id, label: `Pergunta ${q.ordem}`, keywords: q.palavras_chave });

export function StepNaoRotina({ goTo }: { goTo: (s: StepId) => void }) {
  const ws = useWorkspace();
  const { rules, readOnly } = ws;
  const nr = rules.nao_rotina;
  const [busy, setBusy] = useState(false);
  const items = useMemo<Item[]>(
    () => [...nr.perguntas.map((q) => ({ kind: "pergunta" as const, ordem: q.ordem, q })), { kind: "exclusoes" as const, ordem: nr.exclusoes.ordem }].sort((a, b) => a.ordem - b.ordem),
    [nr],
  );
  const [open, setOpen] = useState<string | null>(nr.perguntas.find((q) => q.ordem === 1)?.id ?? null);

  useEffect(() => {
    const q = nr.perguntas.find((x) => x.id === open);
    ws.setTarget(q ? targetOf(q) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <StepShell
      number={4}
      title={nr.titulo}
      lead={<GlossaryText text={nr.ajuda} glossary={rules.glossario} />}
      actions={
        !readOnly && (
          <Button
            variant="primary"
            loading={busy}
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              if (await ws.completeStep("nao_rotina")) goTo("resumo");
              setBusy(false);
            }}
          >
            Concluir e ver o quadro-resumo
          </Button>
        )
      }
    >
      <ol className="space-y-2.5">
        {items.map((it) =>
          it.kind === "pergunta" ? (
            <QuestionCard key={it.q.id} q={it.q} open={open === it.q.id} onToggle={() => setOpen(open === it.q.id ? null : it.q.id)} />
          ) : (
            <ExclusionsCard key="exclusoes" />
          ),
        )}
      </ol>
      <p className="mt-4 text-[12.5px] text-ink-muted">
        O dossiê monta, a partir dessas respostas, o argumento de não rotina: solução existente, obstáculo técnico, exclusões típicas e conhecimento gerado.
      </p>
    </StepShell>
  );
}

function QuestionCard({ q, open, onToggle }: { q: NaoRotinaQuestion; open: boolean; onToggle: () => void }) {
  const ws = useWorkspace();
  const ans = ws.draft.nao_rotina.answers[q.id] ?? { text: "", evidences: [] };
  const issues = useIssues("nao_rotina", q.id);
  const panelId = useId();
  const textIssue = issues.visible.find((i) => i.field === "text")?.message ?? null;
  const done = ans.text.trim().length >= ws.rules.politicas.justificativa_min_caracteres && ans.evidences.length > 0;

  return (
    <li className={clsx("rounded-lg border bg-white", open ? "border-petrol-200 shadow-sheet" : "border-line", issues.visible.length > 0 && !open && "border-nao-line")}>
      <h2>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left">
          <span className="mt-0.5 w-5 text-right text-[12.5px] tabular-nums text-ink-faint" aria-hidden="true">{q.ordem}</span>
          <span className="min-w-0 flex-1 text-[14.5px] font-medium leading-snug">{q.pergunta}</span>
          <span className={clsx("mt-0.5 whitespace-nowrap text-2xs", done ? "text-sim" : "text-ink-faint")}>{done ? "Respondida" : "Pendente"}</span>
          <ChevronDown className={clsx("mt-0.5 h-4 w-4 text-ink-faint transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-line px-4 pb-4 pt-3.5">
          <p className="text-[13px] text-ink-soft">{q.ajuda}</p>
          <TextArea
            label="Resposta"
            rows={4}
            value={ans.text}
            disabled={ws.readOnly}
            min={ws.rules.politicas.justificativa_min_caracteres}
            error={textIssue}
            onChange={(v) =>
              ws.updateDraft("nao_rotina", (d) => ({
                ...d,
                nao_rotina: { ...d.nao_rotina, answers: { ...d.nao_rotina.answers, [q.id]: { ...(d.nao_rotina.answers[q.id] ?? ans), text: v } } },
              }))
            }
          />
          <EvidenceSlot target={targetOf(q)} suggestionKey={`nao_rotina:${q.id}`} issues={issues.visible} />
        </div>
      )}
    </li>
  );
}

function ExclusionsCard() {
  const ws = useWorkspace();
  const ex = ws.rules.nao_rotina.exclusoes;
  const marked = ws.draft.nao_rotina.exclusions_marked;
  const issues = useIssues("nao_rotina", "exclusoes");
  const set = (patch: Partial<typeof ws.draft.nao_rotina>) => ws.updateDraft("nao_rotina", (d) => ({ ...d, nao_rotina: { ...d.nao_rotina, ...patch } }));

  return (
    <li className={clsx("rounded-lg border bg-white px-4 py-3", marked.length ? "border-inc-line" : "border-line")}>
      <fieldset>
        <legend className="flex gap-3">
          <span className="mt-0.5 w-5 text-right text-[12.5px] tabular-nums text-ink-faint" aria-hidden="true">{ex.ordem}</span>
          <span className="text-[14.5px] font-medium leading-snug">{ex.pergunta}</span>
        </legend>
        <p className="ml-8 mt-1 text-[13px] text-ink-soft">{ex.ajuda}</p>
        <div className="ml-8 mt-3 space-y-2">
          {ex.itens.map((item) => {
            const checked = marked.includes(item.id);
            return (
              <label key={item.id} className={clsx("flex cursor-pointer gap-3 rounded-md border p-2.5", checked ? "border-inc bg-inc-bg/60" : "border-line hover:border-line-strong")}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={ws.readOnly}
                  onChange={() => set({ exclusions_marked: checked ? marked.filter((m) => m !== item.id) : [...marked, item.id] })}
                  className="mt-0.5 h-4 w-4 accent-inc"
                />
                <span>
                  <span className="block text-[13.5px] font-medium">{item.rotulo}</span>
                  <span className="block text-[12.5px] text-ink-muted">{item.descricao}</span>
                </span>
              </label>
            );
          })}
          {marked.length === 0 && <p className="text-[12.5px] text-ink-muted">Nenhuma exclusão marcada.</p>}
        </div>
        {marked.length > 0 && (
          <div className="ml-8 mt-3 space-y-3">
            <p role="status" className="flex items-start gap-2 rounded-md bg-inc-bg px-3 py-2 text-[12.5px] text-inc">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Exclusão típica marcada. Mesmo com todos os critérios em Sim, o indicativo será “Requer especialista”. Explique o conflito.
            </p>
            <TextArea
              label="Explicação"
              value={ws.draft.nao_rotina.exclusions_explanation}
              onChange={(v) => set({ exclusions_explanation: v })}
              disabled={ws.readOnly}
              min={ws.rules.politicas.justificativa_min_caracteres}
              error={issues.visible[0]?.message ?? null}
              hint="Qual parte do projeto se enquadra na exclusão e por que o restante não é rotina?"
            />
          </div>
        )}
      </fieldset>
    </li>
  );
}
