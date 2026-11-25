import { useMemo, useState } from "react";
import type { ThemeKey } from "../../server/types";
import { ErrorState, OfflineBanner, Topbar, useToast } from "../components/Chrome";
import { ShareDialog } from "../components/ShareDialog";
import { Studio } from "../components/Studio";
import { ReadonlyTrackList } from "../components/TrackList";
import { VisualTab } from "../components/VisualTab";
import { failureMessage, useCollection } from "../lib/api";
import { formatDate, plural, type LayoutKey } from "../lib/design";
import { href, navigate } from "../lib/router";
import { usePlayer } from "../player/PlayerProvider";
import { usePlaylists } from "../store/playlists";
import { DESC_MAX, MAX_TRACKS, NAME_MAX } from "../store/schema";

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
  const playingIndex = player.queueKey === `c-${id}` ? player.index : 0;
  const effectiveTheme = theme ?? detail?.theme ?? "cobalto";
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

  if (!detail) {
    if (query.isError)
      return (
        <div className="page">
          <Topbar current="explore" />
          <main className="page-main" id="conteudo" tabIndex={-1}>
            <ErrorState
              title={query.error && "failure" in query.error && query.error.failure === "not_found" ? "Coleção não encontrada" : "Não deu para abrir a coleção"}
              message={failureMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
            <p>
              <a href={href.explore()}>Voltar para Explorar</a>
            </p>
          </main>
        </div>
      );
    if (query.fetchStatus === "paused")
      return (
        <div className="page">
          <Topbar current="explore" />
          <main className="page-main" id="conteudo" tabIndex={-1}>
            <ErrorState title="Sem conexão" message="Esta coleção ainda não foi salva neste navegador. Conecte-se para abrir." />
          </main>
        </div>
      );
    return <LoadingStudio label="Carregando a coleção…" />;
  }

  const meta = { name: detail.title, description: detail.description, by: "", theme: theme ?? detail.theme, layout };
  const withoutPreview = tracks.filter((t) => !t.preview).length;
  const updated = formatDate(detail.updatedAt);

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
        queueKey={`c-${id}`}
        meta={meta}
        tracks={tracks}
        header={
          <>
            <nav className="crumbs" aria-label="Caminho">
              <a href={href.explore()}>Explorar</a>
              <span aria-hidden="true">/</span>
              <span>{detail.title}</span>
            </nav>
            <div className="panel-meta">
              <p>
                {detail.source.label}
                {updated ? ` · atualizado em ${updated}` : ""}
              </p>
              <p>{plural(detail.total, "faixa", "faixas")} na origem</p>
            </div>
            <OfflineBanner note="Mostrando a coleção salva. As prévias precisam de internet." />
            {withoutPreview > 0 && (
              <p className="banner" role="note">
                {plural(withoutPreview, "faixa", "faixas")} sem prévia de 30 s na fonte. Elas aparecem marcadas e o player pula essas faixas.
              </p>
            )}
          </>
        }
        tabs={[
          { id: "faixas", label: <>Faixas <b>{tracks.length}</b></>, content: <ReadonlyTrackList tracks={tracks} queueKey={`c-${id}`} /> },
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
      <ShareDialog
        open={sharing}
        onClose={() => setSharing(false)}
        layout={layout}
        content={shareContent}
      />
    </>
  );
}
