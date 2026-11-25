/** Reconhece links de playlist colados pelo usuário. Só extrai ids; o servidor monta as URLs. */
export type ParsedLink =
  | { service: "deezer"; id: string }
  | { service: "spotify"; id: string }
  | { service: "youtube"; id: string }
  | { service: "deezer-short" }
  | null;

export function parsePlaylistLink(raw: string): ParsedLink {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "deezer.com") {
    const m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?playlist\/(\d{1,15})\/?$/i.exec(url.pathname);
    return m ? { service: "deezer", id: m[1] } : null;
  }
  // Links curtos do app do Deezer redirecionam para outro endereço; seguir redirecionamento seria SSRF.
  if (host === "deezer.page.link" || host === "link.deezer.com") return { service: "deezer-short" };
  if (host === "open.spotify.com") {
    const m = /^\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    return m ? { service: "spotify", id: m[1] } : null;
  }
  if (host === "youtube.com" || host === "youtu.be") {
    const list = url.searchParams.get("list");
    return list && /^[A-Za-z0-9_-]{10,64}$/.test(list) ? { service: "youtube", id: list } : null;
  }
  return null;
}
