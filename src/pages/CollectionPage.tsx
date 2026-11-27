import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CollectionDetail, CollectionSummary, ThemeKey, Track } from "../../server/types";
import { ErrorState, mosaic, OfflineBanner, Topbar, useToast } from "../components/Chrome";
import { Icon } from "../components/icons";
import { ShareDialog } from "../components/ShareDialog";
import { Studio, type BackTarget } from "../components/Studio";
import { ReadonlyTrackList } from "../components/TrackList";
import { VisualTab } from "../components/VisualTab";
import { failureMessage, useCollection, useCollections } from "../lib/api";
import { eraLabel, filterLabel, groupTitle, SCOPE_LABEL } from "../lib/collections";
import { formatDate, plural, themeVars, totalMinutes, type LayoutKey } from "../lib/design";
import { exploreBackHref, href, navigate, parseRoute, takeAutoplay } from "../lib/router";
import { usePlayer } from "../player/PlayerProvider";
import { usePlaylists } from "../store/playlists";
import { DESC_MAX, MAX_TRACKS, NAME_MAX } from "../store/schema";

/** Quantas coleções irmãs aparecem em "Mais em …". */
const RELATED_COUNT = 8;

export function LoadingStudio({ label }: { label: string }) {
  return (
    <div className="page">
      <Topbar current="explore" />
      <main className="page-main" id="conteudo" tabIndex={-1} aria-busy="true">
        <p className="sr" role="status">
          {label}
        </p>
        <div className="mini skeleton" style={{ maxWidth: 520 }} />
        <span className="skeleton skeleton-line" style={{ maxWidth: 320 }} />
      </main>
    </div>
  );
}

/** Volta para o mesmo filtro de Explorar de onde a pessoa veio; sem histórico, para o grupo da coleção. */
function backTarget(group: CollectionSummary["group"] | undefined): BackTarget {
  const remembered = exploreBackHref();
  const route = remembered ? parseRoute(remembered) : null;
  if (remembered && route?.name === "explore") return { href: remembered, label: filterLabel(route) };
  return group ? { href: href.explore({ group }), label: groupTitle(group) } : { href: href.explore(), label: "Explorar" };
}

export function durationLabel(tracks: readonly Track[]): string | null {
  const min = totalMinutes(tracks);
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

function kicker(detail: CollectionSummary): string {
  if (detail.era) return `${groupTitle(detail.group)} · ${eraLabel(detail.era)}`;
  if (detail.scope) return `${groupTitle(detail.group)} · ${SCOPE_LABEL[detail.scope]}`;
  return groupTitle(detail.group);
}

/** Cabeçalho do painel: capa em miniatura (gira enquanto toca), números reais da coleção e as ações de ouvir. */
function CollectionHeader({ detail, theme, tracks, queueKey }: { detail: CollectionDetail; theme: ThemeKey; tracks: Track[]; queueKey: string }) {
  const player = usePlayer();
  const playableIdx = useMemo(() => tracks.flatMap((t, i) => (t.preview ? [i] : [])), [tracks]);
  const artists = useMemo(() => new Set(tracks.map((t) => t.artist.toLowerCase())).size, [tracks]);
  const active = player.queueKey === queueKey;
  const playing = active && player.isPlaying;
  const updated = formatDate(detail.updatedAt);
  const duration = durationLabel(tracks);
  const deezerUrl = detail.source.kind === "deezer-playlist" ? `https://www.deezer.com/playlist/${detail.source.playlistId}` : null;

  const listen = () => {
    if (playing || (active && player.status === "paused" && player.audio?.getAttribute("src"))) return player.toggle();
    if (playableIdx.length) player.play(playableIdx[0]);
  };
  const shuffle = () => {
    const options = playableIdx.filter((i) => !active || i !== player.index);
    if (options.length) player.play(options[Math.floor(Math.random() * options.length)]);
  };

  return (
    <div className="col-head">
      <div className="col-head-top">
        <div className={`col-art${playing ? " spinning" : ""}`} style={themeVars(theme) as CSSProperties} aria-hidden="true">
          <div className="mdisc">
            <div className="mlabel" style={{ background: mosaic(tracks, detail.title) }} />
          </div>
        </div>
        <div className="col-head-text">
          <p className="col-kicker">{kicker(detail)}</p>
          <p className="col-title">{detail.title}</p>
          <p className="col-desc">{detail.description}</p>
        </div>
      </div>
      <ul className="stats" aria-label="Resumo da coleção">
        <li>
          <b>{tracks.length}</b> {tracks.length === 1 ? "faixa" : "faixas"}
          {detail.total > tracks.length ? ` de ${detail.total}` : ""}
        </li>
        {duration && (
          <li>
            <b>{duration}</b>
          </li>
        )}
        <li>
          <b>{playableIdx.length}</b> {playableIdx.length === 1 ? "prévia" : "prévias"}
        </li>
        <li>
          <b>{artists}</b> {artists === 1 ? "artista" : "artistas"}
        </li>
      </ul>
      <p className="col-source">
        {detail.source.label}
        {updated ? ` · atualizado em ${updated}` : ""}
        {deezerUrl && (
          <>
            {" · "}
            <a href={deezerUrl} target="_blank" rel="noopener noreferrer">
              Abrir no Deezer
              <Icon.external />
              <span className="sr"> (abre em nova aba)</span>
            </a>
          </>
        )}
      </p>
      <div className="col-actions">
        <button type="button" className="solid" onClick={listen} disabled={!playableIdx.length}>
          {playing ? <Icon.pause /> : <Icon.play />}
          {playing ? "Pausar prévia" : "Ouvir prévias"}
        </button>
        <button type="button" className="ghost" onClick={shuffle} disabled={playableIdx.length < 2}>
          <Icon.shuffle />
          Faixa aleatória
        </button>
      </div>
    </div>
  );
}

/** Coleções irmãs (mesmo grupo; em décadas, primeiro a mesma década): troca de gênero ou década sem voltar. */
function Related({ current }: { current: CollectionSummary }) {
  const collections = useCollections();
  const list = collections.data?.collections ?? [];
  const siblings = list
    .filter((c) => c.group === current.group && c.id !== current.id)
    .sort((a, b) => Number(b.era === current.era && !!current.era) - Number(a.era === current.era && !!current.era) || Number(b.scope === current.scope) - Number(a.scope === current.scope))
    .slice(0, RELATED_COUNT);
  if (!siblings.length) return null;
  const title = groupTitle(current.group);
  return (
    <nav className="related" aria-labelledby="rel-h">
      <h2 id="rel-h">Mais em {title}</h2>
      <div className="chips">
        {siblings.map((c) => (
          <a key={c.id} className="chip" href={href.collection(c.id)}>
            {c.title}
          </a>
        ))}
        <a className="chip all" href={href.explore({ group: current.group })}>
          Ver {current.group === "decadas" ? "todas" : "todos"}
        </a>
      </div>
    </nav>
  );
}

/** O play do cartão em Explorar abre a coleção já tocando a primeira faixa com prévia. */
function useAutoplay(id: string, queueKey: string, tracks: Track[] | undefined) {
  const player = usePlayer();
  const done = useRef(false);
  const { play, queueKey: current } = player;
  useEffect(() => {
    if (done.current || !tracks || current !== queueKey) return;
    done.current = true;
    if (!takeAutoplay(id)) return;
    const first = tracks.findIndex((t) => t.preview);
    if (first >= 0) play(first);
  }, [id, queueKey, tracks, current, play]);
}

function CollectionError({ query, back }: { query: ReturnType<typeof useCollection>; back: BackTarget }) {
  const notFound = query.error && "failure" in query.error && query.error.failure === "not_found";
  return (
    <div className="page">
      <Topbar current="explore" />
      <main className="page-main" id="conteudo" tabIndex={-1}>
        <a className="back-btn page-back" href={back.href} aria-label={`Voltar para ${back.label}`}>
          <Icon.back />
          <span>{back.label}</span>
        </a>
        {query.isError ? (
          <ErrorState title={notFound ? "Coleção não encontrada" : "Não deu para abrir a coleção"} message={failureMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <ErrorState title="Sem conexão" message="Esta coleção ainda não foi salva neste navegador. Conecte-se para abrir." />
        )}
      </main>
    </div>
  );
}

export function CollectionPage({ id }: { id: string }) {
  const query = useCollection(id);
  const playlists = usePlaylists();
  const toast = useToast();
  const player = usePlayer();
  const [theme, setTheme] = useState<ThemeKey | null>(null);
  const [layout, setLayout] = useState<LayoutKey>("editorial");
  const [sharing, setSharing] = useState(false);
  const detail = query.data;
  const tracks = useMemo(() => detail?.tracks ?? [], [detail]);
  const queueKey = `c-${id}`;
  const playingIndex = player.queueKey === queueKey ? player.index : 0;
  const effectiveTheme = theme ?? detail?.theme ?? "cobalto";
  useAutoplay(id, queueKey, detail?.tracks);
  const shareContent = useMemo(
    () => ({
      name: detail?.title ?? "",
      description: detail?.description ?? "",
      by: "",
      theme: effectiveTheme,
      tracks: tracks.slice(0, MAX_TRACKS),
      current: Math.min(playingIndex, MAX_TRACKS - 1),
    }),
    [detail, effectiveTheme, tracks, playingIndex],
  );
  const back = backTarget(detail?.group);

  if (!detail) {
    if (query.isError || query.fetchStatus === "paused") return <CollectionError query={query} back={back} />;
    return <LoadingStudio label="Carregando a coleção…" />;
  }

  const meta = { name: detail.title, description: detail.description, by: "", theme: effectiveTheme, layout };
  const withoutPreview = tracks.filter((t) => !t.preview).length;

  const useAsBase = () => {
    const created = playlists.create({
      name: detail.title.slice(0, NAME_MAX),
      description: detail.description.slice(0, DESC_MAX),
      theme: meta.theme,
      layout,
      tracks: tracks.slice(0, MAX_TRACKS),
      origin: detail.title,
    });
    if (!created) return toast("Você chegou ao limite de playlists. Exclua uma para criar outra.");
    toast(
      tracks.length > MAX_TRACKS
        ? `Playlist criada com as ${MAX_TRACKS} primeiras das ${tracks.length} faixas de “${detail.title}” (limite por playlist).`
        : `Playlist criada com ${plural(created.tracks.length, "faixa", "faixas")} de “${detail.title}”.`,
    );
    navigate(href.playlist(created.id));
  };

  return (
    <>
      <Studio
        panelLabel={`Coleção ${detail.title}`}
        back={back}
        queueKey={queueKey}
        meta={meta}
        tracks={tracks}
        header={
          <>
            <CollectionHeader detail={detail} theme={meta.theme} tracks={tracks} queueKey={queueKey} />
            <OfflineBanner note="Mostrando a coleção salva. As prévias precisam de internet." />
            {withoutPreview > 0 && (
              <p className="banner" role="note">
                {plural(withoutPreview, "faixa", "faixas")} sem prévia de 30 s na fonte. Elas aparecem marcadas e o player pula essas faixas.
              </p>
            )}
          </>
        }
        tabs={[
          {
            id: "faixas",
            label: (
              <>
                Faixas <b>{tracks.length}</b>
              </>
            ),
            content: (
              <>
                <ReadonlyTrackList tracks={tracks} queueKey={queueKey} />
                <Related current={detail} />
              </>
            ),
          },
          { id: "visual", label: "Visual", content: <VisualTab theme={meta.theme} layout={layout} onTheme={setTheme} onLayout={setLayout} /> },
        ]}
        foot={
          <div className="row-btns">
            <button type="button" className="solid" onClick={useAsBase} disabled={!playlists.ready}>
              Usar como base
            </button>
            <button type="button" className="ghost share-btn" onClick={() => setSharing(true)}>
              Compartilhar
            </button>
          </div>
        }
      />
      <ShareDialog open={sharing} onClose={() => setSharing(false)} layout={layout} content={shareContent} />
    </>
  );
}
