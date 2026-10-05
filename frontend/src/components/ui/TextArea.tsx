"use client";

import clsx from "clsx";
import { useId } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  hint?: React.ReactNode;
  error?: string | null;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/** Campo de texto com contador do mínimo exigido pela base de regras. */
export function TextArea({ label, value, onChange, min, max = 4000, hint, error, rows = 3, disabled, placeholder, className }: Props) {
  const id = useId();
  const size = value.trim().length;
  const short = min !== undefined && size > 0 && size < min;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null, min ? `${id}-count` : null].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">{label}</label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={max}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy || undefined}
        className="input resize-y leading-relaxed"
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        <div>
          {error && <p id={`${id}-err`} className="text-[12.5px] text-nao">{error}</p>}
          {!error && hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
        </div>
        {min !== undefined && (
          <p id={`${id}-count`} className={clsx("shrink-0 text-2xs tabular-nums", short ? "text-inc" : size >= min ? "text-sim" : "text-ink-faint")}>
            {size >= min ? `${size} caracteres` : `${size}/${min} mín.`}
          </p>
        )}
      </div>
    </div>
  );
}
