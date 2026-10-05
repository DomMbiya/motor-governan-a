"use client";

import clsx from "clsx";
import { FileText, UploadCloud, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { fmtBytes } from "@/lib/format";

const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.xlsx";
const ALLOWED = ["pdf", "docx", "txt", "md", "csv", "xlsx"];
export const MAX_MB = 25;

interface Props {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string | null;
  disabled?: boolean;
}

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.includes(ext)) return "Formato não suportado. Envie PDF, DOCX, TXT, MD, CSV ou XLSX.";
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_MB * 1024 * 1024) return `O arquivo passa do limite de ${MAX_MB} MB.`;
  return null;
}

/** Área de envio do material do projeto. Aceita arrastar e soltar ou teclado. */
export function Dropzone({ file, onChange, error, disabled }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    onChange(f);
  };

  if (file) {
    return (
      <div className={clsx("flex items-center gap-3 rounded-lg border bg-white p-3", error ? "border-nao" : "border-line-strong")}>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-petrol-50 text-petrol-600"><FileText className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{file.name}</p>
          <p className="text-[12.5px] text-ink-muted">{fmtBytes(file.size)}</p>
        </div>
        <button type="button" disabled={disabled} onClick={() => onChange(null)} className="rounded p-1.5 text-ink-faint hover:bg-paper hover:text-ink" aria-label={`Remover ${file.name}`}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) pick(e.dataTransfer.files[0]);
        }}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          over ? "border-petrol-600 bg-petrol-50" : error ? "border-nao bg-nao-bg/40" : "border-line-strong bg-white hover:border-petrol-500 hover:bg-petrol-50/40",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="h-7 w-7 text-petrol-600" aria-hidden="true" />
        <span className="mt-2 text-[14px] font-medium text-ink">Arraste o relatório do projeto ou clique para escolher</span>
        <span className="mt-1 text-[12.5px] text-ink-muted">PDF, DOCX, TXT, MD, CSV ou XLSX, até {MAX_MB} MB. O arquivo fica só nesta máquina.</span>
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p role="alert" className="mt-1.5 text-[12.5px] text-nao">{error}</p>}
    </div>
  );
}
