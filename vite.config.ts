/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const API_PATH = "/api/coverlist";

type Handler = (request: { method?: string; url?: string }, response: unknown) => Promise<void>;

/** Adapta a resposta do Node ao formato da Vercel (status().json()) que o handler usa. */
function vercelResponse(res: ServerResponse) {
  const api = {
    setHeader: (name: string, value: string) => res.setHeader(name, value),
    status(code: number) {
      res.statusCode = code;
      return api;
    },
    json(body: unknown) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
    },
  };
  return api;
}

/**
 * No dev e no preview, /api/coverlist chama o mesmo handler da Vercel Function,
 * sem depender da Vercel CLI. No dev o módulo é recarregado a cada mudança em server/.
 */
function coverlistApi(): Plugin {
  const attach = (use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void, load: () => Promise<Handler>) =>
    use((req, res, next) => {
      if (!req.url || !req.url.startsWith(API_PATH)) return next();
      const url = req.url.slice(API_PATH.length) || "/";
      if (!url.startsWith("?") && url !== "/") return next();
      load()
        .then((handler) => handler({ method: req.method, url: `${API_PATH}${url}` }, vercelResponse(res)))
        .catch((error: unknown) => {
          console.error(error);
          res.statusCode = 500;
          res.end();
        });
    });
  return {
    name: "coverlist-api",
    configureServer(server: ViteDevServer) {
      attach(
        (fn) => server.middlewares.use(fn),
        async () => ((await server.ssrLoadModule("/server/handler.ts")) as { handleCoverlist: Handler }).handleCoverlist,
      );
    },
    configurePreviewServer(server) {
      let loaded: Promise<Handler> | null = null;
      const load = async () => {
        const { createServer } = await import("vite");
        const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
        return ((await vite.ssrLoadModule("/server/handler.ts")) as { handleCoverlist: Handler }).handleCoverlist;
      };
      attach(
        (fn) => server.middlewares.use(fn),
        () => (loaded ??= load()),
      );
    },
  };
}

export default defineConfig({
  base: process.env.COVERLIST_BASE ?? "/",
  plugins: [react(), coverlistApi()],
  server: { port: 5191, strictPort: true },
  preview: { port: 5192, strictPort: true },
  build: { target: "es2022", sourcemap: false },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: false,
    pool: "threads",
    maxWorkers: 2,
    isolate: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
