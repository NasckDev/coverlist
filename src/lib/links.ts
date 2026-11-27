/** Reconhece links de playlist colados pelo usuário. Só extrai ids e códigos; o servidor monta as URLs. */
export type ParsedLink =
  | { service: "deezer"; id: string }
  /** Link do botão "Compartilhar" do app do Deezer: o servidor descobre o destino pelo código. */
  | { service: "deezer-share"; code: string }
  /** Link curto antigo (deezer.page.link): não é lido. */
  | { service: "deezer-short" }
  | { service: "deezer-other"; kind: "album" | "track" | "artist" }
  | { service: "spotify"; id: string }
  | { service: "youtube"; id: string }
  | { service: "apple" }
  | null;

const URL_IN_TEXT = /(?<![\w.@/-])(?:https?:\/\/|www\.|link\.deezer\.com\/|deezer\.com\/|open\.spotify\.com\/|music\.apple\.com\/)\S+/i;

/**
 * O texto que o app copia ao compartilhar costuma vir com frase em volta ("Ouça … no Deezer: https://…").
 * Devolve só o endereço; sem endereço, devolve null.
 */
export function extractLink(raw: string): string | null {
  const match = URL_IN_TEXT.exec(raw.trim());
  if (!match) return null;
  const link = match[0].replace(/[).,;!?»"']+$/, "");
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

export function parsePlaylistLink(raw: string): ParsedLink {
  const text = raw.trim();
  // Só número com 6 dígitos ou mais vale como id de playlist do Deezer; "1989" continua sendo busca pelo nome.
  if (/^[1-9]\d{5,14}$/.test(text)) return { service: "deezer", id: text };
  const uri = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return { service: "spotify", id: uri[1] };
  const link = extractLink(text);
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (host === "deezer.com") {
    const m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|album|track|artist)\/(\d{1,15})\/?$/i.exec(url.pathname);
    if (!m) return null;
    const kind = m[1].toLowerCase();
    return kind === "playlist" ? { service: "deezer", id: m[2] } : { service: "deezer-other", kind: kind as "album" | "track" | "artist" };
  }
  if (host === "link.deezer.com") {
    const m = /^\/s\/([A-Za-z0-9]{4,40})\/?$/.exec(url.pathname);
    return m ? { service: "deezer-share", code: m[1] } : { service: "deezer-short" };
  }
  // Links do Firebase (deezer.page.link) redirecionam para qualquer lugar; seguir seria SSRF.
  if (host === "deezer.page.link") return { service: "deezer-short" };
  if (host === "open.spotify.com") {
    const m = /^\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    return m ? { service: "spotify", id: m[1] } : null;
  }
  if (host === "music.apple.com") return /\/playlist\//.test(url.pathname) ? { service: "apple" } : null;
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
    const list = url.searchParams.get("list");
    return list && /^[A-Za-z0-9_-]{10,64}$/.test(list) ? { service: "youtube", id: list } : null;
  }
  return null;
}
