import type { ThemeKey, Track } from "../../server/types";
import { fmt, hash, THEMES, totalMinutes } from "../lib/design";

/** Desenho da imagem de compartilhar, portado do protótipo. Usa capas reais quando o CDN libera CORS. */
export type ShareFormat = "story" | "square";

export interface ShareContent {
  name: string;
  description: string;
  by: string;
  theme: ThemeKey;
  tracks: Track[];
  current: number;
}

export type Images = Map<string, HTMLImageElement>;

const TAU = Math.PI * 2;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function stop(g: CanvasGradient, o: number, color: string, fallback: string) {
  try {
    g.addColorStop(o, color);
  } catch {
    g.addColorStop(o, fallback);
  }
}

/** Preenche o caminho atual com a capa real (se carregou) ou com a capa gerada do protótipo. */
function paintArt(ctx: CanvasRenderingContext2D, t: Track, x: number, y: number, s: number, images: Images) {
  const img = images.get(t.id);
  if (img) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, x, y, s, s);
    ctx.restore();
    return;
  }
  const h = hash(`${t.title}|${t.artist}`);
  const a = h % 360;
  const b = (a + 40 + ((h >>> 8) % 110)) % 360;
  const r = (((h >>> 4) % 180) * Math.PI) / 180;
  const cx = x + s / 2;
  const cy = y + s / 2;
  const dx = (Math.sin(r) * s) / 2;
  const dy = (-Math.cos(r) * s) / 2;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  stop(g, 0, `oklch(0.64 0.2 ${a})`, `hsl(${a},75%,52%)`);
  stop(g, 1, `oklch(0.38 0.15 ${b})`, `hsl(${b},65%,28%)`);
  ctx.fillStyle = g;
  ctx.fill();
  const hx = x + (s * (20 + ((h >>> 12) % 60))) / 100;
  const hy = y + (s * (20 + ((h >>> 16) % 60))) / 100;
  const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, s * 0.7);
  stop(rg, 0, `oklch(0.9 0.13 ${b})`, `hsl(${b},90%,82%)`);
  stop(rg, 0.2, `oklch(0.9 0.13 ${b})`, `hsl(${b},90%,82%)`);
  stop(rg, 1, `oklch(0.9 0.13 ${b} / 0)`, `hsla(${b},90%,82%,0)`);
  ctx.fillStyle = rg;
  ctx.fill();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > max) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: Track | undefined, label: string, images: Images) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = R * 0.12;
  ctx.shadowOffsetY = R * 0.03;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fillStyle = "#0b0b0c";
  ctx.fill();
  ctx.restore();
  [0.41, 0.53, 0.65, 0.73, 0.84, 0.955].forEach((f) => {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,.1)";
    ctx.lineWidth = Math.max(1.5, R * 0.004);
    ctx.stroke();
  });
  if (ctx.createConicGradient) {
    const g = ctx.createConicGradient(-1.1, cx, cy);
    (
      [
        [0, 0],
        [0.07, 0.2],
        [0.15, 0],
        [0.5, 0],
        [0.58, 0.12],
        [0.66, 0],
        [1, 0],
      ] as const
    ).forEach(([o, a]) => g.addColorStop(o, `rgba(255,255,255,${a})`));
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.arc(cx, cy, R * 0.4, 0, TAU, true);
    ctx.fillStyle = g;
    ctx.fill("evenodd");
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.4, 0, TAU);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.36, 0, TAU);
  if (t) paintArt(ctx, t, cx - R * 0.36, cy - R * 0.36, R * 0.72, images);
  else {
    ctx.fillStyle = "#555";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.36, 0, TAU);
  ctx.arc(cx, cy, R * 0.2, 0, TAU, true);
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.fill("evenodd");
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.04, 0, TAU);
  ctx.fillStyle = label;
  ctx.fill();
}

export function drawShare(canvas: HTMLCanvasElement, content: ShareContent, format: ShareFormat, images: Images) {
  const sq = format === "square";
  const W = 1080;
  const H = sq ? 1080 : 1920;
  const th = THEMES[content.theme];
  const on = th.on;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const D = '"Bricolage Grotesque","Arial Narrow",Arial,sans-serif';
  const U = '"Hanken Grotesk","Helvetica Neue",Arial,sans-serif';
  const spacing = (v: number) => {
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${v.toFixed(1)}px`;
  };
  ctx.fillStyle = th.label;
  ctx.fillRect(0, 0, W, H);
  const pad = sq ? 72 : 84;
  const R = sq ? 340 : 500;
  const cx = sq ? W - 110 : W / 2;
  const cy = sq ? H - 60 : H + 60;
  const tracks = content.tracks;
  drawDisc(ctx, cx, cy, R, tracks[content.current], th.label, images);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  let y = pad + (sq ? 30 : 70);
  ctx.fillStyle = rgba(on, 0.78);
  ctx.font = `500 ${sq ? 30 : 34}px ${U}`;
  if (content.by.trim()) ctx.fillText(fitText(ctx, `Playlist de ${content.by.trim()}`, W - pad * 2 - 220), pad, y);
  ctx.textAlign = "right";
  ctx.font = `700 ${sq ? 30 : 34}px ${D}`;
  ctx.fillText("Coverlist", W - pad, y);
  ctx.textAlign = "left";

  const name = content.name.trim() || "Sem nome";
  const maxW = W - pad * 2;
  const maxLines = sq ? 2 : 3;
  let size = sq ? 150 : 190;
  let lines: string[] = [];
  for (;;) {
    ctx.font = `600 ${size}px ${D}`;
    spacing(-size * 0.045);
    lines = wrapText(ctx, name, maxW);
    if ((lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) || size <= 56) break;
    size -= 8;
  }
  ctx.fillStyle = on;
  y += sq ? 30 : 46;
  lines.slice(0, maxLines).forEach((l) => {
    y += size * 0.92;
    ctx.fillText(l, pad, y);
  });
  spacing(0);

  const small = sq ? 30 : 36;
  ctx.font = `400 ${small}px ${U}`;
  y += small * 0.8;
  if (content.description.trim())
    wrapText(ctx, content.description.trim(), sq ? W * 0.62 : maxW)
      .slice(0, 2)
      .forEach((l) => {
        y += small * 1.3;
        ctx.fillText(l, pad, y);
      });
  const n = tracks.length;
  const min = totalMinutes(tracks);
  ctx.fillStyle = rgba(on, 0.65);
  y += small * 1.3;
  ctx.fillText(`${n} ${n === 1 ? "faixa" : "faixas"}${min ? `, ${min} min` : ""}`, pad, y);

  const rowH = sq ? 92 : 108;
  const cov = sq ? 64 : 76;
  const listW = sq ? W * 0.5 : maxW;
  const limitY = sq ? H - pad : cy - R - 50;
  y += sq ? 34 : 54;
  let fits = Math.floor((limitY - y) / rowH);
  if (fits < n) fits = Math.floor((limitY - y - 60) / rowH);
  const shown = Math.max(0, Math.min(n, fits));
  for (let i = 0; i < shown; i++) {
    const t = tracks[i];
    const top = y + i * rowH;
    const mid = top + rowH / 2;
    const tx = pad + 62 + cov + 24;
    if (i === content.current) {
      rr(ctx, pad - 18, top + 6, listW + 36, rowH - 12, 20);
      ctx.fillStyle = rgba(on, 0.14);
      ctx.fill();
    }
    ctx.fillStyle = rgba(on, 0.6);
    ctx.font = `500 ${sq ? 25 : 28}px ${U}`;
    ctx.fillText(String(i + 1).padStart(2, "0"), pad, mid + 10);
    rr(ctx, pad + 62, mid - cov / 2, cov, cov, 10);
    paintArt(ctx, t, pad + 62, mid - cov / 2, cov, images);
    ctx.textAlign = "right";
    ctx.fillStyle = rgba(on, 0.75);
    if (t.durationSec) ctx.fillText(fmt(t.durationSec), pad + listW, mid + 10);
    ctx.textAlign = "left";
    const tw = listW - (tx - pad) - 100;
    ctx.fillStyle = on;
    ctx.font = `600 ${sq ? 30 : 34}px ${U}`;
    ctx.fillText(fitText(ctx, t.title, tw), tx, mid - 4);
    ctx.fillStyle = rgba(on, 0.65);
    ctx.font = `400 ${sq ? 24 : 27}px ${U}`;
    ctx.fillText(fitText(ctx, t.artist, tw), tx, mid + (sq ? 28 : 32));
  }
  if (shown < n) {
    ctx.fillStyle = rgba(on, 0.7);
    ctx.font = `500 ${sq ? 26 : 30}px ${U}`;
    ctx.fillText(`+ ${n - shown} ${n - shown === 1 ? "faixa" : "faixas"}`, pad, y + shown * rowH + 42);
  }
}

/**
 * Carrega as capas reais com CORS (os CDNs do Deezer e da Apple respondem Access-Control-Allow-Origin: *).
 * Capa que não carrega em 4 s fica de fora e a capa gerada entra no lugar.
 */
export async function loadImages(tracks: Track[], timeoutMs = 4000): Promise<Images> {
  const images: Images = new Map();
  await Promise.all(
    tracks.map(
      (t) =>
        new Promise<void>((resolve) => {
          const url = t.artwork?.medium;
          if (!url) return resolve();
          const img = new Image();
          img.crossOrigin = "anonymous";
          const timer = setTimeout(() => resolve(), timeoutMs);
          img.onload = () => {
            clearTimeout(timer);
            images.set(t.id, img);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
          img.src = url;
        }),
    ),
  );
  return images;
}
