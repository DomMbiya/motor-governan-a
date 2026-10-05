"use client";

import clsx from "clsx";
import { BookOpenCheck, ShieldAlert, ShieldCheck, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHealth } from "@/lib/useHealth";
import { Emblem } from "./Emblem";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { health, offline } = useHealth();
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md pr-2" aria-label="Motor de Governança, página inicial">
          <Emblem />
          <span className="hidden leading-tight sm:block">
            <span className="block text-[14px] font-semibold text-ink">Motor de Governança</span>
            <span className="block text-2xs text-ink-muted">Análise preliminar · Lei do Bem</span>
          </span>
        </Link>

        <div className="min-w-0 flex-1">{children}</div>

        <nav aria-label="Principal" className="flex items-center gap-1">
          <Link
            href="/regras"
            className={clsx(
              "hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] md:inline-flex",
              path === "/regras" ? "bg-petrol-50 text-petrol-700" : "text-ink-soft hover:bg-paper",
            )}
          >
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            Base de regras {health && <span className="font-mono text-[12px]">v{health.rules_version}</span>}
          </Link>
          <HealthPill offline={offline} chainOk={health?.audit_chain_ok} entries={health?.audit_entries} />
        </nav>
      </div>
    </header>
  );
}

function HealthPill({ offline, chainOk, entries }: { offline: boolean; chainOk?: boolean; entries?: number }) {
  if (offline) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 rounded-md bg-nao-bg px-2.5 py-1.5 text-[12.5px] font-medium text-nao">
        <WifiOff className="h-4 w-4" aria-hidden="true" /> API local indisponível
      </span>
    );
  }
  if (chainOk === undefined) return null;
  return chainOk ? (
    <span
      title={`Trilha de auditoria verificada: ${entries} registros encadeados por hash`}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] text-sim"
    >
      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">Trilha íntegra</span>
      <span className="sr-only lg:hidden">Trilha de auditoria íntegra</span>
    </span>
  ) : (
    <span role="alert" className="inline-flex items-center gap-1.5 rounded-md bg-nao-bg px-2.5 py-1.5 text-[12.5px] font-medium text-nao">
      <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Trilha de auditoria violada
    </span>
  );
}
