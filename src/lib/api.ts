import { onlineManager, QueryClient, useQuery, type QueryKey } from "@tanstack/react-query";
import type {
  CollectionDetail,
  CollectionSummary,
  ImportedPlaylist,
  PlaylistSearchResult,
  ResolvedPreview,
  SearchResult,
  ShortLinkTarget,
  SpotifyName,
} from "../../server/types";

export const API_PATH = "/api/coverlist";

export type ApiFailure = "offline" | "unavailable" | "not_found" | "bad_request" | "upstream";

export class ApiError extends Error {
  constructor(
    readonly failure: ApiFailure,
    readonly status: number,
  ) {
    super(failure);
    this.name = "ApiError";
  }
}

/** Chama o proxy. Resposta que não é JSON (ex.: site estático sem a Function) vira "unavailable". */
export async function apiGet<T>(op: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ op, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  let response: Response;
  try {
    response = await fetch(`${API_PATH}?${query}`, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(onlineManager.isOnline() ? "unavailable" : "offline", 0);
  }
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  if (!isJson) throw new ApiError("unavailable", response.status);
  if (response.ok) return (await response.json()) as T;
  if (response.status === 404) throw new ApiError("not_found", 404);
  if (response.status === 400) throw new ApiError("bad_request", 400);
  throw new ApiError("upstream", response.status);
}

export function failureMessage(error: unknown): string {
  const failure = error instanceof ApiError ? error.failure : "unavailable";
  switch (failure) {
    case "offline":
      return "Você está sem conexão. Assim que a internet voltar, tente de novo.";
    case "not_found":
      return "Não encontramos isso na origem. Confira o link ou o nome.";
    case "bad_request":
      return "O pedido não foi aceito. Confira o que foi digitado.";
    case "upstream":
      return "O serviço de música não respondeu agora. Tente de novo em instantes.";
    default:
      return "Não foi possível falar com o servidor do Coverlist agora.";
  }
}

const HOUR = 60 * 60 * 1000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10 * 60 * 1000,
        gcTime: 24 * HOUR,
        refetchOnWindowFocus: false,
        // 4xx não melhora repetindo; falha de rede ou da origem tenta mais duas vezes.
        retry: (count, error) => !(error instanceof ApiError && (error.failure === "not_found" || error.failure === "bad_request")) && count < 2,
      },
    },
  });
}

/** Só as coleções vão para o cache persistido (offline); busca e prévias assinadas não. */
export const PERSISTED_KEYS = new Set(["collections", "collection"]);
export const shouldPersist = (key: QueryKey) => typeof key[0] === "string" && PERSISTED_KEYS.has(key[0]);

export interface CollectionsList {
  version: string;
  collections: CollectionSummary[];
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: ({ signal }) => apiGet<CollectionsList>("collections", {}, signal),
    staleTime: 6 * HOUR,
  });
}

export function useCollection(id: string | null) {
  return useQuery({
    queryKey: ["collection", id],
    queryFn: ({ signal }) => apiGet<CollectionDetail>("collection", { id: id ?? "" }, signal),
    enabled: !!id,
    staleTime: HOUR,
  });
}

export function useSearch(term: string) {
  const q = term.replace(/\s+/g, " ").trim();
  return useQuery({
    queryKey: ["search", q.toLowerCase()],
    queryFn: ({ signal }) => apiGet<SearchResult>("search", { q, limit: 20 }, signal),
    enabled: q.length >= 2,
    staleTime: 15 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
}

export const fetchDeezerPlaylist = (id: string) => apiGet<ImportedPlaylist>("playlist", { id });
export const fetchSpotifyName = (id: string) => apiGet<SpotifyName>("spotify", { id });
export const resolveDeezerShareLink = (code: string) => apiGet<ShortLinkTarget>("shortlink", { code });

/** Playlists públicas do Deezer pelo nome: a alternativa quando a pessoa não tem (ou não consegue colar) o link. */
export function usePlaylistSearch(term: string) {
  const q = term.replace(/\s+/g, " ").trim();
  return useQuery({
    queryKey: ["playlists", q.toLowerCase()],
    queryFn: ({ signal }) => apiGet<PlaylistSearchResult>("playlists", { q, limit: 12 }, signal),
    enabled: q.length >= 2 && q.length <= 80,
    staleTime: 15 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
}

/** Prévia do iTunes que o lookup em lote da parada não trouxe: busca a faixa sozinha na hora de tocar. */
export function resolveItunesPreview(client: QueryClient, trackId: string, country: string): Promise<ResolvedPreview> {
  return client.fetchQuery({
    queryKey: ["preview-it", trackId, country],
    queryFn: ({ signal }) => apiGet<ResolvedPreview>("lookup", { id: trackId, country }, signal),
    staleTime: 60 * 60 * 1000,
  });
}

/** Margem antes da expiração da URL assinada do Deezer. */
const PREVIEW_SAFETY_MS = 60_000;

/** Resolve a prévia do Deezer na hora de tocar, reaproveitando enquanto a assinatura vale. */
export function resolveDeezerPreview(client: QueryClient, trackId: string): Promise<ResolvedPreview> {
  return client.fetchQuery({
    queryKey: ["preview", trackId],
    queryFn: ({ signal }) => apiGet<ResolvedPreview>("track", { id: trackId }, signal),
    staleTime: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      return expiresAt ? Math.max(0, expiresAt - Date.now() - PREVIEW_SAFETY_MS) : 5 * 60 * 1000;
    },
    gcTime: 15 * 60 * 1000,
  });
}
