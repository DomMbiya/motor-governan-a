"use client";

import clsx from "clsx";
import { BadgeCheck, ChevronDown, CircleAlert, Keyboard, LocateFixed, MousePointerClick, Sparkles, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { locatorLabel } from "@/lib/format";
import type { EditableStep, Evidence } from "@/lib/types";
import { type Target, useWorkspace } from "./WorkspaceContext";

interface Props {
  target: Target;
  suggestionKey: string | null; // "criterio:<id>" | "nao_rotina:<id>"
  issues: { field: string; message: string; code: string }[];
}

/**
 * Evidências de uma pergunta. Cada trecho mostra de onde veio (página ou
 * parágrafo), quem o escolheu e se o servidor o encontrou no documento.
 */
export function EvidenceSlot({ target, suggestionKey, issues }: Props) {
  const ws = useWorkspace();
  const { readOnly } = ws;
  const evidences = ws.evidencesFor(target.step, target.key);
  const active = ws.target?.step === target.step && ws.target.key === target.key;
  const [manual, setManual] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const max = ws.rules.politicas.evidencias_max_por_pergunta;

  const suggestions = useMemo(() => {
    if (!suggestionKey) return [];
    const used = new Set(evidences.map((e) => e.text));
    return ws.suggestions.filter((s) => s.target === suggestionKey && !used.has(s.text));
  }, [evidences, suggestionKey, ws.suggestions]);

  const missing = issues.find((i) => i.field === "evidences");
  const byEvidence = (id: string) => issues.find((i) => i.field === `evidences.${id}`);

  return (
    <div className={clsx("rounded-lg border p-3.5 transition-colors", active ? "border-petrol-200 bg-petrol-50/60" : "border-line bg-paper/50", missing && "border-nao-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium">
          Evidências do documento <span className="font-normal text-ink-muted">({evidences.length}/{max})</span>
        </p>
        {!readOnly && (
          <div className="flex gap-1">
            {!active && (
              <Button size="sm" variant="ghost" onClick={() => ws.setTarget(target)} icon={<MousePointerClick className="h-3.5 w-3.5" />}>
                Anexar a esta pergunta
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setManual(true)} icon={<Keyboard className="h-3.5 w-3.5" />}>
              Informar trecho
            </Button>
          </div>
        )}
      </div>

      {active && !readOnly && (
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-petrol-700">
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" /> Selecione no documento ao lado o trecho que sustenta esta resposta.
        </p>
      )}

      {evidences.length === 0 ? (
        <p className={clsx("mt-2 text-[12.5px]", missing ? "text-nao" : "text-ink-muted")}>{missing ? missing.message : "Nenhum trecho anexado ainda."}</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {evidences.map((ev) => (
            <EvidenceItem key={ev.id} ev={ev} step={target.step} targetKey={target.key} issue={byEvidence(ev.id)?.message} />
          ))}
        </ul>
      )}

      {!readOnly && suggestions.length > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={() => {
              setShowSuggestions((v) => !v);
              ws.setTarget(target);
            }}
            aria-expanded={showSuggestions}
            className="flex w-full items-center gap-1.5 rounded text-left text-[12.5px] font-medium text-inc"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {suggestions.length} {suggestions.length === 1 ? "trecho candidato" : "trechos candidatos"} do assistente de leitura
            <ChevronDown className={clsx("ml-auto h-4 w-4 transition-transform", showSuggestions && "rotate-180")} aria-hidden="true" />
          </button>
          {showSuggestions && (
            <ul className="mt-2 space-y-2">
              {suggestions.map((s) => (
                <li key={s.id} className="rounded-md border border-inc-line bg-white p-2.5">
                  <p className="text-[12.5px] leading-snug text-ink-soft">“{s.text}”</p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-2xs text-ink-muted">
                      {locatorLabel(s)}, palavras-chave: {s.keywords.join(", ")}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => ws.jumpTo({ page: s.page, paragraph: s.paragraph })} icon={<LocateFixed className="h-3.5 w-3.5" />}>
                        Ver no documento
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          ws.addEvidence(
                            { text: s.text, origin: "sugerido_confirmado", keyword: s.keywords.join(", "), locator: { page: s.page, paragraph: s.paragraph, rects: [] } },
                            target,
                          )
                        }
                      >
                        Confirmar como evidência
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-2xs text-ink-faint">O assistente apenas aponta onde olhar. Só vira evidência o que você confirmar, e o dossiê registra essa origem.</p>
        </div>
      )}

      <ManualEvidenceDialog open={manual} onClose={() => setManual(false)} target={target} />
    </div>
  );
}

function EvidenceItem({ ev, step, targetKey, issue }: { ev: Evidence; step: EditableStep; targetKey: string; issue?: string }) {
  const ws = useWorkspace();
  return (
    <li className={clsx("group rounded-md border bg-white p-2.5", issue ? "border-nao-line" : "border-line")}>
      <blockquote className="border-l-2 border-petrol-600 pl-2.5 text-[13px] leading-snug text-ink">{ev.text}</blockquote>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
        <button type="button" onClick={() => ws.jumpTo(ev.locator, ev.id)} className="inline-flex items-center gap-1 rounded font-medium text-petrol-600 hover:underline">
          <LocateFixed className="h-3 w-3" aria-hidden="true" /> {locatorLabel(ev.locator)}
        </button>
        <span className="text-ink-muted">{ev.origin === "sugerido_confirmado" ? "Sugerido pelo assistente, confirmado por você" : "Selecionado por você"}</span>
        {issue ? (
          <span className="inline-flex items-center gap-1 text-nao"><CircleAlert className="h-3 w-3" aria-hidden="true" /> Não encontrado no documento</span>
        ) : ev.verified ? (
          <span className="inline-flex items-center gap-1 text-sim"><BadgeCheck className="h-3 w-3" aria-hidden="true" /> Conferido no documento</span>
        ) : (
          <span className="text-ink-faint">Conferindo…</span>
        )}
        {!ws.readOnly && (
          <button
            type="button"
            onClick={() => ws.removeEvidence(step, targetKey, ev.id)}
            className="ml-auto inline-flex items-center gap-1 rounded text-ink-faint hover:text-nao"
            aria-label={`Remover evidência: ${ev.text.slice(0, 60)}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remover
          </button>
        )}
      </div>
      {issue && <p className="mt-1.5 text-[12px] text-nao">{issue}</p>}
    </li>
  );
}

/** Alternativa por teclado à seleção com o mouse. O servidor confere se o trecho existe na posição informada. */
function ManualEvidenceDialog({ open, onClose, target }: { open: boolean; onClose: () => void; target: Target }) {
  const ws = useWorkspace();
  const doc = ws.view.document;
  const ids = { text: useId(), pos: useId() };
  const [text, setText] = useState("");
  const [pos, setPos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const byParagraph = doc?.view === "text";
  const limit = byParagraph ? doc?.paragraph_count ?? 0 : doc?.page_count ?? 0;

  const submit = () => {
    const n = Number(pos);
    if (text.trim().length < 3) return setError("Cole ou digite o trecho exatamente como está no documento.");
    if (!Number.isInteger(n) || n < 1 || n > limit) return setError(`Informe ${byParagraph ? "um parágrafo" : "uma página"} entre 1 e ${limit}.`);
    const ok = ws.addEvidence({ text, origin: "selecionado_analista", locator: { page: byParagraph ? null : n, paragraph: byParagraph ? n : null, rects: [] } }, target);
    if (ok) {
      setText("");
      setPos("");
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Informar trecho do documento"
      description={`Para “${target.label}”. O trecho precisa existir no documento, na posição indicada: o sistema confere antes de aceitar.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>Anexar evidência</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={ids.text} className="field-label">Trecho</label>
          <textarea id={ids.text} className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={ws.rules.politicas.evidencia_max_caracteres} />
        </div>
        <div className="w-40">
          <label htmlFor={ids.pos} className="field-label">{byParagraph ? "Parágrafo" : "Página"}</label>
          <input id={ids.pos} className="input" inputMode="numeric" value={pos} onChange={(e) => setPos(e.target.value.replace(/\D/g, ""))} placeholder={`1 a ${limit}`} />
        </div>
        {error && <p role="alert" className="text-[12.5px] text-nao">{error}</p>}
      </div>
    </Dialog>
  );
}
