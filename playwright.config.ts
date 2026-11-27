import { defineConfig, devices } from "@playwright/test";

/** E2E_PORT troca a porta quando a 5191 já está ocupada (o servidor existente seria reaproveitado). */
const PORT = Number(process.env.E2E_PORT ?? 5191);

/**
 * E2E determinístico: o build de produção roda no `vite preview` e toda chamada ao proxy é
 * interceptada pelo próprio handler alimentado com as respostas reais gravadas (tests/fixtures).
 * Áudio e capas também são servidos localmente. Nada sai para a rede.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "1440-claro", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "1440-escuro", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, colorScheme: "dark" } },
    { name: "390-claro", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: "light" } },
    { name: "390-escuro", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: "dark" } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
