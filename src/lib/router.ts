import { useSyncExternalStore } from "react";
import type { CollectionGroup, CollectionScope, Era } from "../../server/types";

/** Filtro da tela Explorar: grupo e, dentro dele, década (décadas) ou recorte Brasil/Mundo (décadas e gêneros). */
export interface ExploreFilter {
  group?: CollectionGroup;
  era?: Era;
  scope?: CollectionScope;
}

/** Rotas por hash: funcionam servidas em subpasta estática e ao recarregar, sem 404. */
export type Route =
  | ({ name: "explore" } & ExploreFilter)
  | { name: "collection"; id: string }
  | { name: "library" }
  | { name: "playlist"; id: string }
  | { name: "shared"; payload: string }
  | { name: "notFound" };

const EXPLORE = /^\/g\/(paradas|decadas|generos)(?:\/(1960|1970|1980|1990|2000|2010|2020|brasil|mundo))?$/;

function parseExplore(path: string): Route | null {
  const m = EXPLORE.exec(path);
  if (!m) return null;
  const group = m[1] as CollectionGroup;
  const sub = m[2];
  if (!sub) return { name: "explore", group };
  if (sub === "brasil" || sub === "mundo") return group === "paradas" ? null : { name: "explore", group, scope: sub };
  return group === "decadas" ? { name: "explore", group, era: Number(sub) as Era } : null;
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/" || path === "") return { name: "explore" };
  if (path === "/p" || path === "/p/") return { name: "library" };
  const explore = parseExplore(path);
  if (explore) return explore;
  let m = /^\/c\/([a-z0-9-]{1,40})$/.exec(path);
  if (m) return { name: "collection", id: m[1] };
  m = /^\/p\/([A-Za-z0-9_-]{4,40})$/.exec(path);
  if (m) return { name: "playlist", id: m[1] };
  m = /^\/s\/([A-Za-z0-9_-]{1,16000})$/.exec(path);
  if (m) return { name: "shared", payload: m[1] };
  return { name: "notFound" };
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return parseRoute(hash);
}

export function navigate(path: string) {
  window.location.hash = path;
}

export const href = {
  explore: (filter: ExploreFilter = {}) => {
    if (!filter.group) return "#/";
    const sub = filter.era ?? filter.scope;
    return `#/g/${filter.group}${sub ? `/${sub}` : ""}`;
  },
  library: () => "#/p",
  collection: (id: string) => `#/c/${id}`,
  playlist: (id: string) => `#/p/${id}`,
};

/* Volta da coleção para o mesmo filtro de Explorar de onde a pessoa veio (vale só nesta visita). */
let lastExplore: string | null = null;
export const rememberExplore = (hash: string) => void (lastExplore = hash);
export const exploreBackHref = () => lastExplore;

/**
 * Pedido de tocar ao abrir: o botão de play do cartão abre a coleção já tocando. Vale uma vez e só por
 * AUTOPLAY_WINDOW_MS: se a coleção não carregar a tempo, abrir a mesma coleção depois não toca sozinho.
 */
const AUTOPLAY_WINDOW_MS = 20_000;
let autoplay: { id: string; at: number } | null = null;
export const requestAutoplay = (collectionId: string, now = Date.now()) => void (autoplay = { id: collectionId, at: now });
export function takeAutoplay(collectionId: string, now = Date.now()): boolean {
  const pending = autoplay;
  autoplay = null;
  return !!pending && pending.id === collectionId && now - pending.at <= AUTOPLAY_WINDOW_MS;
}
