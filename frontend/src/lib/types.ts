// Tipos espelhados da API. A fonte da verdade é o backend (app/domain/models.py).

export type Answer = "sim" | "nao" | "inconclusivo";
export type EvidenceOrigin = "selecionado_analista" | "sugerido_confirmado";
export type EditableStep = "classificacao" | "criterios" | "nao_rotina";
export type StepId = "abertura" | EditableStep | "resumo" | "parecer" | "dossie";
export type StepState = "complete" | "available" | "locked";
export type Outcome = "favoravel" | "desfavoravel" | "requer_especialista" | "bloqueado";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Locator { page: number | null; paragraph: number | null; rects: Rect[] }

export interface Evidence {
  id: string;
  text: string;
  locator: Locator;
  origin: EvidenceOrigin;
  keyword: string | null;
  verified: boolean;
}

export interface CriterionResponse { answer: Answer | null; justification: string; evidences: Evidence[] }
export interface ClassificationResponse { option_id: string | null; justification: string; evidences: Evidence[] }
export interface NaoRotinaAnswer { text: string; evidences: Evidence[] }
export interface NaoRotinaResponse {
  answers: Record<string, NaoRotinaAnswer>;
  exclusions_marked: string[];
  exclusions_explanation: string;
}
export interface AnalysisData {
  classification: ClassificationResponse;
  criteria: Record<string, CriterionResponse>;
  nao_rotina: NaoRotinaResponse;
}

export interface DocumentInfo {
  original_filename: string;
  source_format: "pdf" | "docx" | "txt" | "md" | "csv" | "xlsx";
  view: "pdf" | "text";
  page_count: number;
  paragraph_count: number;
  sha256: string;
  size_bytes: number;
  uploaded_at: string;
  ocr_applied: boolean;
  warnings: string[];
}

export interface Issue { step: string; target: string; field: string; code: string; message: string }

export interface SpecialistPoint { kind: "criterio" | "exclusao"; target: string; label: string; detail: string }
export interface Indicative {
  outcome: Outcome;
  label: string;
  description: string;
  reason: string;
  rule_id: string | null;
  aligned_decision: string | null;
  criteria_not_met: string[];
  specialist_points: SpecialistPoint[];
  pending: number;
}

export interface Opinion {
  decision: string;
  justification: string;
  divergent: boolean;
  aligned_decision: string;
  divergence_justification: string | null;
  signed_by: string;
  signed_at: string;
}

export interface StepInfo { id: StepId; label: string; state: StepState; pending: number }

export interface AnalysisView {
  id: string;
  status: "draft" | "finalized";
  created_at: string;
  updated_at: string;
  analyst_name: string;
  project_name: string;
  area: string;
  rules: { version: string; checksum: string; is_active: boolean };
  document: DocumentInfo | null;
  data: AnalysisData;
  issues: Record<string, Issue[]>;
  steps: StepInfo[];
  indicative: Indicative;
  opinion: Opinion | null;
  integrity: { content_hash: string; pdf_sha256: string; audit_seq: number; finalized_at: string } | null;
}

export interface Suggestion {
  id: string;
  target: string; // "criterio:<id>" | "nao_rotina:<id>"
  text: string;
  page: number | null;
  paragraph: number | null;
  keywords: string[];
  score: number;
}

export interface Paragraph { n: number; text: string; page: number | null }

// ---- Base de regras (YAML) ------------------------------------------------
export interface Source { id: string; titulo: string; referencia: string | null; observacao: string | null }
export interface ClassificationOption { id: string; rotulo: string; descricao: string; exemplo: string }
export interface Criterion {
  id: string;
  rotulo: string;
  pergunta: string;
  definicao: string;
  exemplo_sim: string;
  exemplo_nao: string;
  evidencia_suficiente: string;
  fonte: string;
  palavras_chave: string[];
}
export interface NaoRotinaQuestion { id: string; ordem: number; pergunta: string; ajuda: string; palavras_chave: string[] }
export interface ExclusionItem { id: string; rotulo: string; descricao: string }
export interface Rules {
  schema: number;
  metadados: { versao: string; vigencia: string; titulo: string; responsavel: string; changelog: { versao: string; data: string; descricao: string }[] };
  politicas: {
    justificativa_min_caracteres: number;
    divergencia_min_caracteres: number;
    evidencia_max_caracteres: number;
    evidencias_max_por_pergunta: number;
    sugestoes_max_por_pergunta: number;
  };
  fontes: Source[];
  classificacao: { pergunta: string; ajuda: string; fonte: string; opcoes: ClassificationOption[] };
  criterios: Criterion[];
  nao_rotina: {
    titulo: string;
    ajuda: string;
    fonte: string;
    perguntas: NaoRotinaQuestion[];
    exclusoes: { ordem: number; pergunta: string; ajuda: string; fonte: string; itens: ExclusionItem[] };
  };
  indicativo: {
    aviso: string;
    resultados: { id: string; rotulo: string; descricao: string; parecer_alinhado: string }[];
    regras: { id: string; quando: Record<string, string | boolean | null>; resultado: string; motivo: string }[];
  };
  parecer: { opcoes: { id: string; rotulo: string; descricao: string }[] };
  dossie: { titulo: string; subtitulo: string; ressalva: string };
  glossario: { termo: string; definicao: string }[];
}
export interface RulesPayload { version: string; checksum: string; rules: Rules }

export interface PortfolioItem {
  id: string;
  project_name: string;
  area: string;
  analyst_name: string;
  status: "draft" | "finalized";
  created_at: string;
  finalized_at: string | null;
  rules_version: string;
  indicative: Outcome | null;
  decision: string | null;
  divergent: boolean | null;
  inconclusive_criteria: string[];
  has_document: boolean;
}

export interface Health {
  status: "ok" | "degraded";
  rules_version: string;
  rules_rejected: { file: string; reason: string }[];
  audit_chain_ok: boolean;
  audit_entries: number;
  offline: boolean;
}

export interface AuditEntry { seq: number; ts: string; event: string; actor: string; payload: Record<string, unknown>; entry_hash: string; prev_hash: string }
export interface IntegrityReport {
  ok: boolean;
  content_hash_ok: boolean;
  pdf_hash_ok: boolean;
  chain_ok: boolean;
  chain_entries: number;
  chain_broken_at: number | null;
  content_hash: string;
  pdf_sha256: string;
  audit_seq: number;
}
