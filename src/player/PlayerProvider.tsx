import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Track } from "../../server/types";
import { resolveDeezerPreview, resolveItunesPreview } from "../lib/api";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "unavailable" | "error";

export interface PlayerState {
  queueKey: string | null;
  tracks: Track[];
  index: number;
  status: PlayerStatus;
  volume: number;
  muted: boolean;
  message: string | null;
}

export interface PlayerApi extends PlayerState {
  audio: HTMLAudioElement | null;
  current: Track | null;
  isPlaying: boolean;
  setQueue(key: string, tracks: Track[]): void;
  play(index: number): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  seekBy(delta: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  stop(): void;
}

const VOLUME_KEY = "coverlist:volume";
export const NO_PREVIEW_MESSAGE = "Esta faixa não tem prévia de 30 s nas fontes públicas.";
const PLAY_ERROR_MESSAGE = "Não foi possível tocar esta prévia agora.";

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
  } catch {
    return 0.8;
  }
}

const PlayerContext = createContext<PlayerApi | null>(null);

export const hasPreview = (t: Track | undefined | null) => !!t && t.preview !== null;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>(() => ({
    queueKey: null,
    tracks: [],
    index: 0,
    status: "idle",
    volume: readVolume(),
    muted: false,
    message: null,
  }));
  const ref = useRef(state);
  ref.current = state;
  const token = useRef(0);

  useEffect(() => {
    const el = new Audio();
    el.preload = "none";
    audioRef.current = el;
    setAudio(el);
    return () => {
      el.pause();
      el.removeAttribute("src");
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audio) return;
    audio.volume = state.volume;
    audio.muted = state.muted;
  }, [audio, state.volume, state.muted]);

  const patch = useCallback((p: Partial<PlayerState>) => setState((s) => ({ ...s, ...p })), []);

  const start = useCallback(
    async (index: number, autoplay: boolean) => {
      const el = audioRef.current;
      const { tracks } = ref.current;
      if (!el || !tracks.length) return;
      const i = ((index % tracks.length) + tracks.length) % tracks.length;
      const track = tracks[i];
      const my = ++token.current;
      el.pause();
      el.removeAttribute("src");
      el.load();
      if (!track.preview) {
        patch({ index: i, status: "unavailable", message: NO_PREVIEW_MESSAGE });
        return;
      }
      patch({ index: i, status: autoplay ? "loading" : "paused", message: null });
      let url: string | null = null;
      if (track.preview.kind === "url") url = track.preview.url;
      else if (autoplay) {
        try {
          url =
            track.preview.kind === "deezer"
              ? (await resolveDeezerPreview(client, track.preview.trackId)).url
              : (await resolveItunesPreview(client, track.preview.trackId, track.preview.country)).url;
        } catch {
          if (my === token.current) patch({ status: "error", message: PLAY_ERROR_MESSAGE });
          return;
        }
      }
      if (my !== token.current) return;
      if (!autoplay) return;
      if (!url) {
        patch({ status: "unavailable", message: NO_PREVIEW_MESSAGE });
        return;
      }
      el.src = url;
      try {
        await el.play();
        if (my === token.current) patch({ status: "playing", message: null });
      } catch (error) {
        if (my !== token.current) return;
        const blocked = error instanceof DOMException && error.name === "NotAllowedError";
        patch({ status: blocked ? "paused" : "error", message: blocked ? null : PLAY_ERROR_MESSAGE });
      }
    },
    [client, patch],
  );

  /** Próxima faixa com prévia, dando no máximo uma volta na fila. */
  const nextPlayable = useCallback((from: number, step: 1 | -1) => {
    const { tracks } = ref.current;
    for (let k = 1; k <= tracks.length; k++) {
      const j = (((from + step * k) % tracks.length) + tracks.length) % tracks.length;
      if (hasPreview(tracks[j])) return j;
    }
    return -1;
  }, []);

  useEffect(() => {
    if (!audio) return;
    const onEnded = () => {
      const j = nextPlayable(ref.current.index, 1);
      if (j >= 0 && j > ref.current.index) void start(j, true);
      else patch({ status: "paused" });
    };
    const onError = () => {
      if (audio.getAttribute("src")) patch({ status: "error", message: PLAY_ERROR_MESSAGE });
    };
    const onPause = () => setState((s) => (s.status === "playing" ? { ...s, status: "paused" } : s));
    const onPlay = () => setState((s) => (s.status === "paused" ? { ...s, status: "playing" } : s));
    // Buffer da rede: enquanto o áudio espera dados, a capa diz "carregando prévia" em vez de fingir que toca.
    const onWaiting = () => setState((s) => (s.status === "playing" ? { ...s, status: "loading" } : s));
    const onPlaying = () => setState((s) => (s.status === "loading" ? { ...s, status: "playing" } : s));
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    const onTime = () => {
      if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      try {
        navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 });
      } catch {
        /* posição inválida durante a troca de faixa */
      }
    };
    audio.addEventListener("loadedmetadata", onTime);
    audio.addEventListener("seeked", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("loadedmetadata", onTime);
      audio.removeEventListener("seeked", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
    };
  }, [audio, nextPlayable, patch, start]);

  /** Ações estáveis (só leem refs): efeitos que dependem delas não rodam a cada mudança de estado. */
  const actions = useMemo(() => {
    const toggle = () => {
      const el = audioRef.current;
      const s = ref.current;
      if (!el || !s.tracks.length) return;
      if (s.status === "playing" || s.status === "loading") {
        token.current++;
        el.pause();
        patch({ status: "paused" });
        return;
      }
      if (el.getAttribute("src") && s.status === "paused") {
        el.play().then(
          () => patch({ status: "playing", message: null }),
          () => patch({ status: "error", message: PLAY_ERROR_MESSAGE }),
        );
        return;
      }
      void start(s.index, true);
    };
    return {
      setQueue: (key: string, tracks: Track[]) => {
        const s = ref.current;
        if (s.queueKey === key && s.tracks === tracks) return;
        if (s.queueKey === key) {
          const currentId = s.tracks[s.index]?.id;
          const at = tracks.findIndex((t) => t.id === currentId);
          if (at >= 0) {
            patch({ tracks, index: at });
            return;
          }
        }
        token.current++;
        audioRef.current?.pause();
        audioRef.current?.removeAttribute("src");
        patch({ queueKey: key, tracks, index: 0, status: "idle", message: null });
      },
      play: (index: number) => void start(index, true),
      toggle,
      next: () => void start(ref.current.index + 1, true),
      prev: () => {
        const el = audioRef.current;
        if (el && el.currentTime > 3) {
          el.currentTime = 0;
          return;
        }
        void start(ref.current.index - 1, true);
      },
      seek: (seconds: number) => {
        const el = audioRef.current;
        if (el && Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(el.duration, seconds));
      },
      seekBy: (delta: number) => {
        const el = audioRef.current;
        if (el && Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta));
      },
      setVolume: (volume: number) => {
        const v = Math.max(0, Math.min(1, volume));
        try {
          localStorage.setItem(VOLUME_KEY, String(v));
        } catch {
          /* preferência só desta sessão */
        }
        patch({ volume: v, muted: v === 0 });
      },
      toggleMute: () => patch({ muted: !ref.current.muted }),
      stop: () => {
        token.current++;
        audioRef.current?.pause();
        if (ref.current.status !== "idle" && ref.current.status !== "paused") patch({ status: "paused" });
      },
    };
  }, [patch, start]);

  const api = useMemo<PlayerApi>(
    () => ({
      ...state,
      ...actions,
      audio,
      current: state.tracks[state.index] ?? null,
      isPlaying: state.status === "playing" || state.status === "loading",
    }),
    [state, actions, audio],
  );

  // Media Session: controles na tela de bloqueio e nas teclas de mídia.
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => apiRef.current.toggle()],
      ["pause", () => apiRef.current.toggle()],
      ["previoustrack", () => apiRef.current.prev()],
      ["nexttrack", () => apiRef.current.next()],
      ["seekbackward", () => apiRef.current.seekBy(-10)],
      ["seekforward", () => apiRef.current.seekBy(10)],
      ["seekto", (d) => d.seekTime != null && apiRef.current.seek(d.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* ação não suportada neste navegador */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* idem */
        }
      }
    };
  }, []);

  const current = api.current;
  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = current
      ? new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: current.album ?? "Coverlist",
          artwork: current.artwork
            ? [
                { src: current.artwork.medium, sizes: "300x300", type: "image/jpeg" },
                { src: current.artwork.large, sizes: "600x600", type: "image/jpeg" },
              ]
            : [],
        })
      : null;
  }, [current]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = api.isPlaying ? "playing" : api.status === "idle" ? "none" : "paused";
  }, [api.isPlaying, api.status]);

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const api = useContext(PlayerContext);
  if (!api) throw new Error("usePlayer fora do PlayerProvider");
  return api;
}
