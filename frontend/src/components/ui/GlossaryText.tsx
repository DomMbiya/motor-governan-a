"use client";

import { Fragment, useId, useMemo, useState } from "react";

interface Entry { termo: string; definicao: string }

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Termo técnico com explicação curta ao passar o mouse ou focar (teclado). */
function Term({ word, definition }: { word: string; definition: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-help border-b border-dotted border-petrol-500 text-inherit"
      >
        {word}
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-[12.5px] font-normal leading-snug text-white shadow-float ${open ? "block animate-pop-in" : "hidden"}`}
      >
        {definition}
      </span>
    </span>
  );
}

/** Renderiza um texto marcando os termos do glossário da base de regras. */
export function GlossaryText({ text, glossary }: { text: string; glossary: Entry[] }) {
  const parts = useMemo(() => {
    if (!glossary.length) return [text];
    const terms = [...glossary].sort((a, b) => b.termo.length - a.termo.length);
    const re = new RegExp(`(?<![\\p{L}])(${terms.map((t) => escapeRe(t.termo)).join("|")})(?![\\p{L}])`, "giu");
    return text.split(re);
  }, [text, glossary]);
  const lookup = useMemo(() => new Map(glossary.map((g) => [g.termo.toLocaleLowerCase("pt-BR"), g.definicao])), [glossary]);
  const used = new Set<string>();
  return (
    <>
      {parts.map((part, i) => {
        const def = lookup.get(part.toLocaleLowerCase("pt-BR"));
        const key = part.toLocaleLowerCase("pt-BR");
        if (def && !used.has(key)) {
          used.add(key); // marca só a primeira ocorrência para não poluir o texto
          return <Term key={i} word={part} definition={def} />;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
