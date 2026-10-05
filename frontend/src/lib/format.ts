const TZ = "America/Fortaleza";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
const timeOnly = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });

export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
export const fmtDate = (iso: string) => dateOnly.format(new Date(iso));
export const fmtTime = (iso: string | Date) => timeOnly.format(typeof iso === "string" ? new Date(iso) : iso);
export const shortHash = (h: string, n = 12) => (h.length > n ? `${h.slice(0, n)}…` : h);

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function locatorLabel(loc: { page: number | null; paragraph: number | null }): string {
  if (loc.paragraph && loc.page) return `§ ${loc.paragraph}, p. ${loc.page}`;
  if (loc.paragraph) return `§ ${loc.paragraph}`;
  return `p. ${loc.page}`;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
