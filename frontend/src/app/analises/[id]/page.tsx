"use client";

import clsx from "clsx";
import { ArrowLeft, FileSearch, FileText, ListChecks, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DocumentPane } from "@/components/document/DocumentPane";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Stepper } from "@/components/workspace/Stepper";
import { StepAbertura } from "@/components/workspace/steps/StepAbertura";
import { StepClassificacao } from "@/components/workspace/steps/StepClassificacao";
import { StepCriterios } from "@/components/workspace/steps/StepCriterios";
import { StepDossie } from "@/components/workspace/steps/StepDossie";
import { StepNaoRotina } from "@/components/workspace/steps/StepNaoRotina";
import { StepParecer } from "@/components/workspace/steps/StepParecer";
import { StepResumo } from "@/components/workspace/steps/StepResumo";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace/WorkspaceContext";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { AnalysisView, RulesPayload, StepId, Suggestion } from "@/lib/types";

const STEP_IDS: StepId[] = ["abertura", "classificacao", "criterios", "nao_rotina", "resumo", "parecer", "dossie"];

interface Loaded { view: AnalysisView; rules: RulesPayload; suggestions: Suggestion[] }

export default function AnalysisPage() {
  return (
    <Suspense fallback={<FullScreenLoading />}>
      <AnalysisLoader />
    </Suspense>
  );
}

function FullScreenLoading() {
  return (
    <>
      <AppHeader />
      <div className="flex h-[60vh] items-center justify-center text-ink-muted"><Spinner label="Abrindo a análise…" /></div>
    </>
  );
}

function AnalysisLoader() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<{ data?: Loaded; error?: string; notFound?: boolean }>({});

  const load = useCallback(async () => {
    setState({});
    try {
      const view = await api<AnalysisView>(`/api/analyses/${id}`);
      // A análise é sempre exibida com a versão de regras com que foi aberta.
      const [rules, sugg] = await Promise.all([
        api<RulesPayload>(`/api/rules/${view.rules.version}`),
        view.document ? api<{ items: Suggestion[] }>(`/api/analyses/${id}/suggestions`) : Promise.resolve({ items: [] }),
      ]);
      setState({ data: { view, rules, suggestions: sugg.items } });
    } catch (e) {
      setState({ error: errorMessage(e), notFound: e instanceof ApiError && e.status === 404 });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.notFound) {
    return (
      <>
        <AppHeader />
        <EmptyState
          className="mt-16"
          icon={<FileSearch className="h-6 w-6" />}
          title="Análise não encontrada"
          body="O endereço pode estar incorreto, ou os dados do evento já foram apagados desta máquina."
          action={<Link href="/" className="font-medium text-petrol-600 underline underline-offset-2">Voltar para as análises</Link>}
        />
      </>
    );
  }
  if (state.error) {
    return (
      <>
        <AppHeader />
        <EmptyState className="mt-16" icon={<FileSearch className="h-6 w-6" />} title="Não foi possível abrir a análise" body={state.error} action={<Button onClick={() => void load()}>Tentar de novo</Button>} />
      </>
    );
  }
  if (!state.data) return <FullScreenLoading />;

  return (
    <WorkspaceProvider initial={state.data.view} rules={state.data.rules.rules} suggestions={state.data.suggestions}>
      <Workspace onDocumentChanged={load} />
    </WorkspaceProvider>
  );
}

function defaultStep(view: AnalysisView): StepId {
  if (view.status === "finalized") return "dossie";
  const open = view.steps.find((s) => s.state === "available" && ["abertura", "classificacao", "criterios", "nao_rotina"].includes(s.id));
  return open?.id ?? "resumo";
}

function Workspace({ onDocumentChanged }: { onDocumentChanged: () => void }) {
  const ws = useWorkspace();
  const { view } = ws;
  const router = useRouter();
  const params = useSearchParams();
  const [mobilePane, setMobilePane] = useState<"doc" | "step">("step");
  const [justSigned, setJustSigned] = useState(false);
  const [hadDocument] = useState(Boolean(view.document));

  const requested = params.get("etapa") as StepId | null;
  const info = view.steps.find((s) => s.id === requested);
  const current: StepId = requested && STEP_IDS.includes(requested) && info && info.state !== "locked" ? requested : defaultStep(view);

  const goTo = useCallback(
    (step: StepId) => {
      void ws.flush();
      router.replace(`/analises/${view.id}?etapa=${step}`, { scroll: false });
      setMobilePane("step");
    },
    [router, view.id, ws],
  );

  // As sugestões do assistente dependem do documento: recarrega quando ele chega.
  useEffect(() => {
    if (!hadDocument && view.document) onDocumentChanged();
  }, [hadDocument, onDocumentChanged, view.document]);

  useEffect(() => {
    if (!["classificacao", "criterios", "nao_rotina"].includes(current)) ws.setTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const finalized = view.status === "finalized";
  const pane = current === "dossie" ? "dossier" : "project";

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader>
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="rounded p-1 text-ink-muted hover:bg-paper hover:text-ink" aria-label="Voltar para as análises">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium leading-tight">{view.project_name}</p>
            <p className="truncate text-2xs text-ink-muted">{view.area}, analista {view.analyst_name}</p>
          </div>
          <span
            className={clsx(
              "hidden shrink-0 items-center gap-1 rounded px-2 py-0.5 text-2xs font-medium ring-1 ring-inset sm:inline-flex",
              finalized ? "bg-petrol-50 text-petrol-700 ring-petrol-100" : "bg-paper text-ink-soft ring-line",
            )}
          >
            {finalized && <Lock className="h-3 w-3" aria-hidden="true" />}
            {finalized ? "Finalizada e imutável" : "Rascunho"}
          </span>
        </div>
      </AppHeader>
      <Stepper steps={view.steps} current={current} onSelect={goTo} />

      <div className="flex border-b border-line bg-white lg:hidden" role="tablist" aria-label="Alternar painel">
        {([
          ["step", "Etapa", ListChecks],
          ["doc", pane === "dossier" ? "Dossiê" : "Documento", FileText],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={mobilePane === key}
            onClick={() => setMobilePane(key)}
            className={clsx("flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px]", mobilePane === key ? "border-b-2 border-petrol-600 font-medium text-petrol-700" : "text-ink-muted")}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <main id="conteudo" className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,1fr)]">
        <div className={clsx("min-h-0 border-line lg:block lg:border-r", mobilePane === "doc" ? "block" : "hidden")}>
          <DocumentPane mode={pane} />
        </div>
        <div className={clsx("min-h-0 bg-paper lg:block", mobilePane === "step" ? "block" : "hidden")}>
          {current === "abertura" && <StepAbertura goTo={goTo} />}
          {current === "classificacao" && <StepClassificacao goTo={goTo} />}
          {current === "criterios" && <StepCriterios goTo={goTo} />}
          {current === "nao_rotina" && <StepNaoRotina goTo={goTo} />}
          {current === "resumo" && <StepResumo goTo={goTo} />}
          {current === "parecer" && !finalized && (
            <StepParecer
              goTo={goTo}
              onFinalized={() => {
                setJustSigned(true);
                goTo("dossie");
              }}
            />
          )}
          {current === "parecer" && finalized && <StepResumo goTo={goTo} />}
          {current === "dossie" && <StepDossie justSigned={justSigned} />}
        </div>
      </main>
    </div>
  );
}
