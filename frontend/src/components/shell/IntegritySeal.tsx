import clsx from "clsx";

interface Props {
  contentHash: string;
  auditSeq: number;
  rulesVersion: string;
  size?: number;
  animate?: boolean;
  className?: string;
}

/**
 * Selo de integridade: o hash do conteúdo do dossiê gravado ao redor de um
 * carimbo. É o elemento visual que resume a proposta: o processo é
 * determinístico, e qualquer alteração posterior é detectável.
 */
export function IntegritySeal({ contentHash, auditSeq, rulesVersion, size = 168, animate = false, className }: Props) {
  const ring = `conteúdo íntegro · sha-256 ${contentHash.slice(0, 40)} · registro nº ${auditSeq} · `;
  const pathId = `seal-${contentHash.slice(0, 8)}`;
  return (
    <figure
      className={clsx("relative inline-block shrink-0 text-petrol-600", animate && "animate-stamp", !animate && "-rotate-[8deg]", className)}
      style={{ width: size, height: size }}
      aria-label={`Selo de integridade. Hash do conteúdo ${contentHash}. Registro de auditoria número ${auditSeq}. Base de regras versão ${rulesVersion}.`}
      role="img"
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
        <defs>
          <path id={pathId} d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="1" />
        <text fill="currentColor" fontFamily='"IBM Plex Mono", monospace' fontSize="9.6" letterSpacing="0.4">
          <textPath href={`#${pathId}`} textLength="486" lengthAdjust="spacing">{ring}</textPath>
        </text>
        <circle cx="100" cy="100" r="64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" />
        <path d="M84 98l11 11 22-24" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="100" y="135" textAnchor="middle" fill="currentColor" fontFamily='"IBM Plex Sans", sans-serif' fontSize="13" fontWeight="600">
          Dossiê
        </text>
        <text x="100" y="151" textAnchor="middle" fill="currentColor" fontFamily='"IBM Plex Mono", monospace' fontSize="10">
          regras v{rulesVersion}
        </text>
      </svg>
    </figure>
  );
}
