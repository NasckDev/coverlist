import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { Track } from "../../server/types";
import { loadLibrary, saveLibrary } from "./db";
import { MAX_PLAYLISTS, MAX_TRACKS, NAME_MAX, newPlaylistId, SCHEMA_VERSION, validatePlaylist, type Playlist } from "./schema";

type Editable = Partial<Pick<Playlist, "name" | "description" | "by" | "theme" | "layout">>;

interface State {
  ready: boolean;
  persistent: boolean;
  readOnly: boolean;
  dropped: number;
  playlists: Playlist[];
}

type Action =
  | { type: "loaded"; playlists: Playlist[]; persistent: boolean; readOnly: boolean; dropped: number }
  | { type: "apply"; fn: (list: Playlist[]) => Playlist[] };

function reducer(state: State, action: Action): State {
  if (action.type === "loaded") return { ...state, ready: true, ...action };
  return { ...state, playlists: action.fn(state.playlists) };
}

const stamp = () => new Date().toISOString();

export type AddResult = "added" | "duplicate" | "full" | "missing";

export interface PlaylistsApi {
  ready: boolean;
  persistent: boolean;
  readOnly: boolean;
  dropped: number;
  playlists: Playlist[];
  get(id: string): Playlist | undefined;
  create(seed?: Partial<Omit<Playlist, "id" | "createdAt" | "updatedAt">>): Playlist | null;
  update(id: string, patch: Editable): void;
  addTrack(id: string, track: Track): AddResult;
  addTracks(id: string, tracks: Track[]): { added: number; skipped: number };
  removeTrack(id: string, trackId: string): void;
  /** Recoloca uma faixa numa posição (usado pelo desfazer). */
  insertTrack(id: string, track: Track, index: number): void;
  moveTrack(id: string, from: number, to: number): void;
  duplicate(id: string): Playlist | null;
  /** Remove e devolve a função de desfazer. */
  remove(id: string): () => void;
  importMany(list: unknown[]): { added: number; skipped: number };
}

const PlaylistsContext = createContext<PlaylistsApi | null>(null);

/** Uma faixa vale para a playlist quando ainda não está nela e há espaço. */
export function canAdd(playlist: Playlist, trackId: string): AddResult {
  if (playlist.tracks.some((t) => t.id === trackId)) return "duplicate";
  if (playlist.tracks.length >= MAX_TRACKS) return "full";
  return "added";
}

export function PlaylistsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { ready: false, persistent: true, readOnly: false, dropped: 0, playlists: [] });
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    let alive = true;
    loadLibrary().then((result) => {
      if (!alive) return;
      dispatch({
        type: "loaded",
        playlists: result.library.playlists,
        persistent: result.persistent,
        readOnly: result.fromFuture,
        dropped: result.dropped,
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Grava com debounce; a versão de esquema vai junto para a próxima migração saber de onde partir.
  const firstSave = useRef(true);
  useEffect(() => {
    if (!state.ready || state.readOnly || !state.persistent) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const timer = setTimeout(() => void saveLibrary({ schemaVersion: SCHEMA_VERSION, playlists: state.playlists }), 200);
    return () => clearTimeout(timer);
  }, [state.playlists, state.ready, state.readOnly, state.persistent]);

  const commit = useCallback((next: (list: Playlist[]) => Playlist[]) => {
    dispatch({ type: "apply", fn: next });
  }, []);

  const patchOne = useCallback(
    (id: string, fn: (p: Playlist) => Playlist) => commit((list) => list.map((p) => (p.id === id ? { ...fn(p), updatedAt: stamp() } : p))),
    [commit],
  );

  const api = useMemo<PlaylistsApi>(() => {
    const get = (id: string) => ref.current.playlists.find((p) => p.id === id);
    const create: PlaylistsApi["create"] = (seed = {}) => {
      if (ref.current.playlists.length >= MAX_PLAYLISTS) return null;
      const now = stamp();
      const playlist: Playlist = {
        name: "Nova playlist",
        description: "",
        by: "",
        theme: "cobalto",
        layout: "editorial",
        origin: null,
        ...seed,
        tracks: (seed.tracks ?? []).slice(0, MAX_TRACKS),
        id: newPlaylistId(),
        createdAt: now,
        updatedAt: now,
      };
      commit((list) => [playlist, ...list]);
      return playlist;
    };
    return {
      ...state,
      get,
      create,
      update: (id, patch) => patchOne(id, (p) => ({ ...p, ...patch })),
      addTrack: (id, track) => {
        const playlist = get(id);
        if (!playlist) return "missing";
        const verdict = canAdd(playlist, track.id);
        if (verdict === "added") patchOne(id, (p) => ({ ...p, tracks: [...p.tracks, track] }));
        return verdict;
      },
      addTracks: (id, tracks) => {
        const playlist = get(id);
        if (!playlist) return { added: 0, skipped: tracks.length };
        const have = new Set(playlist.tracks.map((t) => t.id));
        const fresh = tracks.filter((t) => !have.has(t.id) && (have.add(t.id), true));
        const room = Math.max(0, MAX_TRACKS - playlist.tracks.length);
        const added = fresh.slice(0, room);
        if (added.length) patchOne(id, (p) => ({ ...p, tracks: [...p.tracks, ...added] }));
        return { added: added.length, skipped: tracks.length - added.length };
      },
      removeTrack: (id, trackId) => patchOne(id, (p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== trackId) })),
      insertTrack: (id, track, index) =>
        patchOne(id, (p) => {
          if (p.tracks.some((t) => t.id === track.id) || p.tracks.length >= MAX_TRACKS) return p;
          const tracks = [...p.tracks];
          tracks.splice(Math.max(0, Math.min(index, tracks.length)), 0, track);
          return { ...p, tracks };
        }),
      moveTrack: (id, from, to) =>
        patchOne(id, (p) => {
          if (from === to || from < 0 || to < 0 || from >= p.tracks.length || to >= p.tracks.length) return p;
          const tracks = [...p.tracks];
          const [moved] = tracks.splice(from, 1);
          tracks.splice(to, 0, moved);
          return { ...p, tracks };
        }),
      duplicate: (id) => {
        const source = get(id);
        if (!source) return null;
        const { name, description, by, theme, layout, tracks } = source;
        return create({ name: `${name} (cópia)`.slice(0, NAME_MAX), description, by, theme, layout, tracks, origin: name || null });
      },
      remove: (id) => {
        const list = ref.current.playlists;
        const index = list.findIndex((p) => p.id === id);
        if (index < 0) return () => undefined;
        const removed = list[index];
        commit((current) => current.filter((p) => p.id !== id));
        return () =>
          commit((current) => {
            if (current.some((p) => p.id === removed.id)) return current;
            const next = [...current];
            next.splice(Math.min(index, next.length), 0, removed);
            return next;
          });
      },
      importMany: (items) => {
        let added = 0;
        const fresh: Playlist[] = [];
        for (const item of items) {
          if (ref.current.playlists.length + fresh.length >= MAX_PLAYLISTS) break;
          const playlist = validatePlaylist(item);
          if (!playlist) continue;
          fresh.push({ ...playlist, id: newPlaylistId() });
          added++;
        }
        if (fresh.length) commit((list) => [...fresh, ...list]);
        return { added, skipped: items.length - added };
      },
    };
  }, [state, commit, patchOne]);

  return <PlaylistsContext.Provider value={api}>{children}</PlaylistsContext.Provider>;
}

export function usePlaylists(): PlaylistsApi {
  const api = useContext(PlaylistsContext);
  if (!api) throw new Error("usePlaylists fora do PlaylistsProvider");
  return api;
}
