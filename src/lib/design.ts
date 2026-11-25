import type { ThemeKey, Track } from "../../server/types";

export interface Theme {
  name: string;
  paper: string;
  ink: string;
  label: string;
  on: string;
}

/** As cinco cores de selo do protótipo. */
export const THEMES: Record<ThemeKey, Theme> = {
  cobalto: { name: "Cobalto", paper: "#EFEFEA", ink: "#15161A", label: "#2B3BF0", on: "#FFFFFF" },
  brasa: { name: "Brasa", paper: "#F2E6E4", ink: "#2A1115", label: "#CF2418", on: "#FFFFFF" },
  noite: { name: "Noite", paper: "#1A1C24", ink: "#E9E6DC", label: "#F5B800", on: "#1A1C24" },
  menta: { name: "Menta", paper: "#DCEDE3", ink: "#0F2B22", label: "#FF5A92", on: "#2B0514" },
  lilas: { name: "Lilás", paper: "#E7E2F5", ink: "#1C1440", label: "#FF6A1A", on: "#1C1440" },
};

export const LAYOUT_KEYS = ["editorial", "deck", "poster"] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

export const LAYOUTS: Record<LayoutKey, { name: string; hint: string }> = {
  editorial: { name: "Editorial", hint: "Vinil na lateral e título gigante" },
  deck: { name: "Toca-discos", hint: "Fundo dividido, braço e agulha" },
  poster: { name: "Pôster", hint: "Vertical, com o nome correndo ao fundo" },
};

export function themeVars(theme: ThemeKey): Record<string, string> {
  const t = THEMES[theme];
  return { "--paper": t.paper, "--ink": t.ink, "--label": t.label, "--on-label": t.on };
}

/** m:ss, como no protótipo. */
export function fmt(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Capa gerada do protótipo (gradiente determinístico por título e artista) para quando não há capa real. */
export function generatedArt(title: string, artist: string): string {
  const h = hash(`${title}|${artist}`);
  const a = h % 360;
  const b = (a + 40 + ((h >>> 8) % 110)) % 360;
  const ang = (h >>> 4) % 180;
  const x = 20 + ((h >>> 12) % 60);
  const y = 20 + ((h >>> 16) % 60);
  return `radial-gradient(circle at ${x}% ${y}%, oklch(.9 .13 ${b}) 0 10%, transparent 48%), linear-gradient(${ang}deg, oklch(.64 .2 ${a}), oklch(.38 .15 ${b}))`;
}

export function artBackground(track: Pick<Track, "title" | "artist" | "artwork"> | null | undefined, size: "small" | "medium" | "large" = "small"): string {
  if (!track) return "#555";
  const url = track.artwork?.[size];
  return url ? `url("${url.replace(/["\\]/g, "")}") center/cover, #555` : generatedArt(track.title, track.artist);
}

export function totalMinutes(tracks: readonly Track[]): number {
  return Math.round(tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0) / 60);
}

export function summaryLine(tracks: readonly Track[]): string {
  const n = tracks.length;
  if (!n) return "";
  const min = totalMinutes(tracks);
  return `${n} ${n === 1 ? "faixa" : "faixas"}${min ? `, ${min} min` : ""}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d);
}
