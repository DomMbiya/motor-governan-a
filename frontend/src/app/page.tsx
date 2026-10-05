"use client";

import clsx from "clsx";
import { FilePlus2, FolderSearch, GitCompareArrows, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { OUTCOME_STYLE, OutcomeBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Outcome, PortfolioItem, RulesPayload } from "@/lib/types";

interface Portfolio { items: PortfolioItem[]; divergence_by_criterion: Record<string, number> }

const DECISION_LABEL: Record<string, string> = { enquadra: "Enquadra", nao_enquadra: "Não enquadra", encaminhar_especialista: "Encaminhada a especialista" };
const OUTCOMES: Outcome[] = ["favoravel", "requer_especialista", "desfavoravel", "bloqueado"];

export default function PortfolioPage() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [rules, setRules] = useState<RulesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([api<Portfolio>("/api/analyses"), api<RulesPayload>("/api/rules/active")]);
      setData(p);
      setRules(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Outcome, number> = { favoravel: 0, desfavoravel: 0, requer_especialista: 0, bloqueado: 0 };
    data?.items.forEach((i) => c[i.indicative ?? "bloqueado"]++);
    return c;
  }, [data]);
  const total = data?.items.length ?? 0;
  const finalized = data?.items.filter((i) => i.status === "finalized").length ?? 0;
  const divergent = data?.items.filter((i) => i.divergent).length ?? 0;
  const criterionLabel = (id: string) => rules?.rules.criterios.find((c) => c.id === id)?.pergunta ?? id;

  return (
    <>
      <AppHeader />
      <main id="conteudo" className="mx-auto max-w-[1200px] px-4 pb-16 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">Análises de enquadramento</h1>
            <p className="mt-1.5 max-w-2xl text-[14px] text-ink-muted">
              Cada análise percorre as mesmas sete etapas, com as mesmas perguntas e a mesma exigência de evidência. O parecer é sempre do analista.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" />} aria-label="Atualizar lista" />
            <Link
              href="/analises/nova"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-petrol-600 px-4 text-[14px] font-medium text-white transition-colors hover:bg-petrol-700"
            >
              <FilePlus2 className="h-4 w-4" aria-hidden="true" /> Nova análise
            </Link>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-3 rounded-lg border border-nao-line bg-nao-bg p-4 text-[13.5px] text-nao">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">{error}</div>
            <Button size="sm" onClick={() => void load()}>Tentar de novo</Button>
          </div>
        )}

        {loading && !data && (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Carregando análises">
            <Skeleton className="h-16 w-full" />
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        )}

        {data && total === 0 && (
          <div className="sheet mt-8">
            <EmptyState
              icon={<FolderSearch className="h-6 w-6" />}
              title="Nenhuma análise aberta ainda"
              body="Abra a primeira análise com o relatório do projeto. O sistema guia cada etapa e registra o porquê de cada resposta."
              action={
                <Link href="/analises/nova" className="inline-flex h-10 items-center gap-2 rounded-md bg-petrol-600 px-4 text-[14px] font-medium text-white hover:bg-petrol-700">
                  <FilePlus2 className="h-4 w-4" aria-hidden="true" /> Abrir primeira análise
                </Link>
              }
            />
          </div>
        )}

        {data && total > 0 && (
          <>
            <section aria-labelledby="dist-title" className="sheet mt-8 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="dist-title" className="text-[14px] font-semibold">Indicativos do portfólio</h2>
                <p className="text-[13px] text-ink-muted">
                  {total} {total === 1 ? "análise" : "análises"}, {finalized} com parecer assinado
                  {divergent > 0 && `, ${divergent} com parecer divergente do indicativo`}
                </p>
              </div>
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-paper-deep" role="img" aria-label={OUTCOMES.map((o) => `${OUTCOME_STYLE[o].label}: ${counts[o]}`).join(", ")}>
                {OUTCOMES.map((o) => counts[o] > 0 && <span key={o} className={clsx("h-full", OUTCOME_STYLE[o].dot)} style={{ width: `${(counts[o] / total) * 100}%` }} />)}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                {OUTCOMES.map((o) => (
                  <li key={o} className="flex items-center gap-2">
                    <span className={clsx("h-2 w-2 rounded-full", OUTCOME_STYLE[o].dot)} aria-hidden="true" />
                    <span className="text-ink-soft">{OUTCOME_STYLE[o].label}</span>
                    <span className="font-medium tabular-nums">{counts[o]}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="list-title" className="sheet mt-4 overflow-hidden">
              <h2 id="list-title" className="sr-only">Lista de análises</h2>
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[820px] text-left text-[13.5px]">
                  <thead className="border-b border-line bg-paper/70 text-[12px] text-ink-muted">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 font-medium">Projeto</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Analista</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Indicativo</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Parecer</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Regras</th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium">Aberta em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.items.map((item) => (
                      <tr key={item.id} className="group relative hover:bg-petrol-50/50">
                        <td className="px-5 py-3">
                          <Link href={`/analises/${item.id}`} className="font-medium text-ink after:absolute after:inset-0 group-hover:text-petrol-700">
                            {item.project_name}
                          </Link>
                          <p className="text-[12.5px] text-ink-muted">{item.area}</p>
                        </td>
                        <td className="px-3 py-3 text-ink-soft">{item.analyst_name}</td>
                        <td className="px-3 py-3"><OutcomeBadge outcome={item.has_document ? item.indicative : "bloqueado"} /></td>
                        <td className="px-3 py-3">
                          {item.decision ? (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span>{DECISION_LABEL[item.decision] ?? item.decision}</span>
                              {item.divergent && <span className="rounded bg-inc-bg px-1.5 py-0.5 text-2xs font-medium text-inc ring-1 ring-inset ring-inc-line">diverge</span>}
                            </span>
                          ) : (
                            <span className="text-ink-faint">Em andamento</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px] text-ink-soft">v{item.rules_version}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{fmtDate(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {Object.keys(data.divergence_by_criterion).length > 0 && (
              <section aria-labelledby="div-title" className="sheet mt-4 p-5">
                <div className="flex items-start gap-3">
                  <GitCompareArrows className="mt-0.5 h-5 w-5 text-inc" aria-hidden="true" />
                  <div>
                    <h2 id="div-title" className="text-[14px] font-semibold">Onde os pareceres divergem do indicativo</h2>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      Critérios não respondidos com Sim em pareceres divergentes. Repetições num mesmo critério indicam onde o guia de resposta precisa melhorar.
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {Object.entries(data.divergence_by_criterion)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cid, n]) => (
                      <li key={cid} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-[13px]">
                        <span className="truncate">{criterionLabel(cid)}</span>
                        <span className="h-1.5 rounded-full bg-inc/70" style={{ width: `${Math.max(8, (n / divergent) * 100)}%` }} aria-hidden="true" />
                        <span className="tabular-nums text-ink-soft">{n}</span>
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
