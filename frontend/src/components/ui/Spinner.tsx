import clsx from "clsx";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <svg className={clsx("animate-spin", className ?? "h-5 w-5")} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={clsx("block animate-pulse rounded bg-paper-deep", className)} />;
}
