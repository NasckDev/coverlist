/**
 * Publica o Coverlist no portfólio:
 * 1. build com base /projetos/coverlist/;
 * 2. substitui public/projetos/coverlist/ pelo dist;
 * 3. copia server/ (sem testes) para api/_coverlist/;
 * 4. cria/atualiza api/coverlist.ts, a Vercel Function que só importa o handler.
 *
 * O caminho do portfólio pode ser trocado com PORTFOLIO_DIR.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORTFOLIO = resolve(process.env.PORTFOLIO_DIR ?? "C:/ale/Myportfolio");
const BASE = "/projetos/coverlist/";
const APP_DIR = join(PORTFOLIO, "public", "projetos", "coverlist");
const API_DIR = join(PORTFOLIO, "api", "_coverlist");
const FUNCTION_FILE = join(PORTFOLIO, "api", "coverlist.ts");

const FUNCTION_SOURCE = `import { handleCoverlist, type CoverlistRequest, type CoverlistResponse } from "./_coverlist/handler.js";

/**
 * Proxy de música do Coverlist (/api/coverlist?op=...): lista fechada de operações, validação de
 * parâmetros, timeout, cache na borda e normalização de Deezer, iTunes e Apple RSS.
 * O código e os testes ficam no repositório do Coverlist (server/); este arquivo e a pasta _coverlist
 * são gerados por \`npm run publish:portfolio\` lá.
 */
export default async function handler(request: CoverlistRequest, response: CoverlistResponse) {
  return handleCoverlist(request, response);
}
`;

function step(label: string) {
  console.log(`\n> ${label}`);
}

if (!existsSync(join(PORTFOLIO, "api"))) {
  console.error(`Portfólio não encontrado em ${PORTFOLIO} (pasta api/ ausente).`);
  process.exit(1);
}

step(`build com base ${BASE}`);
const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: true, env: { ...process.env, COVERLIST_BASE: BASE } });
if (build.status !== 0) process.exit(build.status ?? 1);

step(`app → ${APP_DIR}`);
rmSync(APP_DIR, { recursive: true, force: true });
mkdirSync(APP_DIR, { recursive: true });
cpSync(join(ROOT, "dist"), APP_DIR, { recursive: true });

step(`server/ → ${API_DIR}`);
rmSync(API_DIR, { recursive: true, force: true });
mkdirSync(API_DIR, { recursive: true });
const copied = readdirSync(join(ROOT, "server")).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
for (const file of copied) cpSync(join(ROOT, "server", file), join(API_DIR, file));
console.log(`  ${copied.join(", ")}`);

step(`Function → ${FUNCTION_FILE}`);
writeFileSync(FUNCTION_FILE, FUNCTION_SOURCE);

console.log("\nPronto. No portfólio, rode: npx tsc -p tsconfig.api.json && npx eslint api");
