"use client";

import { ArrowRight, CircleAlert, LocateFixed } from "lucide-react";
import { AnswerBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import type { StepId } from "@/lib/types";
import { StepShell } from "../StepShell";
import { useWorkspace } from "../WorkspaceContext";
import { IndicativePanel } from "./IndicativePanel";

export function StepResumo({ goTo }: { goTo: (s: StepId) => void }) {
  const ws = useWorkspace();
  const { rules, draft, view, readOnly } = ws;
  const ind = view.indicative;
  const option = rules.classificacao.opcoes.find((o) => o.id === draft.classification.option_id);
  const exclusions = rules.nao_rotina.exclusoes.itens.filter((i) => draft.nao_rotina.exclusions_marked.includes(i.id));
  const blocked = ind.outcome === "bloqueado";

  return (
    <StepShell
      number={5}
      title="Quadro-resumo"
      lead="Revise todas as respostas e evidências numa única tela antes do parecer. Clique em uma página para conferir o trecho no documento."
      actions={
        !readOnly && (
          <Button variant="primary" disabled={blocked} onClick={() => goTo("parecer")} icon={<ArrowRight className="h-4 w-4" />}>
            Seguir para o parecer
          </Button>
        )
      }
    >
      <IndicativePanel indicative={ind} rules={rules} />
      {blocked && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-nao">
          <CircleAlert className="h-4 w-4" aria-hidden="true" /> Volte às etapas com pendências: o indicativo só existe com a análise completa.
        </p>
      )}

      <h2 className="mt-6 text-[14px] font-semibold">Classificação da atividade</h2>
      <p className="mt-1 text-[13.5px]">{option?.rotulo ?? "Não informada"} <span className="text-ink-muted">({draft.classification.evidences.length} {draft.classification.evidences.length === 1 ? "trecho" : "trechos"})</span></p>

      <h2 className="mt-6 text-[14px] font-semibold">Critérios de Frascati</h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white scroll-thin">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead className="bg-paper/70 text-[12px] text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Critério</th>
              <th scope="col" className="px-3 py-2 font-medium">Resposta</th>
              <th scope="col" className="px-3 py-2 font-medium">Evidências</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rules.criterios.map((c) => {
              const r = draft.criteria[c.id];
              return (
                <tr key={c.id} className="align-top">
                  <th scope="row" className="px-3 py-2.5 font-medium">
                    {c.pergunta}
                    {r?.justification && <p className="mt-0.5 line-clamp-2 font-normal text-ink-muted">{r.justification}</p>}
                  </th>
                  <td className="px-3 py-2.5"><AnswerBadge answer={r?.answer ?? null} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(r?.evidences ?? []).map((e) => (
                        <button key={e.id} type="button" onClick={() => ws.jumpTo(e.locator, e.id)} className="inline-flex items-center gap-1 rounded bg-petrol-50 px-1.5 py-0.5 text-2xs font-medium text-petrol-700 hover:bg-petrol-100" title={e.text}>
                          <LocateFixed className="h-3 w-3" aria-hidden="true" />
                          {e.locator.paragraph ? `§ ${e.locator.paragraph}` : `p. ${e.locator.page}`}
                        </button>
                      ))}
                      {!r?.evidences.length && <span className="text-ink-faint">Nenhuma</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6 text-[14px] font-semibold">Prova de não rotina</h2>
      <ol className="mt-2 space-y-2 text-[13px]">
        {[...rules.nao_rotina.perguntas].sort((a, b) => a.ordem - b.ordem).map((q) => (
          <li key={q.id} className="rounded-md border border-line bg-white px-3 py-2">
            <p className="font-medium">{q.ordem}. {q.pergunta}</p>
            <p className="mt-0.5 line-clamp-3 text-ink-soft">{draft.nao_rotina.answers[q.id]?.text || <span className="text-ink-faint">Sem resposta</span>}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[13px]">
        <span className="font-medium">Exclusões típicas: </span>
        {exclusions.length ? <span className="text-inc">{exclusions.map((e) => e.rotulo).join("; ")}</span> : <span className="text-ink-muted">nenhuma marcada</span>}
      </p>

      {ind.specialist_points.length > 0 && (
        <>
          <h2 className="mt-6 text-[14px] font-semibold">Pontos para avaliação especializada</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">A consultoria é chamada só para estes pontos, com o material já organizado.</p>
          <ul className="mt-2 space-y-2">
            {ind.specialist_points.map((p) => (
              <li key={`${p.kind}-${p.target}`} className="rounded-md border border-inc-line bg-inc-bg/50 px-3 py-2 text-[13px]">
                <p className="font-medium text-inc">{p.kind === "criterio" ? "Critério inconclusivo" : "Exclusão marcada"}: {p.label}</p>
                <p className="mt-0.5 text-ink-soft">{p.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </StepShell>
  );
}
