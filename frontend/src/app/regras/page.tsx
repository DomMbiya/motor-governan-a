"use client";

import { BadgeCheck, FileWarning, GitBranch, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { OUTCOME_STYLE } from "@/components/ui/Badges";
import { Skeleton } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import { shortHash } from "@/lib/format";
import type { Outcome, RulesPayload } from "@/lib/types";

interface Catalog {
  active: string;
  versions: { version: string; checksum: string; vigencia: string; changelog: { versao: string; data: string; descricao: string }[]; criteria: number; coverage_checked: number }[];
  rejected: { file: string; reason: string }[];
}

const COND: Record<string, (v: string | boolean) => string> = {
  algum_criterio: (v) => `algum critério = ${v === "nao" ? "Não" : v === "sim" ? "Sim" : "Inconclusivo"}`,
  todos_criterios: (v) => `todos os critérios = ${v === "nao" ? "Não" : v === "sim" ? "Sim" : "Inconclusivo"}`,
  exclusao_marcada: (v) => (v ? "alguma exclusão típica marcada" : "nenhuma exclusão típica marcada"),
};

export default function RulesPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [active, setActive] = useState<RulesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Catalog>("/api/rules"), api<RulesPayload>("/api/rules/active")])
      .then(([c, a]) => {
        setCatalog(c);
        setActive(a);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <>
      <AppHeader />
      <main id="conteudo" className="mx-auto max-w-[980px] px-4 pb-16 pt-8 sm:px-6">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">Base de regras</h1>
        <p className="mt-1.5 max-w-2xl text-ink-muted">
          Perguntas, textos de ajuda, fontes normativas e a lógica do indicativo vivem num arquivo YAML versionado, e não no código. Uma mudança de norma vira uma nova versão do arquivo; cada dossiê registra qual versão usou.
        </p>
        {error && <p role="alert" className="mt-6 text-nao">{error}</p>}
        {!catalog && !error && <div className="mt-8 space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>}

        {catalog && active && (
          <>
            {catalog.rejected.length > 0 && (
              <section role="alert" className="mt-6 rounded-lg border border-nao-line bg-nao-bg p-4">
                <p className="flex items-center gap-2 font-medium text-nao"><FileWarning className="h-4 w-4" aria-hidden="true" /> Arquivos recusados pelo validador</p>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {catalog.rejected.map((r) => <li key={r.file}><span className="font-mono">{r.file}</span>: {r.reason}</li>)}
                </ul>
              </section>
            )}

            <section aria-labelledby="v-title" className="sheet mt-6 overflow-hidden">
              <h2 id="v-title" className="flex items-center gap-2 border-b border-line px-5 py-3 text-[14px] font-semibold"><GitBranch className="h-4 w-4 text-petrol-600" aria-hidden="true" /> Versões</h2>
              <ul className="divide-y divide-line">
                {catalog.versions.map((v) => (
                  <li key={v.version} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[15px] font-medium">v{v.version}</span>
                      {v.version === catalog.active && <span className="rounded bg-petrol-50 px-1.5 py-0.5 text-2xs font-medium text-petrol-700 ring-1 ring-inset ring-petrol-100">em uso para novas análises</span>}
                      <span className="text-[12.5px] text-ink-muted">vigente desde {v.vigencia.split("-").reverse().join("/")}</span>
                      <span className="hash ml-auto" title={v.checksum}>checksum {shortHash(v.checksum, 16)}</span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-sim">
                      <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Lógica do indicativo verificada nas {v.coverage_checked} combinações possíveis de respostas
                    </p>
                    <ul className="mt-2 space-y-0.5 text-[13px] text-ink-soft">
                      {v.changelog.map((c) => <li key={c.versao}><span className="font-mono text-[12px]">{c.versao}</span> ({c.data}): {c.descricao}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="l-title" className="sheet mt-4 p-5">
              <h2 id="l-title" className="text-[14px] font-semibold">Lógica do indicativo, v{active.version}</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-muted">Avaliada em ordem: vale a primeira regra que corresponder. {active.rules.indicativo.aviso}</p>
              <ol className="mt-3 space-y-2">
                {active.rules.indicativo.regras.map((r) => {
                  const outcome = OUTCOME_STYLE[r.resultado as Outcome];
                  const conds = Object.entries(r.quando).filter(([, v]) => v !== null && v !== undefined);
                  return (
                    <li key={r.id} className="grid gap-2 rounded-md border border-line px-3 py-2.5 text-[13px] sm:grid-cols-[4.5rem_1fr_auto] sm:items-center">
                      <span className="font-mono text-[12px] text-ink-muted">{r.id}</span>
                      <span>Se {conds.map(([k, v]) => COND[k]?.(v as string | boolean) ?? `${k} = ${String(v)}`).join(" e ")}</span>
                      <span className={`inline-flex items-center gap-1.5 justify-self-start rounded px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${outcome?.box ?? ""}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${outcome?.dot ?? ""}`} aria-hidden="true" /> {outcome?.label ?? r.resultado}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section aria-labelledby="f-title" className="sheet mt-4 p-5">
              <h2 id="f-title" className="flex items-center gap-2 text-[14px] font-semibold"><ScrollText className="h-4 w-4 text-petrol-600" aria-hidden="true" /> Fontes normativas</h2>
              <ul className="mt-3 space-y-2 text-[13px]">
                {active.rules.fontes.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.titulo}</span>
                    {s.referencia && <span className="text-ink-soft">: {s.referencia}</span>}
                    {s.observacao && <span className="block text-[12.5px] text-inc">{s.observacao}</span>}
                  </li>
                ))}
              </ul>
            </section>

            <p className="mt-6 text-[12.5px] text-ink-muted">
              Para publicar uma nova versão: copie o arquivo para <span className="font-mono">regras_vX.Y.Z.yaml</span>, altere a versão e o changelog e salve. O sistema valida e passa a usá-la sem reinício. Um arquivo alterado sem mudança de versão é recusado.
            </p>
          </>
        )}
      </main>
    </>
  );
}
