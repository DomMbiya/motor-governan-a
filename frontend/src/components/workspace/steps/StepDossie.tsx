"use client";

import clsx from "clsx";
import { CircleCheck, CircleX, Download, ExternalLink, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { IntegritySeal } from "@/components/shell/IntegritySeal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime, shortHash } from "@/lib/format";
import type { AuditEntry, IntegrityReport } from "@/lib/types";
import { StepShell } from "../StepShell";
import { useWorkspace } from "../WorkspaceContext";

const EVENT_LABEL: Record<string, string> = {
  "analysis.created": "Análise aberta",
  "document.attached": "Documento carregado",
  "step.completed": "Etapa concluída",
  "analysis.finalized": "Parecer assinado",
  "dossier.generated": "Dossiê gerado",
};
const STEP_LABEL: Record<string, string> = { classificacao: "classificação", criterios: "critérios de Frascati", nao_rotina: "prova de não rotina" };

export function StepDossie({ justSigned }: { justSigned: boolean }) {
  const { view, rules } = useWorkspace();
  const integrity = view.integrity;
  const [check, setCheck] = useState<IntegrityReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [trail, setTrail] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    api<{ items: AuditEntry[] }>(`/api/analyses/${view.id}/audit`).then((r) => setTrail(r.items)).catch(() => setTrail([]));
  }, [view.id]);

  if (!integrity || !view.opinion) {
    return <StepShell number={7} title="Dossiê" lead="O dossiê é gerado quando o parecer é assinado."><span /></StepShell>;
  }
  const opinion = view.opinion;
  const decision = rules.parecer.opcoes.find((o) => o.id === opinion.decision)?.rotulo ?? opinion.decision;

  async function verify() {
    setChecking(true);
    setCheckError(null);
    try {
      setCheck(await api<IntegrityReport>(`/api/analyses/${view.id}/integrity`));
    } catch (e) {
      setCheckError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <StepShell number={7} title="Dossiê de análise preliminar" lead={rules.dossie.ressalva}>
      <div className="sheet flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start">
        <IntegritySeal contentHash={integrity.content_hash} auditSeq={integrity.audit_seq} rulesVersion={view.rules.version} animate={justSigned} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-ink-muted">Parecer assinado por {opinion.signed_by} em {fmtDateTime(opinion.signed_at)}</p>
          <p className="mt-1 text-[20px] font-semibold leading-tight">{decision}</p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            Indicativo: {view.indicative.label}
            {opinion.divergent && <span className="ml-2 rounded bg-inc-bg px-1.5 py-0.5 text-2xs font-medium text-inc ring-1 ring-inset ring-inc-line">parecer diverge, com justificativa</span>}
          </p>
          <dl className="mt-4 grid grid-cols-[9.5rem_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
            <dt className="text-ink-muted">Hash do conteúdo</dt><dd className="hash break-all">{integrity.content_hash}</dd>
            <dt className="text-ink-muted">Hash do arquivo PDF</dt><dd className="hash break-all">{integrity.pdf_sha256}</dd>
            <dt className="text-ink-muted">Registro de auditoria</dt><dd>nº {integrity.audit_seq}</dd>
            <dt className="text-ink-muted">Base de regras</dt><dd className="font-mono">v{view.rules.version}</dd>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={`/api/analyses/${view.id}/dossier.pdf?download=true`} className="inline-flex h-10 items-center gap-2 rounded-md bg-petrol-600 px-4 text-[14px] font-medium text-white hover:bg-petrol-700">
              <Download className="h-4 w-4" aria-hidden="true" /> Baixar dossiê (PDF)
            </a>
            <a href={`/api/analyses/${view.id}/dossier.pdf`} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-white px-4 text-[14px] font-medium hover:border-petrol-600">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir em nova aba
            </a>
            <Button onClick={() => void verify()} loading={checking} icon={<ShieldCheck className="h-4 w-4" />}>Verificar integridade</Button>
          </div>
        </div>
      </div>

      {(check || checkError) && (
        <section aria-live="polite" className={clsx("mt-4 rounded-lg border p-4", check?.ok ? "border-sim-line bg-sim-bg/50" : "border-nao-line bg-nao-bg/50")}>
          {checkError ? (
            <p className="text-[13px] text-nao">{checkError}</p>
          ) : (
            check && (
              <>
                <p className={clsx("text-[14px] font-semibold", check.ok ? "text-sim" : "text-nao")}>
                  {check.ok ? "Íntegro: nada foi alterado desde a assinatura." : "Atenção: foi detectada uma alteração."}
                </p>
                <ul className="mt-2 space-y-1 text-[13px]">
                  <CheckRow ok={check.content_hash_ok} label="O conteúdo do dossiê confere com o hash registrado na assinatura" />
                  <CheckRow ok={check.pdf_hash_ok} label="O arquivo PDF confere com o hash registrado na trilha de auditoria" />
                  <CheckRow ok={check.chain_ok} label={`A trilha de auditoria está íntegra (${check.chain_entries} registros encadeados)${check.chain_broken_at ? `, quebrada no registro ${check.chain_broken_at}` : ""}`} />
                </ul>
              </>
            )
          )}
        </section>
      )}

      <h2 className="mt-7 text-[14px] font-semibold">Trilha de auditoria desta análise</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">Cada registro guarda o hash do anterior. Alterar qualquer um deles quebra todos os seguintes.</p>
      {!trail ? (
        <div className="mt-3 text-ink-muted"><Spinner label="Carregando a trilha…" /></div>
      ) : (
        <ol className="relative mt-3 space-y-0 border-l border-line-strong pl-5">
          {trail.map((e) => (
            <li key={e.seq} className="relative pb-4 last:pb-0">
              <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-petrol-600 ring-1 ring-petrol-600" aria-hidden="true" />
              <p className="text-[13px]">
                <span className="font-medium">{EVENT_LABEL[e.event] ?? e.event}</span>
                {e.event === "step.completed" && typeof e.payload.step === "string" && <span className="text-ink-soft">: {STEP_LABEL[e.payload.step] ?? e.payload.step}</span>}
                <span className="text-ink-muted"> por {e.actor}</span>
              </p>
              <p className="text-2xs text-ink-muted">
                nº {e.seq}, {fmtDateTime(e.ts)}, hash <span className="font-mono">{shortHash(e.entry_hash, 16)}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </StepShell>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <li className="flex items-start gap-2">
      <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", ok ? "text-sim" : "text-nao")} aria-hidden="true" />
      <span>{label}</span>
    </li>
  );
}
