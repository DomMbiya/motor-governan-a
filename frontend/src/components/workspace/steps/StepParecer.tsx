"use client";

import clsx from "clsx";
import { PenLine, Scale, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage, json } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { AnalysisView, StepId } from "@/lib/types";
import { StepShell } from "../StepShell";
import { useWorkspace } from "../WorkspaceContext";
import { IndicativePanel } from "./IndicativePanel";

export function StepParecer({ goTo, onFinalized }: { goTo: (s: StepId) => void; onFinalized: () => void }) {
  const ws = useWorkspace();
  const { rules, view } = ws;
  const { notify } = useToast();
  const ind = view.indicative;
  const policy = rules.politicas;
  const group = useId();
  const ackId = useId();
  const [decision, setDecision] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [divergence, setDivergence] = useState("");
  const [ack, setAck] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);

  const divergent = decision !== null && decision !== ind.aligned_decision;
  const problems = useMemo(() => {
    const p: Record<string, string> = {};
    if (!decision) p.decision = "Escolha o parecer.";
    if (justification.trim().length < policy.justificativa_min_caracteres) p.justification = `A justificativa precisa de pelo menos ${policy.justificativa_min_caracteres} caracteres.`;
    if (divergent && divergence.trim().length < policy.divergencia_min_caracteres) p.divergence_justification = `Explique a divergência em pelo menos ${policy.divergencia_min_caracteres} caracteres.`;
    if (!ack) p.acknowledged = "Confirme que revisou o quadro-resumo e assume a responsabilidade.";
    return p;
  }, [ack, decision, divergence, divergent, justification, policy]);
  const err = (f: string) => (tried ? serverErrors[f] ?? problems[f] ?? null : serverErrors[f] ?? null);

  if (ind.outcome === "bloqueado" || !ind.aligned_decision) {
    return (
      <StepShell number={6} title="Parecer" lead="O parecer só pode ser emitido com a análise completa.">
        <Button onClick={() => goTo("resumo")}>Ver pendências no quadro-resumo</Button>
      </StepShell>
    );
  }

  async function sign() {
    setBusy(true);
    setServerErrors({});
    try {
      await ws.flush();
      const v = await api<AnalysisView>(`/api/analyses/${view.id}/opinion`, {
        method: "POST",
        ...json({ decision, justification, divergence_justification: divergent ? divergence : "", acknowledged: ack }),
      });
      ws.applyView(v);
      setConfirm(false);
      notify("success", "Parecer assinado", "O dossiê foi gerado e registrado na trilha de auditoria.");
      onFinalized();
    } catch (e) {
      setConfirm(false);
      if (e instanceof ApiError && Array.isArray(e.details)) {
        setServerErrors(Object.fromEntries((e.details as { field: string; message: string }[]).filter((d) => d.field).map((d) => [d.field, d.message])));
      }
      notify("error", "O parecer não foi registrado", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const chosen = rules.parecer.opcoes.find((o) => o.id === decision);
  return (
    <StepShell
      number={6}
      title="Parecer do analista"
      lead="O indicativo é uma recomendação. A decisão é sua: você pode seguir o indicativo ou divergir dele, justificando."
      actions={
        <Button
          variant="primary"
          icon={<PenLine className="h-4 w-4" />}
          onClick={() => {
            setTried(true);
            if (Object.keys(problems).length === 0) setConfirm(true);
            else document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
          }}
        >
          Assinar parecer e gerar dossiê
        </Button>
      }
    >
      <IndicativePanel indicative={ind} rules={rules} compact />

      <fieldset className="mt-6" aria-describedby={err("decision") ? `${group}-err` : undefined} aria-invalid={Boolean(err("decision")) || undefined}>
        <legend className="field-label flex items-center gap-1.5"><Scale className="h-4 w-4 text-petrol-600" aria-hidden="true" /> Seu parecer</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {rules.parecer.opcoes.map((o) => {
            const checked = decision === o.id;
            const aligned = o.id === ind.aligned_decision;
            return (
              <label key={o.id} className={clsx("flex cursor-pointer flex-col rounded-lg border p-3.5 transition-colors", checked ? "border-petrol-600 bg-petrol-50/60 ring-1 ring-petrol-600" : "border-line bg-white hover:border-line-strong")}>
                <span className="flex items-center gap-2">
                  <input type="radio" name={group} checked={checked} onChange={() => setDecision(o.id)} className="h-4 w-4 accent-petrol-600" />
                  <span className="text-[14px] font-medium">{o.rotulo}</span>
                </span>
                <span className="mt-1 text-[12.5px] text-ink-muted">{o.descricao}</span>
                {aligned && <span className="mt-2 self-start rounded bg-paper-deep px-1.5 py-0.5 text-2xs text-ink-soft">Alinhado ao indicativo</span>}
              </label>
            );
          })}
        </div>
        {err("decision") && <p id={`${group}-err`} className="mt-1.5 text-[12.5px] text-nao">{err("decision")}</p>}
      </fieldset>

      {divergent && (
        <div className="mt-4 rounded-lg border border-inc-line bg-inc-bg/60 p-4">
          <p className="flex items-start gap-2 text-[13px] font-medium text-inc">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Este parecer diverge do indicativo. A divergência aparecerá em destaque no dossiê.
          </p>
          <TextArea
            className="mt-3"
            label="Justificativa da divergência"
            value={divergence}
            onChange={setDivergence}
            min={policy.divergencia_min_caracteres}
            rows={3}
            error={err("divergence_justification")}
            hint="Qual evidência do documento leva a uma conclusão diferente da calculada?"
          />
        </div>
      )}

      <TextArea
        className="mt-5"
        label="Justificativa do parecer"
        value={justification}
        onChange={setJustification}
        min={policy.justificativa_min_caracteres}
        rows={4}
        error={err("justification")}
        hint="Escreva para quem vai ler este dossiê daqui a três anos, sem ter participado da análise."
      />

      <div className="mt-5 rounded-md border border-line bg-paper/60 p-3.5">
        <div className="flex items-start gap-3">
          <input id={ackId} type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-4 w-4 accent-petrol-600" aria-invalid={Boolean(err("acknowledged")) || undefined} />
          <label htmlFor={ackId} className="text-[13px] leading-relaxed text-ink-soft">
            Revisei o quadro-resumo e assumo a responsabilidade por este parecer, que será assinado como <span className="font-medium text-ink">{view.analyst_name}</span>.
          </label>
        </div>
        {err("acknowledged") && <p className="ml-7 mt-1 text-[12.5px] text-nao">{err("acknowledged")}</p>}
      </div>

      <Dialog
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        title="Assinar o parecer?"
        description="Depois de assinada, a análise fica imutável. Uma revisão exige abrir uma nova análise."
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>Voltar e revisar</Button>
            <Button variant="primary" loading={busy} onClick={() => void sign()}>Assinar e gerar dossiê</Button>
          </>
        }
      >
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-[13.5px]">
          <dt className="text-ink-muted">Indicativo</dt><dd>{ind.label}</dd>
          <dt className="text-ink-muted">Parecer</dt><dd className="font-medium">{chosen?.rotulo}</dd>
          <dt className="text-ink-muted">Divergência</dt><dd>{divergent ? <span className="text-inc">Sim, justificada</span> : "Não"}</dd>
          <dt className="text-ink-muted">Assinado por</dt><dd>{view.analyst_name}</dd>
          <dt className="text-ink-muted">Data e hora</dt><dd>{fmtDateTime(new Date().toISOString())} (registrada pelo servidor)</dd>
          <dt className="text-ink-muted">Regras</dt><dd className="font-mono text-[12.5px]">v{view.rules.version}</dd>
        </dl>
      </Dialog>
    </StepShell>
  );
}
