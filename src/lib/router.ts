import { useSyncExternalStore } from "react";

/** Rotas por hash: funcionam servidas em subpasta estática e ao recarregar, sem 404. */
export type Route =
  | { name: "explore" }
  | { name: "collection"; id: string }
  | { name: "library" }
  | { name: "playlist"; id: string }
  | { name: "shared"; payload: string }
  | { name: "notFound" };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/" || path === "") return { name: "explore" };
  if (path === "/p" || path === "/p/") return { name: "library" };
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
  explore: () => "#/",
  library: () => "#/p",
  collection: (id: string) => `#/c/${id}`,
  playlist: (id: string) => `#/p/${id}`,
};
