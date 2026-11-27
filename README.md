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

Roteamento por hash (`#/`, `#/g/<grupo>[/<década ou recorte>]`, `#/c/<coleção>`, `#/p`, `#/p/<playlist>`, `#/s/<link>`), para funcionar em subpasta estática e ao recarregar. Os filtros de Explorar (`#/g/decadas/1980`, `#/g/generos/brasil`) têm endereço próprio: o voltar da coleção e o do navegador caem no mesmo filtro.

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
| `playlists` | `q` (2–80 caracteres), `limit` (1–25) | Deezer `search/playlist` (só playlists públicas) | `s-maxage=1800, swr=3600` |
| `shortlink` | `code` (4–40 letras e números) | `link.deezer.com/s/{code}`: lê só o `Location` do redirect, sem segui-lo | `s-maxage=86400, swr=604800` |

404 (coleção inexistente, playlist que o Deezer responde com o erro 800) leva `s-maxage=300`; 400 e 502 levam `no-store`.

### Decisões sobre as APIs

- **Tipo único `Track`**: id com prefixo da fonte (`dz:` ou `it:`), título, artista, álbum, duração, capa em três tamanhos, prévia, fonte, explícito e link. Os normalizadores aceitam só `https` em hosts conhecidos (`dzcdn.net`, `deezer.com`, `mzstatic.com`, `apple.com`) e descartam o resto.
- **Prévia do Deezer não é guardada**: a URL vem assinada e expira em cerca de 15 minutos (`hdnea=exp=…`). O proxy devolve só `{ kind: "deezer", trackId }`; o player chama `op=track` na hora de tocar, e o app reaproveita a URL até um minuto antes do `exp` informado. A prévia do iTunes é estável e pode ser salva.
- **Paradas da Apple + Lookup**: o RSS traz posição, capa e nome, mas não prévia nem duração. O proxy faz um lookup em lote (`lookup?id=a,b,c`, lotes de 25) e junta pelo id. Falha temporária (timeout, rede, 429, 5xx) é repetida uma vez com espera; 4xx não. Paradas e lookups ficam 15 min/1 h num cache em memória da instância e, se a origem cair, a última resposta boa serve por até 24 h. Lote que falha não derruba a parada: as faixas dele saem com a prévia "a resolver" (`{ kind: "itunes", trackId, country }`) e o player busca essa faixa sozinha (`op=lookup`) na hora de tocar.
- **Busca unificada**: Deezer e iTunes em paralelo, intercalados e deduplicados por título normalizado (sem acento, sem "feat.", sem "Remastered") + primeiro artista, com tolerância de 6 s na duração. A primeira ocorrência fica e herda o que faltava (capa, prévia) da duplicata. Se só uma fonte responde, a busca sai parcial e diz qual faltou.
- **Erros "200" do Deezer**: o Deezer responde HTTP 200 com `{ error: { code } }`. Código 800 vira 404; quota (4) e os demais viram 502.
- **Link de compartilhar do app do Deezer**: o "Compartilhar → Copiar link" do app gera `https://link.deezer.com/s/<código>`, sem o id da playlist (era isso que a importação recusava com erro). O servidor monta a URL só a partir do código validado, pede com `redirect: "manual"` e lê o `Location`: um código válido responde `301` para `link.deezer.com/?…&dest=https://www.deezer.com/<tipo>/<id>`, um vencido responde `302` para `www.deezer.com/deezer-links-404` (conferido em 27/11/2026, respostas gravadas em `tests/fixtures/deezer-share-redirects.json`). Só destinos `https` em `deezer.com` são aceitos; o app então importa a playlist ou explica que o link é de álbum, faixa ou artista. O texto copiado pode vir com frase em volta: o app extrai o endereço.
- **Importar pelo nome**: sem link (ou com link de Apple Music, YouTube ou Spotify), a pessoa digita o nome e escolhe entre playlists públicas do Deezer (`search/playlist`). Playlist privada e inexistente respondem igual no Deezer (erro 800), então a mensagem cobre as duas e diz como tornar a playlist pública.
- **Spotify, Apple Music e YouTube**: o Spotify só tem oEmbed público, então vem o nome; o app sugere playlists do Deezer com esse nome ou cria só com o nome. Apple Music (playlist) exige chave de desenvolvedor e YouTube exige chave do Google: os links são reconhecidos e explicados. Links antigos `deezer.page.link` não são seguidos: seria buscar uma URL arbitrária no servidor.
- **`chart/0` do Deezer não é usado nas coleções**: ele responde conforme o país de quem chama (no servidor da Vercel seria outro país). As paradas por país vêm da Apple, e o Top Mundo vem da playlist "Top Worldwide" da conta Deezer Charts.

### Coleções curadas

Configuração em `server/collections.ts` (versão `2026-11-27`): 50 coleções (9 paradas, 14 décadas, 27 gêneros), com década (`era`) e recorte Brasil/Mundo (`scope`) para os filtros de Explorar. Ids do Deezer conferidos na API pública em 25/11/2026 (as 15 primeiras) e 27/11/2026 (as demais): todas públicas e de contas editoriais do próprio Deezer. A lista completa, com dono de cada playlist, está no próprio arquivo; `npm run verify:collections` refaz a conferência.

## No navegador

- **Explorar**: Tudo, Paradas, Décadas e Gêneros na mesma pílula do topo; em Décadas, um filtro por década (anos 60 a 2020), em Gêneros, brasileiros ou internacionais. O play de cada capa abre a coleção já tocando a primeira faixa com prévia. Cada cartão só pede o detalhe da coleção quando chega perto da tela.
- **Coleção e editor**: botão voltar sempre à vista (no painel, e numa barra fixa no topo no celular, onde a capa vem antes do painel), resumo com faixas, duração, prévias e artistas, "Ouvir prévias", "Faixa aleatória", link para a playlist no Deezer e "Mais em …" para trocar de década ou gênero sem voltar.
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
