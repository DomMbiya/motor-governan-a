"use client";

import clsx from "clsx";
import { Info } from "lucide-react";
import { OUTCOME_STYLE } from "@/components/ui/Badges";
import type { Indicative, Rules } from "@/lib/types";

/** O indicativo calculado: sempre apresentado como recomendação, com a regra que o produziu. */
export function IndicativePanel({ indicative, rules, compact = false }: { indicative: Indicative; rules: Rules; compact?: boolean }) {
  const s = OUTCOME_STYLE[indicative.outcome];
  return (
    <section aria-labelledby="ind-title" className={clsx("rounded-lg p-4 ring-1 ring-inset", s.box)}>
      <p className="text-[12px] font-medium opacity-90">Indicativo calculado</p>
      <h2 id="ind-title" className={clsx("font-semibold leading-tight", compact ? "text-[17px]" : "text-[22px]")}>
        {indicative.label}
        {indicative.outcome === "favoravel" && <span className="ml-2 text-[14px] font-normal">(provavelmente é pesquisa)</span>}
      </h2>
      <p className="mt-1 text-[13.5px] text-ink">{indicative.reason}</p>
      {indicative.rule_id && (
        <p className="mt-2 text-[12px] text-ink-soft">
          Regra <span className="font-mono">{indicative.rule_id}</span> da base de regras. {indicative.description}
        </p>
      )}
      <p className="mt-3 flex items-start gap-1.5 border-t border-current/15 pt-2.5 text-[12.5px] text-ink-soft">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {rules.indicativo.aviso}
      </p>
    </section>
  );
}
