"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage, json } from "@/lib/api";
import { newId } from "@/lib/format";
import type { AnalysisData, AnalysisView, EditableStep, Evidence, EvidenceOrigin, Locator, Rules, Suggestion } from "@/lib/types";

/** Pergunta que recebe os trechos selecionados no documento. */
export interface Target {
  step: EditableStep;
  key: string; // "classificacao" | id do critério | id da pergunta de não rotina
  label: string;
  keywords: string[];
}

export interface NewEvidence {
  text: string;
  locator: Locator;
  origin: EvidenceOrigin;
  keyword?: string | null;
}

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface Jump {
  page: number | null;
  paragraph: number | null;
  evidenceId: string | null;
  nonce: number;
}

interface WorkspaceValue {
  view: AnalysisView;
  rules: Rules;
  suggestions: Suggestion[];
  draft: AnalysisData;
  readOnly: boolean;
  target: Target | null;
  setTarget: (t: Target | null) => void;
  updateDraft: (step: EditableStep, update: (d: AnalysisData) => AnalysisData) => void;
  addEvidence: (ev: NewEvidence, to?: Target | null) => boolean;
  removeEvidence: (step: EditableStep, key: string, id: string) => void;
  evidencesFor: (step: EditableStep, key: string) => Evidence[];
  save: { status: SaveStatus; at: Date | null; error: string | null };
  flush: () => Promise<boolean>;
  completeStep: (step: EditableStep) => Promise<boolean>;
  applyView: (v: AnalysisView) => void;
  attempted: Record<EditableStep, boolean>;
  jump: Jump | null;
  jumpTo: (loc: { page: number | null; paragraph: number | null }, evidenceId?: string | null) => void;
  highlights: boolean;
  setHighlights: (v: boolean) => void;
}

const Ctx = createContext<WorkspaceValue | null>(null);
const AUTOSAVE_MS = 800;

// --------------------------------------------------------------- acesso puro
export function getEvidences(d: AnalysisData, step: EditableStep, key: string): Evidence[] {
  if (step === "classificacao") return d.classification.evidences;
  if (step === "criterios") return d.criteria[key]?.evidences ?? [];
  return d.nao_rotina.answers[key]?.evidences ?? [];
}

function setEvidences(d: AnalysisData, step: EditableStep, key: string, evs: Evidence[]): AnalysisData {
  if (step === "classificacao") return { ...d, classification: { ...d.classification, evidences: evs } };
  if (step === "criterios") {
    const cur = d.criteria[key] ?? { answer: null, justification: "", evidences: [] };
    return { ...d, criteria: { ...d.criteria, [key]: { ...cur, evidences: evs } } };
  }
  const cur = d.nao_rotina.answers[key] ?? { text: "", evidences: [] };
  return { ...d, nao_rotina: { ...d.nao_rotina, answers: { ...d.nao_rotina.answers, [key]: { ...cur, evidences: evs } } } };
}

function payloadFor(d: AnalysisData, step: EditableStep): unknown {
  if (step === "classificacao") return d.classification;
  if (step === "criterios") return d.criteria;
  return d.nao_rotina;
}

/** Copia para o rascunho local o resultado da verificação feita no servidor. */
function mergeVerification(local: AnalysisData, server: AnalysisData): AnalysisData {
  const verified = new Map<string, boolean>();
  const collect = (evs: Evidence[]) => evs.forEach((e) => verified.set(e.id, e.verified));
  collect(server.classification.evidences);
  Object.values(server.criteria).forEach((c) => collect(c.evidences));
  Object.values(server.nao_rotina.answers).forEach((a) => collect(a.evidences));
  const mark = (evs: Evidence[]) => evs.map((e) => (verified.has(e.id) ? { ...e, verified: verified.get(e.id)! } : e));
  return {
    classification: { ...local.classification, evidences: mark(local.classification.evidences) },
    criteria: Object.fromEntries(Object.entries(local.criteria).map(([k, c]) => [k, { ...c, evidences: mark(c.evidences) }])),
    nao_rotina: {
      ...local.nao_rotina,
      answers: Object.fromEntries(Object.entries(local.nao_rotina.answers).map(([k, a]) => [k, { ...a, evidences: mark(a.evidences) }])),
    },
  };
}

// ------------------------------------------------------------------ provider
export function WorkspaceProvider({
  initial,
  rules,
  suggestions,
  children,
}: {
  initial: AnalysisView;
  rules: Rules;
  suggestions: Suggestion[];
  children: React.ReactNode;
}) {
  const { notify } = useToast();
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState(initial.data);
  const [target, setTarget] = useState<Target | null>(null);
  const [save, setSave] = useState<WorkspaceValue["save"]>({ status: "idle", at: null, error: null });
  const [attempted, setAttempted] = useState<Record<EditableStep, boolean>>({ classificacao: false, criterios: false, nao_rotina: false });
  const [jump, setJump] = useState<Jump | null>(null);
  const [highlights, setHighlights] = useState(true);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirty = useRef(new Set<EditableStep>());
  const edits = useRef(0);
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const readOnly = view.status === "finalized";

  const applyView = useCallback((v: AnalysisView) => {
    setView(v);
    setDraft(v.data);
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    if (dirty.current.size === 0) return true;
    const run = (async () => {
      const steps = (["classificacao", "criterios", "nao_rotina"] as const).filter((s) => dirty.current.has(s));
      dirty.current.clear();
      const editsAtStart = edits.current;
      setSave((s) => ({ ...s, status: "saving", error: null }));
      try {
        let last: AnalysisView | null = null;
        for (const step of steps) {
          last = await api<AnalysisView>(`/api/analyses/${view.id}/steps/${step}`, { method: "PUT", ...json(payloadFor(draftRef.current, step)) });
        }
        if (last) {
          setView(last);
          setDraft((local) => (edits.current === editsAtStart ? last!.data : mergeVerification(local, last!.data)));
        }
        setSave({ status: "saved", at: new Date(), error: null });
        return true;
      } catch (e) {
        steps.forEach((s) => dirty.current.add(s)); // nada se perde: tenta de novo no próximo salvamento
        const message = errorMessage(e);
        setSave({ status: "error", at: null, error: message });
        if (e instanceof ApiError && e.status === 409) notify("error", "Etapa bloqueada", message);
        return false;
      }
    })();
    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    return ok;
  }, [notify, view.id]);

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setSave((s) => ({ ...s, status: "pending" }));
    timer.current = window.setTimeout(() => void persist(), AUTOSAVE_MS);
  }, [persist]);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    return persist();
  }, [persist]);

  // Salva ao sair da página com alterações pendentes.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [flush]);

  const updateDraft = useCallback(
    (step: EditableStep, update: (d: AnalysisData) => AnalysisData) => {
      if (readOnly) return;
      edits.current += 1;
      dirty.current.add(step);
      setDraft((d) => update(d));
      schedule();
    },
    [readOnly, schedule],
  );

  const addEvidence = useCallback(
    (ev: NewEvidence, to?: Target | null): boolean => {
      const dest = to ?? target;
      if (readOnly) return false;
      if (!dest) {
        notify("info", "Escolha a pergunta primeiro", "Abra a pergunta que esse trecho sustenta e selecione o texto de novo.");
        return false;
      }
      const policy = rules.politicas;
      const text = ev.text.replace(/\s+/g, " ").trim();
      if (text.length < 3) return false;
      if (text.length > policy.evidencia_max_caracteres) {
        notify("error", "Trecho longo demais", `Selecione só a parte que sustenta a resposta (até ${policy.evidencia_max_caracteres} caracteres).`);
        return false;
      }
      const current = getEvidences(draftRef.current, dest.step, dest.key);
      if (current.length >= policy.evidencias_max_por_pergunta) {
        notify("error", "Limite de trechos atingido", `Cada pergunta aceita até ${policy.evidencias_max_por_pergunta} trechos.`);
        return false;
      }
      const same = current.find((e) => e.text === text && e.locator.page === ev.locator.page && e.locator.paragraph === ev.locator.paragraph);
      if (same) {
        notify("info", "Trecho já anexado", "Esse trecho já sustenta esta pergunta.");
        return false;
      }
      const evidence: Evidence = { id: newId(), text, locator: ev.locator, origin: ev.origin, keyword: ev.keyword ?? null, verified: false };
      updateDraft(dest.step, (d) => setEvidences(d, dest.step, dest.key, [...getEvidences(d, dest.step, dest.key), evidence]));
      notify("success", "Evidência anexada", `Ligada a “${dest.label}”.`);
      return true;
    },
    [notify, readOnly, rules.politicas, target, updateDraft],
  );

  const removeEvidence = useCallback(
    (step: EditableStep, key: string, id: string) =>
      updateDraft(step, (d) => setEvidences(d, step, key, getEvidences(d, step, key).filter((e) => e.id !== id))),
    [updateDraft],
  );

  const completeStep = useCallback(
    async (step: EditableStep) => {
      setAttempted((a) => ({ ...a, [step]: true }));
      const saved = await flush();
      if (!saved) return false;
      try {
        const v = await api<AnalysisView>(`/api/analyses/${view.id}/steps/${step}/complete`, { method: "POST" });
        setView(v);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) {
          const refreshed = await api<AnalysisView>(`/api/analyses/${view.id}`).catch(() => null);
          if (refreshed) setView(refreshed);
          const n = Array.isArray(e.details) ? e.details.length : 0;
          notify("error", "A etapa ainda tem pendências", n ? `Resolva ${n === 1 ? "a pendência destacada" : `as ${n} pendências destacadas`} para avançar.` : e.message);
        } else {
          notify("error", "Não foi possível concluir a etapa", errorMessage(e));
        }
        return false;
      }
    },
    [flush, notify, view.id],
  );

  const jumpTo = useCallback((loc: { page: number | null; paragraph: number | null }, evidenceId: string | null = null) => {
    setJump((j) => ({ page: loc.page, paragraph: loc.paragraph, evidenceId, nonce: (j?.nonce ?? 0) + 1 }));
  }, []);

  const evidencesFor = useCallback((step: EditableStep, key: string) => getEvidences(draft, step, key), [draft]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      view,
      rules,
      suggestions,
      draft,
      readOnly,
      target,
      setTarget,
      updateDraft,
      addEvidence,
      removeEvidence,
      evidencesFor,
      save,
      flush,
      completeStep,
      applyView,
      attempted,
      jump,
      jumpTo,
      highlights,
      setHighlights,
    }),
    [view, rules, suggestions, draft, readOnly, target, updateDraft, addEvidence, removeEvidence, evidencesFor, save, flush, completeStep, applyView, attempted, jump, jumpTo, highlights],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace precisa estar dentro de WorkspaceProvider");
  return v;
}

/** Pendências do servidor para uma pergunta, exibidas depois da primeira tentativa de concluir. */
export function useIssues(step: EditableStep, key: string) {
  const { view, attempted } = useWorkspace();
  const all = (view.issues[step] ?? []).filter((i) => i.target === key);
  return { all, visible: attempted[step] ? all : all.filter((i) => i.code === "evidence_not_found" || i.code === "evidence_too_long") };
}
