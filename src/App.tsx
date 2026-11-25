import { useCallback, useEffect, useState } from "react";
import { ErrorState, SkipLink, Topbar } from "./components/Chrome";
import { Splash } from "./components/Splash";
import { THEMES } from "./lib/design";
import { href, useRoute, type Route } from "./lib/router";
import { CollectionPage } from "./pages/CollectionPage";
import { ExplorePage } from "./pages/ExplorePage";
import { LibraryPage } from "./pages/LibraryPage";
import { PlaylistPage } from "./pages/PlaylistPage";
import { SharedPage } from "./pages/SharedPage";

const TITLES: Record<Route["name"], string> = {
  explore: "Coverlist: a capa viva da sua playlist",
  collection: "Coleção · Coverlist",
  library: "Minhas playlists · Coverlist",
  playlist: "Editor · Coverlist",
  shared: "Playlist compartilhada · Coverlist",
  notFound: "Página não encontrada · Coverlist",
};

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case "explore":
      return <ExplorePage />;
    case "collection":
      return <CollectionPage key={route.id} id={route.id} />;
    case "library":
      return <LibraryPage />;
    case "playlist":
      return <PlaylistPage key={route.id} id={route.id} />;
    case "shared":
      return <SharedPage key={route.payload} payload={route.payload} />;
    default:
      return (
        <div className="page">
          <SkipLink />
          <Topbar current="explore" />
          <main className="page-main" id="conteudo" tabIndex={-1}>
            <ErrorState title="Página não encontrada" message="Esse endereço não existe no Coverlist." />
            <p>
              <a href={href.explore()}>Ir para Explorar</a>
            </p>
          </main>
        </div>
      );
  }
}

/** `showSplash` é decidido uma vez no boot (main.tsx), fora do render. */
export function App({ showSplash = false }: { showSplash?: boolean }) {
  const route = useRoute();
  const [splash, setSplash] = useState(showSplash);
  const done = useCallback(() => setSplash(false), []);

  useEffect(() => {
    document.title = TITLES[route.name];
    window.scrollTo?.(0, 0);
  }, [route.name]);

  return (
    <>
      <Page route={route} />
      {splash && <Splash color={THEMES.cobalto.label} onDone={done} />}
    </>
  );
}
