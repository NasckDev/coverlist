import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { COLLECTIONS_VERSION } from "../server/collections";
import { App } from "./App";
import { applyStoredTheme, ToastProvider } from "./components/Chrome";
import { shouldShowSplash } from "./components/Splash";
import { setSplashActive } from "./components/splashState";
import { createQueryClient, shouldPersist } from "./lib/api";
import { PlayerProvider } from "./player/PlayerProvider";
import { queryCacheStorage } from "./store/db";
import { PlaylistsProvider } from "./store/playlists";
import "./styles/fonts.css";
import "./styles/prototype.css";
import "./styles/app.css";

applyStoredTheme();
const showSplash = shouldShowSplash();
if (showSplash) setSplashActive(true);

const queryClient = createQueryClient();
/** Coleções vão para o IndexedDB e voltam offline; mudar a configuração das coleções invalida o cache. */
const persister = createAsyncStoragePersister({ storage: queryCacheStorage, key: "coverlist-query-cache", throttleTime: 2000 });

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        buster: COLLECTIONS_VERSION,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && shouldPersist(q.queryKey) },
      }}
    >
      <PlaylistsProvider>
        <PlayerProvider>
          <ToastProvider>
            <App showSplash={showSplash} />
          </ToastProvider>
        </PlayerProvider>
      </PlaylistsProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
