# Coverlist

A capa viva da sua playlist: vinil animado, três modelos (editorial, toca-discos e pôster), cinco cores de selo, player de prévias de 30 s e imagem para story ou quadrado. As faixas vêm de APIs públicas reais (Deezer, iTunes Search/Lookup e Apple Marketing Tools RSS), consumidas por um proxy único que valida, normaliza, deduplica e põe cache em tudo.

Publicado em `https://nasck.vercel.app/projetos/coverlist/` (o proxy é a Function `/api/coverlist` do portfólio).

## Como rodar

```bash
npm install
npm run dev          # http://localhost:5191 (o preview e o E2E usam a mesma porta), com /api/coverlist chamando o mesmo handler da Function
npm run verify       # lint + typecheck (app e servidor) + testes unitários e de componente + build
npm run e2e          # Playwright no build de produção, com as APIs interceptadas pelas fixtures
npm run publish:portfolio   # build com base /projetos/coverlist/ e cópia para C:\ale\Myportfolio
```

Outros scripts: `npm run verify:collections` (confere ao vivo se cada coleção ainda aponta para a playlist e o dono certos) e `npm run fixtures:record` (regrava as respostas reais usadas nos testes).

## Arquitetura

```
src/                     app React 19 + TypeScript strict
  pages/                 Explorar, Coleção, Minhas playlists, Editor, Playlist compartilhada
  components/            Cover (a capa viva do protótipo), Studio (editor + palco), busca, lista reordenável, compartilhar
  player/                um <audio> para o app inteiro: fila, avanço automático, atalhos, Media Session
  lib/api.ts             cliente do proxy + TanStack Query (cache, retry, estados, cache persistido offline)
  store/                 playlists no IndexedDB (idb-keyval) com versão de esquema e migração
  share/                 imagem em canvas (capas reais com CORS) e link compartilhável compactado
server/                  domínio do proxy (copiado para Myportfolio/api/_coverlist)
  handler.ts             lista fechada de operações, validação, cache por tipo de dado, erros
  sources.ts             chamadas às origens (Deezer, iTunes, Apple RSS, oEmbed do Spotify)
  normalize.ts           respostas de origem → tipo único Track
  dedupe.ts              deduplicação entre fontes
  collections.ts         coleções curadas, versionadas
tests/                   unitários e de componente (Vitest + Testing Library + MSW), fixtures reais
e2e/                     Playwright + axe
```

Roteamento por hash (`#/`, `#/c/<coleção>`, `#/p`, `#/p/<playlist>`, `#/s/<link>`), para funcionar em subpasta estática e ao recarregar.

## O proxy (`/api/coverlist?op=…`)

Nenhuma URL vem do cliente: o servidor monta todas a partir de parâmetros validados, então não há SSRF. Parâmetro desconhecido, repetido ou fora do formato é recusado com 400 antes de qualquer chamada. Erro de origem vira `502 { "error": "upstream_unavailable" }` sem detalhe; o motivo vai só para o log da Function. Toda chamada de origem tem timeout (8 s) e limite de tamanho (2 MB).

| Operação | Parâmetros | Origem | Cache na borda |
|---|---|---|---|
| `collections` | nenhum | configuração versionada | `s-maxage=86400, stale-while-revalidate=604800` |
| `collection` | `id` (slug da configuração) | Apple RSS + lookup em lote, ou playlist do Deezer | paradas: `s-maxage=3600, swr=21600`; playlists: `s-maxage=21600, swr=86400` |
| `charts` | `country` (allowlist de 12 países), `limit` (10, 25, 50, 100) | Apple RSS + iTunes Lookup | `s-maxage=3600, swr=21600` |
| `playlist` | `id` numérico | Deezer `playlist/{id}` | `s-maxage=900, swr=3600` |
| `search` | `q` (2–80 caracteres), `limit` (1–25), `country` | Deezer `search` + iTunes `search`, em paralelo | `s-maxage=1800, swr=3600` |
| `track` | `id` numérico | Deezer `track/{id}` (prévia assinada) | `s-maxage=300, swr=60` |
| `lookup` | `id` numérico, `country` | iTunes `lookup` de uma faixa (prévia que o lote da parada não trouxe) | `s-maxage=86400, swr=604800` |
| `spotify` | `id` (22 caracteres) | oEmbed do Spotify (só o nome) | `s-maxage=86400, swr=604800` |

404 (coleção inexistente, playlist que o Deezer responde com o erro 800) leva `s-maxage=300`; 400 e 502 levam `no-store`.

### Decisões sobre as APIs

- **Tipo único `Track`**: id com prefixo da fonte (`dz:` ou `it:`), título, artista, álbum, duração, capa em três tamanhos, prévia, fonte, explícito e link. Os normalizadores aceitam só `https` em hosts conhecidos (`dzcdn.net`, `deezer.com`, `mzstatic.com`, `apple.com`) e descartam o resto.
- **Prévia do Deezer não é guardada**: a URL vem assinada e expira em cerca de 15 minutos (`hdnea=exp=…`). O proxy devolve só `{ kind: "deezer", trackId }`; o player chama `op=track` na hora de tocar, e o app reaproveita a URL até um minuto antes do `exp` informado. A prévia do iTunes é estável e pode ser salva.
- **Paradas da Apple + Lookup**: o RSS traz posição, capa e nome, mas não prévia nem duração. O proxy faz um lookup em lote (`lookup?id=a,b,c`, lotes de 25) e junta pelo id. Falha temporária (timeout, rede, 429, 5xx) é repetida uma vez com espera; 4xx não. Paradas e lookups ficam 15 min/1 h num cache em memória da instância e, se a origem cair, a última resposta boa serve por até 24 h. Lote que falha não derruba a parada: as faixas dele saem com a prévia "a resolver" (`{ kind: "itunes", trackId, country }`) e o player busca essa faixa sozinha (`op=lookup`) na hora de tocar.
- **Busca unificada**: Deezer e iTunes em paralelo, intercalados e deduplicados por título normalizado (sem acento, sem "feat.", sem "Remastered") + primeiro artista, com tolerância de 6 s na duração. A primeira ocorrência fica e herda o que faltava (capa, prévia) da duplicata. Se só uma fonte responde, a busca sai parcial e diz qual faltou.
- **Erros "200" do Deezer**: o Deezer responde HTTP 200 com `{ error: { code } }`. Código 800 vira 404; quota (4) e os demais viram 502.
- **Spotify e YouTube**: o Spotify só tem oEmbed público, então o app importa o nome e diz claramente que as faixas não vêm. O YouTube exige chave de API, então o link é reconhecido e recusado com explicação. Links curtos do app do Deezer (`deezer.page.link`) não são seguidos: seria preciso buscar uma URL arbitrária no servidor.
- **`chart/0` do Deezer não é usado nas coleções**: ele responde conforme o país de quem chama (no servidor da Vercel seria outro país). As paradas por país vêm da Apple, e o Top Mundo vem da playlist "Top Worldwide" da conta Deezer Charts.

### Coleções curadas

Configuração em `server/collections.ts` (versão `2026-11-25`). Ids do Deezer conferidos na API pública em 25/11/2026: todos pertencem a contas editoriais do próprio Deezer.

| Coleção | Fonte |
|---|---|
| Paradas do Brasil | Apple RSS `br` most-played (50) |
| Top Mundo | Deezer 3155776842 "Top Worldwide" (Deezer Charts) |
| Paradas dos EUA | Apple RSS `us` most-played (50) |
| Top Brasil no Deezer | Deezer 1111141961 "Top Brasil" (Deezer Charts) |
| Anos 80 | Deezer 867825522 "80s Hits" (Laeti - Deezer Pop Editor) |
| Anos 90 | Deezer 878989033 "90s Hits" (Laeti - Deezer Pop Editor) |
| Anos 2000 | Deezer 248297032 "00s Hits" (Laeti - Deezer Pop Editor) |
| Anos 80 no Brasil | Deezer 309650853 (Editores Deezer Brasil) |
| Sertanejo | Deezer 5207214368 "Top 50 Sertanejo" (Daniel - Editor Sênior Deezer Brasil) |
| Pagode e samba | Deezer 1335664985 "Essenciais do Pagode" (Editores Deezer Brasil) |
| Rock | Deezer 1306931615 "Rock Essentials" (Rod - Deezer Rock Editor) |
| Pop | Deezer 1036183001 "Pop Essentials" (Laeti - Deezer Pop Editor) |
| Hip-hop | Deezer 1996494362 "Rap Bangers" (Ayoub - Deezer Rap Editor) |
| MPB | Deezer 556502217 "Clássicos da MPB" (Editores Deezer Brasil) |
| Rap nacional | Deezer 11881565941 "Essenciais do Rap Brasileiro" (Editores Deezer Brasil) |

## No navegador

- **TanStack Query**: cache por chave, retry só para falha de rede ou de origem (4xx não repete), estados de carregamento, erro e "sem conexão". Coleções vão para um cache persistido no IndexedDB (7 dias, invalidado pela versão da configuração), então Explorar e as coleções já vistas abrem offline com aviso.
- **Playlists**: IndexedDB com `schemaVersion`. Toda leitura passa por validação campo a campo; dado corrompido é descartado e contado, versão mais nova não é sobrescrita. A migração v1 → v2 converte o formato do protótipo (`localStorage` `ladoa:v2`). Limites: 100 faixas por playlist (o mesmo teto das coleções: "usar como base" copia a coleção inteira) e 100 playlists. O aviso de limite aparece uma vez, só quando a pessoa tenta passar dele. Exportar e importar JSON passam pela mesma validação.
- **Link compartilhável**: o estado vai no próprio link (`#/s/…`), em JSON compacto, `deflate-raw` e base64url. Capas e prévias viajam como referências curtas (hash da capa do Deezer, caminho do CDN da Apple) e são remontadas só em hosts conhecidos, então um link adulterado não consegue apontar o app para outro servidor. Na leitura tudo é validado: versão, tamanho, tema, modelo e cada faixa.
- **Imagem para compartilhar**: canvas 1080×1920 ou 1080×1080, portado do protótipo, com capas reais (os CDNs do Deezer e da Apple respondem `Access-Control-Allow-Origin: *`); capa que não carrega em 4 s vira a capa gerada.
- **Player**: um `<audio>` só, fila da tela atual, anterior/próxima, avanço automático pulando faixas sem prévia, posição (marcada como "Prévia": as fontes liberam 30 s; a lista mostra a duração da música inteira), volume e silenciar dentro da barra do player da capa, atalhos (espaço; ← → 5 s; Shift + ← → troca a faixa; lista no ícone de teclado do painel) e Media Session (controles na tela de bloqueio).
- **Acessibilidade**: abas com setas, reordenar por arrastar (pointer events, funciona no toque) e pelo teclado (alça + ↑ ↓ Home End) com anúncio para leitor de tela, foco visível, alvos de 44 px no toque, `prefers-reduced-motion` respeitado (a abertura não roda).

## Testes

- **Unitários e de componente** (Vitest + Testing Library + MSW): normalizadores com respostas reais gravadas em `tests/fixtures/`, deduplicação, handler (allowlist, validação, timeout, erro de origem → 502, cabeçalhos de cache), persistência e migração no IndexedDB (fake-indexeddb), codec do link, links e rotas, e componentes com o MSW respondendo pelo próprio handler alimentado com as fixtures.
- **E2E** (Playwright + @axe-core/playwright): o build de produção roda no `vite preview`; o proxy, o áudio e as capas são interceptados (o handler de verdade com as fixtures, um WAV mudo e um PNG de 1 px), então nada sai para a rede. Cobre explorar → abrir coleção → tocar → usar como base → criar playlist → buscar e adicionar → reordenar (teclado e arrastar) → compartilhar imagem e link → abrir o link em outro contexto, em 390 e 1440 px, claro e escuro, com axe sem violações sérias. Uma varredura extra confere todas as telas em 320, 375, 390, 768, 1024, 1280, 1440 e 1920 px nos dois temas: sem rolagem horizontal, título da capa cabendo e vinil fora do texto.

## Fontes

Bricolage Grotesque e Hanken Grotesk auto-hospedadas (SIL Open Font License 1.1, licenças em `src/assets/fonts/`).
