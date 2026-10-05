"use client";

import { ArrowLeft, Clock3, FileLock2, ScrollText, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Dropzone, validateFile } from "@/components/document/Dropzone";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage, json } from "@/lib/api";
import type { AnalysisView, RulesPayload } from "@/lib/types";

type Fields = "analyst_name" | "project_name" | "area" | "lgpd_acknowledged" | "file";

export default function NewAnalysisPage() {
  const router = useRouter();
  const { notify } = useToast();
  const ids = { analyst: useId(), project: useId(), area: useId(), lgpd: useId() };
  const [rules, setRules] = useState<RulesPayload | null>(null);
  const [analyst, setAnalyst] = useState("");
  const [project, setProject] = useState("");
  const [area, setArea] = useState("");
  const [lgpd, setLgpd] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [busy, setBusy] = useState<null | "creating" | "uploading">(null);

  useEffect(() => {
    api<RulesPayload>("/api/rules/active").then(setRules).catch(() => setRules(null));
  }, []);

  function validate(): boolean {
    const e: Partial<Record<Fields, string>> = {};
    if (analyst.trim().length < 3) e.analyst_name = "Informe seu nome completo (mínimo de 3 caracteres).";
    if (project.trim().length < 3) e.project_name = "Informe o nome do projeto (mínimo de 3 caracteres).";
    if (area.trim().length < 2) e.area = "Informe a área responsável pelo projeto.";
    if (!lgpd) e.lgpd_acknowledged = "Confirme a ciência sobre o registro do seu nome.";
    if (!file) e.file = "Carregue o material do projeto: a análise nasce do documento.";
    else {
      const fileError = validateFile(file);
      if (fileError) e.file = fileError;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate() || !file) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    let created: AnalysisView | null = null;
    try {
      setBusy("creating");
      created = await api<AnalysisView>("/api/analyses", {
        method: "POST",
        ...json({ analyst_name: analyst.trim(), project_name: project.trim(), area: area.trim(), lgpd_acknowledged: lgpd }),
      });
      setBusy("uploading");
      const form = new FormData();
      form.append("file", file);
      await api<AnalysisView>(`/api/analyses/${created.id}/document`, { method: "POST", body: form });
      notify("success", "Análise aberta", "Documento carregado. Comece pela classificação da atividade.");
      router.push(`/analises/${created.id}?etapa=classificacao`);
    } catch (e) {
      if (created) {
        // A análise foi criada (e auditada); só o documento falhou. Leva o analista para reenviar.
        notify("error", "O documento não foi aceito", errorMessage(e));
        router.push(`/analises/${created.id}?etapa=abertura`);
        return;
      }
      if (e instanceof ApiError && Array.isArray(e.details)) {
        const fieldErrors: Partial<Record<Fields, string>> = {};
        for (const d of e.details as { field: Fields; message: string }[]) fieldErrors[d.field] = d.message;
        setErrors(fieldErrors);
      }
      notify("error", "Não foi possível abrir a análise", errorMessage(e));
      setBusy(null);
    }
  }

  const fieldClass = "input";
  return (
    <>
      <AppHeader />
      <main id="conteudo" className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 rounded text-[13px] text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Análises
        </Link>
        <div className="mt-3">
          <p className="text-[13px] font-medium text-petrol-600">Etapa 1 de 7</p>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">Abrir análise preliminar</h1>
          <p className="mt-1.5 max-w-2xl text-ink-muted">Identifique-se e carregue o relatório do projeto. Todas as respostas seguintes serão sustentadas por trechos deste documento.</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <form onSubmit={submit} noValidate className="sheet space-y-5 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={ids.analyst} className="field-label">Seu nome</label>
                <input id={ids.analyst} className={fieldClass} value={analyst} onChange={(e) => setAnalyst(e.target.value)} autoComplete="name" maxLength={120} aria-invalid={Boolean(errors.analyst_name) || undefined} aria-describedby={`${ids.analyst}-h`} />
                <p id={`${ids.analyst}-h`} className={errors.analyst_name ? "mt-1 text-[12.5px] text-nao" : "field-hint mt-1"}>
                  {errors.analyst_name ?? "Aparece no dossiê como responsável pelo parecer."}
                </p>
              </div>
              <div>
                <label htmlFor={ids.project} className="field-label">Projeto</label>
                <input id={ids.project} className={fieldClass} value={project} onChange={(e) => setProject(e.target.value)} maxLength={200} placeholder="Ex.: Modelo de risco climático" aria-invalid={Boolean(errors.project_name) || undefined} />
                {errors.project_name && <p className="mt-1 text-[12.5px] text-nao">{errors.project_name}</p>}
              </div>
              <div>
                <label htmlFor={ids.area} className="field-label">Área responsável pelo projeto</label>
                <input id={ids.area} className={fieldClass} value={area} onChange={(e) => setArea(e.target.value)} maxLength={120} placeholder="Ex.: Inovação e Dados" aria-invalid={Boolean(errors.area) || undefined} />
                {errors.area && <p className="mt-1 text-[12.5px] text-nao">{errors.area}</p>}
              </div>
            </div>

            <div>
              <p className="field-label">Material do projeto</p>
              <Dropzone file={file} onChange={(f) => { setFile(f); setErrors((e) => ({ ...e, file: f ? validateFile(f) ?? undefined : undefined })); }} error={errors.file} disabled={busy !== null} />
            </div>

            <div className="rounded-md border border-line bg-paper/60 p-3.5">
              <div className="flex items-start gap-3">
                <input id={ids.lgpd} type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} className="mt-1 h-4 w-4 accent-petrol-600" aria-invalid={Boolean(errors.lgpd_acknowledged) || undefined} />
                <label htmlFor={ids.lgpd} className="text-[13px] leading-relaxed text-ink-soft">
                  Estou ciente de que meu nome é o único dado pessoal registrado, usado apenas para identificar a responsabilidade pela análise na trilha de auditoria (LGPD).
                </label>
              </div>
              {errors.lgpd_acknowledged && <p className="ml-7 mt-1 text-[12.5px] text-nao">{errors.lgpd_acknowledged}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
              {busy && <p role="status" className="text-[13px] text-ink-muted">{busy === "creating" ? "Registrando a abertura…" : "Lendo o documento localmente…"}</p>}
              <Button type="submit" variant="primary" loading={busy !== null}>Abrir análise</Button>
            </div>
          </form>

          <aside aria-label="O que fica registrado" className="space-y-4">
            <div className="sheet p-5">
              <h2 className="text-[14px] font-semibold">O que fica registrado na abertura</h2>
              <ul className="mt-3 space-y-3 text-[13px] text-ink-soft">
                <li className="flex gap-2.5"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-petrol-600" aria-hidden="true" />O analista responsável</li>
                <li className="flex gap-2.5"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-petrol-600" aria-hidden="true" />Data e hora de abertura</li>
                <li className="flex gap-2.5">
                  <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-petrol-600" aria-hidden="true" />
                  <span>
                    A base de regras em uso{rules && <> : <span className="font-mono text-[12px] text-ink">v{rules.version}</span>, vigente desde {rules.rules.metadados.vigencia.split("-").reverse().join("/")}</>}
                  </span>
                </li>
                <li className="flex gap-2.5"><FileLock2 className="mt-0.5 h-4 w-4 shrink-0 text-petrol-600" aria-hidden="true" />A impressão digital (SHA-256) do documento</li>
              </ul>
            </div>
            <p className="px-1 text-[12.5px] leading-relaxed text-ink-muted">
              A análise fica presa à versão de regras da abertura. Se a base mudar depois, esta análise continua sendo avaliada pelas regras com que começou.
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
