import clsx from "clsx";

export function EmptyState({ icon, title, body, action, className }: { icon: React.ReactNode; title: string; body: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-petrol-50 text-petrol-600" aria-hidden="true">{icon}</div>
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      <div className="mt-1.5 max-w-sm text-[13.5px] text-ink-muted">{body}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
