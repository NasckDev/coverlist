import { useEffect, useMemo, useState } from "react";
import { ErrorState, Topbar, useToast } from "../components/Chrome";
import { ShareDialog } from "../components/ShareDialog";
import { Studio } from "../components/Studio";
import { ReadonlyTrackList } from "../components/TrackList";
import { VisualTab } from "../components/VisualTab";
import { href, navigate } from "../lib/router";
import { usePlayer } from "../player/PlayerProvider";
import { decodeShare, type SharedPlaylist } from "../share/codec";
import { usePlaylists } from "../store/playlists";
import { MAX_PLAYLISTS } from "../store/schema";
import { LoadingStudio } from "./CollectionPage";

/** Playlist aberta por link: só leitura, com opção de salvar uma cópia neste navegador. */
export function SharedPage({ payload }: { payload: string }) {
  const [state, setState] = useState<{ payload: string; data: SharedPlaylist | null; error: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);
  const store = usePlaylists();
  const toast = useToast();
  const player = usePlayer();

  useEffect(() => {
    let alive = true;
    decodeShare(payload).then(
      (data) => alive && setState({ payload, data, error: false }),
      () => alive && setState({ payload, data: null, error: true }),
    );
    return () => {
      alive = false;
    };
  }, [payload]);

  const data = state?.payload === payload ? state.data : null;
  const [visual, setVisual] = useState<Pick<SharedPlaylist, "theme" | "layout"> | null>(null);
  const meta = useMemo(() => (data ? { ...data, ...(visual ?? {}) } : null), [data, visual]);
  const queueKey = `s-${payload.slice(0, 24)}`;
  const index = player.queueKey === queueKey ? player.index : 0;
  const shareContent = useMemo(() => (meta ? { ...meta, current: index } : null), [meta, index]);

  if (!state || state.payload !== payload) return <LoadingStudio label="Abrindo a playlist compartilhada…" />;
  if (!meta || !shareContent || state.error)
    return (
      <div className="page">
        <Topbar current="explore" />
        <main className="page-main" id="conteudo" tabIndex={-1}>
          <ErrorState title="Link inválido" message="Este link de playlist está incompleto ou foi alterado. Peça um link novo para quem compartilhou." />
          <p>
            <a href={href.explore()}>Ir para Explorar</a>
          </p>
        </main>
      </div>
    );

  const save = () => {
    const p = store.create({ ...meta, origin: "Link compartilhado" });
    if (!p) return toast(`Limite de ${MAX_PLAYLISTS} playlists atingido.`);
    toast("Playlist salva neste navegador.");
    navigate(href.playlist(p.id));
  };

  return (
    <>
      <Studio
        panelLabel="Playlist compartilhada"
        queueKey={queueKey}
        meta={meta}
        tracks={meta.tracks}
        header={
          <>
            <nav className="crumbs" aria-label="Caminho">
              <a href={href.explore()}>Explorar</a>
              <span aria-hidden="true">/</span>
              <span>Compartilhada</span>
            </nav>
            <div className="panel-meta">
              <h1>{meta.name.trim() || "Sem nome"}</h1>
              <p>{meta.by ? `Montada por ${meta.by}. ` : ""}Recebida por link: nada foi enviado a nenhum servidor.</p>
            </div>
          </>
        }
        tabs={[
          { id: "faixas", label: <>Faixas <b>{meta.tracks.length}</b></>, content: <ReadonlyTrackList tracks={meta.tracks} queueKey={queueKey} /> },
          {
            id: "visual",
            label: "Visual",
            content: (
              <VisualTab
                theme={meta.theme}
                layout={meta.layout}
                onTheme={(theme) => setVisual({ theme, layout: meta.layout })}
                onLayout={(layout) => setVisual({ theme: meta.theme, layout })}
              />
            ),
          },
        ]}
        foot={
          <div className="row-btns">
            <button type="button" className="solid" onClick={save} disabled={!store.ready || store.readOnly}>
              Salvar nas minhas
            </button>
            <button type="button" className="ghost share-btn" onClick={() => setSharing(true)}>
              Compartilhar
            </button>
          </div>
        }
      />
      <ShareDialog open={sharing} onClose={() => setSharing(false)} layout={meta.layout} content={shareContent} />
    </>
  );
}
