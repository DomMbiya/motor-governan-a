"use client";

import { ArrowRight, FileCheck2, Replace } from "lucide-react";
import { useState } from "react";
import { Dropzone, validateFile } from "@/components/document/Dropzone";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { fmtBytes, fmtDateTime } from "@/lib/format";
import type { AnalysisView, StepId } from "@/lib/types";
import { StepShell } from "../StepShell";
import { useWorkspace } from "../WorkspaceContext";

const FORMAT_LABEL = { pdf: "PDF", docx: "DOCX convertido para PDF", txt: "Texto", md: "Markdown", csv: "CSV", xlsx: "Planilha XLSX" } as const;

export function StepAbertura({ goTo }: { goTo: (s: StepId) => void }) {
  const ws = useWorkspace();
  const { view, draft, readOnly } = ws;
  const { notify } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const doc = view.document;
  const hasEvidence =
    draft.classification.evidences.length > 0 ||
    Object.values(draft.criteria).some((c) => c.evidences.length) ||
    Object.values(draft.nao_rotina.answers).some((a) => a.evidences.length);

  async function upload() {
    if (!file) return setError("Escolha o arquivo do projeto.");
    const invalid = validateFile(file);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const v = await api<AnalysisView>(`/api/analyses/${view.id}/document`, { method: "POST", body: form });
      ws.applyView(v);
      setFile(null);
      setReplacing(false);
      notify("success", "Documento carregado", "O texto foi extraído localmente e está pronto para a análise.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, React.ReactNode][] = doc
    ? [
        ["Arquivo", doc.original_filename],
        ["Formato", FORMAT_LABEL[doc.source_format]],
        ["Extensão", doc.view === "pdf" ? `${doc.page_count} páginas` : `${doc.paragraph_count} parágrafos numerados`],
        ["Tamanho", fmtBytes(doc.size_bytes)],
        ["Carregado em", fmtDateTime(doc.uploaded_at)],
        ["SHA-256", <span key="h" className="hash break-all">{doc.sha256}</span>],
      ]
    : [];

  return (
    <StepShell
      number={1}
      title="Abertura"
      lead="A análise está registrada com o analista, a data e a versão das regras. O documento abaixo é a única fonte das evidências."
      actions={
        doc && (
          <Button variant="primary" onClick={() => goTo("classificacao")} icon={<ArrowRight className="h-4 w-4" />}>
            Ir para a classificação
          </Button>
        )
      }
    >
      <dl className="sheet grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2.5 p-5 text-[13.5px]">
        <dt className="text-ink-muted">Analista</dt><dd>{view.analyst_name}</dd>
        <dt className="text-ink-muted">Projeto</dt><dd>{view.project_name}</dd>
        <dt className="text-ink-muted">Área</dt><dd>{view.area}</dd>
        <dt className="text-ink-muted">Aberta em</dt><dd>{fmtDateTime(view.created_at)}</dd>
        <dt className="text-ink-muted">Base de regras</dt>
        <dd>
          <span className="font-mono text-[12.5px]">v{view.rules.version}</span>
          {!view.rules.is_active && <span className="ml-2 text-[12.5px] text-inc">Há uma versão mais nova; esta análise segue a versão da abertura.</span>}
        </dd>
      </dl>

      {doc && !replacing && (
        <div className="sheet mt-4 p-5">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-5 w-5 text-sim" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold">Material do projeto carregado</h2>
              <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd className="min-w-0">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          {!readOnly && !hasEvidence && (
            <div className="mt-4 border-t border-line pt-3">
              <Button size="sm" variant="ghost" onClick={() => setReplacing(true)} icon={<Replace className="h-3.5 w-3.5" />}>Substituir documento</Button>
            </div>
          )}
          {!readOnly && hasEvidence && (
            <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-muted">
              O documento não pode mais ser trocado: já há evidências ligadas a ele. Para analisar outro material, abra uma nova análise.
            </p>
          )}
        </div>
      )}

      {!readOnly && (!doc || replacing) && (
        <div className="sheet mt-4 space-y-3 p-5">
          <h2 className="text-[14px] font-semibold">{doc ? "Substituir o material do projeto" : "Carregue o material do projeto"}</h2>
          <Dropzone file={file} onChange={(f) => { setFile(f); setError(f ? validateFile(f) : null); }} error={error} disabled={busy} />
          <div className="flex justify-end gap-2">
            {replacing && <Button variant="ghost" onClick={() => { setReplacing(false); setFile(null); setError(null); }}>Cancelar</Button>}
            <Button variant="primary" onClick={() => void upload()} loading={busy} disabled={!file}>Carregar documento</Button>
          </div>
        </div>
      )}
    </StepShell>
  );
}
