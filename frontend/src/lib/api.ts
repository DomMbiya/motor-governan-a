// Cliente HTTP: a interface fala só com a API local (proxy do Next em /api).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const OFFLINE_MESSAGE = "Não foi possível falar com a API local. Verifique se o serviço do backend está em execução.";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  const isForm = init.body instanceof FormData;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...(isForm || !init.body ? {} : { "Content-Type": "application/json" }), Accept: "application/json", ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network_error", OFFLINE_MESSAGE);
  }
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  let body: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
  try {
    body = await response.json();
  } catch {
    /* corpo não-JSON (ex.: proxy fora do ar) */
  }
  const message =
    body?.error?.message ??
    (response.status >= 500 ? "Erro no servidor local. O ocorrido foi registrado nos logs." : `Falha na requisição (${response.status}).`);
  throw new ApiError(response.status, body?.error?.code ?? "http_error", message, body?.error?.details ?? null);
}

export const json = (data: unknown): RequestInit => ({ body: JSON.stringify(data) });

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Erro inesperado.";
}
