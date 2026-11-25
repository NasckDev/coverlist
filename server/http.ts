/** Chamada HTTP às origens: timeout, limite de tamanho e erro tipado, sem vazar detalhe para o cliente. */

/** O feed da Apple às vezes leva 3–5 s a frio; 8 s cobre isso e ainda cabe no limite da Function. */
export const UPSTREAM_TIMEOUT_MS = 8_000;
/** Maior resposta aceita de uma origem (playlist de 100 faixas do Deezer tem ~160 KB). */
export const MAX_UPSTREAM_BYTES = 2_000_000;

export type UpstreamFailure = "timeout" | "http" | "invalid" | "not_found" | "quota";

export class UpstreamError extends Error {
  readonly failure: UpstreamFailure;
  readonly upstream: string;

  constructor(upstream: string, failure: UpstreamFailure, detail: string) {
    super(`${upstream}: ${failure} (${detail})`);
    this.name = "UpstreamError";
    this.failure = failure;
    this.upstream = upstream;
  }
}

export type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface UpstreamOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
}

/**
 * Busca JSON numa URL montada pelo próprio servidor (nunca vinda do cliente).
 * O nome da origem entra só no log; a resposta ao cliente é sempre genérica.
 */
export async function fetchJson(upstream: string, url: string, options: UpstreamOptions = {}): Promise<unknown> {
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? UPSTREAM_TIMEOUT_MS);
  try {
    const response = await doFetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 404) throw new UpstreamError(upstream, "not_found", "http 404");
    if (!response.ok) throw new UpstreamError(upstream, "http", `http ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_UPSTREAM_BYTES) throw new UpstreamError(upstream, "invalid", "too large");
    const body = await response.text();
    if (body.length > MAX_UPSTREAM_BYTES) throw new UpstreamError(upstream, "invalid", "too large");
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new UpstreamError(upstream, "invalid", "not json");
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (controller.signal.aborted) throw new UpstreamError(upstream, "timeout", "aborted");
    throw new UpstreamError(upstream, "http", error instanceof Error ? error.message : "network");
  } finally {
    clearTimeout(timer);
  }
}
