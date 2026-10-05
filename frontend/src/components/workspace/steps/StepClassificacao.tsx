"use client";

import clsx from "clsx";
import { ArrowRight, BookMarked } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { GlossaryText } from "@/components/ui/GlossaryText";
import { TextArea } from "@/components/ui/TextArea";
import type { StepId } from "@/lib/types";
import { EvidenceSlot } from "../EvidenceSlot";
import { IssueList, StepShell } from "../StepShell";
import { type Target, useIssues, useWorkspace } from "../WorkspaceContext";

export function StepClassificacao({ goTo }: { goTo: (s: StepId) => void }) {
  const ws = useWorkspace();
  const { rules, draft, readOnly } = ws;
  const c = rules.classificacao;
  const groupId = useId();
  const [busy, setBusy] = useState(false);
  const issues = useIssues("classificacao", "classificacao");
  const target: Target = { step: "classificacao", key: "classificacao", label: c.pergunta, keywords: [] };
  const fieldIssue = (f: string) => issues.visible.find((i) => i.field === f)?.message ?? null;
  const source = rules.fontes.find((s) => s.id === c.fonte);

  useEffect(() => {
    ws.setTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<typeof draft.classification>) =>
    ws.updateDraft("classificacao", (d) => ({ ...d, classification: { ...d.classification, ...patch } }));

  return (
    <StepShell
      number={2}
      title="Classificação da atividade"
      lead={<GlossaryText text={c.ajuda} glossary={rules.glossario} />}
      actions={
        !readOnly && (
          <Button
            variant="primary"
            loading={busy}
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              if (await ws.completeStep("classificacao")) goTo("criterios");
              setBusy(false);
            }}
          >
            Concluir e ir para os critérios
          </Button>
        )
      }
    >
      <fieldset aria-describedby={`${groupId}-src`}>
        <legend className="text-[15px] font-semibold">{c.pergunta}</legend>
        <p id={`${groupId}-src`} className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
          <BookMarked className="h-3.5 w-3.5" aria-hidden="true" /> Fonte: {source?.titulo}
          {source?.observacao && <span className="text-inc"> ({source.observacao})</span>}
        </p>
        <div className="mt-3 grid gap-2">
          {c.opcoes.map((o) => {
            const checked = draft.classification.option_id === o.id;
            return (
              <label
                key={o.id}
                className={clsx(
                  "flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors",
                  checked ? "border-petrol-600 bg-petrol-50/60 ring-1 ring-petrol-600" : "border-line bg-white hover:border-line-strong",
                  readOnly && "cursor-default",
                )}
              >
                <input type="radio" name={groupId} value={o.id} checked={checked} disabled={readOnly} onChange={() => set({ option_id: o.id })} className="mt-1 h-4 w-4 accent-petrol-600" />
                <span>
                  <span className="block text-[14px] font-medium">{o.rotulo}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-soft"><GlossaryText text={o.descricao} glossary={rules.glossario} /></span>
                  <span className="mt-1 block text-[12.5px] text-ink-muted">Exemplo: {o.exemplo}</span>
                </span>
              </label>
            );
          })}
        </div>
        <IssueList messages={fieldIssue("option_id") ? [fieldIssue("option_id")!] : []} />
      </fieldset>

      <div className="mt-6 space-y-4">
        <TextArea
          label="Justificativa"
          value={draft.classification.justification}
          onChange={(v) => set({ justification: v })}
          min={rules.politicas.justificativa_min_caracteres}
          disabled={readOnly}
          error={fieldIssue("justification")}
          hint="Explique, com base no documento, por que esta categoria descreve o trabalho."
        />
        <EvidenceSlot target={target} suggestionKey={null} issues={issues.visible} />
      </div>
    </StepShell>
  );
}
