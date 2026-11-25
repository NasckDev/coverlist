import type { ReactNode } from "react";
import type { CollectionGroup, CollectionSummary } from "../../server/types";
import { ApiError, failureMessage, useCollection, useCollections } from "../lib/api";
import { formatDate, plural } from "../lib/design";
import { href } from "../lib/router";
import { ErrorState, MiniCover, OfflineBanner, SkipLink, Topbar } from "../components/Chrome";

const GROUPS: { id: CollectionGroup; title: string; hint: string }[] = [
  { id: "paradas", title: "Paradas", hint: "Rankings reais, atualizados pelas fontes" },
  { id: "decadas", title: "Décadas", hint: "Seleções editoriais do Deezer" },
  { id: "generos", title: "Gêneros", hint: "Curadoria das redações do Deezer" },
];

function CollectionCard({ summary }: { summary: CollectionSummary }) {
  const query = useCollection(summary.id);
  const detail = query.data;
  const paused = query.isPending && query.fetchStatus === "paused";
  const updated = formatDate(detail?.updatedAt);
  const playable = detail ? detail.tracks.filter((t) => t.preview).length : 0;
  let meta: ReactNode;
  if (detail) meta = `${plural(detail.total, "faixa", "faixas")}${updated ? ` · atualizado em ${updated}` : ""}`;
  else if (paused) meta = "Sem conexão para carregar";
  else if (query.isError) meta = query.error instanceof ApiError && query.error.failure === "unavailable" ? "Servidor indisponível" : "Não carregou agora";
  else meta = <span className="skeleton skeleton-line">carregando</span>;
  return (
    <li>
      <a className="ccard" href={href.collection(summary.id)} aria-label={`${summary.title}. ${typeof meta === "string" ? meta : "Carregando"}. ${summary.source.label}`}>
        <MiniCover title={summary.title} theme={summary.theme} tracks={detail?.tracks ?? []} tag={summary.source.kind === "apple-chart" ? "Apple Music" : "Deezer"} />
        <span className="ccard-meta">
          <b>{summary.title}</b>
          <span>{meta}</span>
          {detail && playable < detail.tracks.length && <span>{plural(playable, "prévia", "prévias")} de 30 s</span>}
        </span>
      </a>
    </li>
  );
}

function SkeletonGrid() {
  return (
    <ul className="grid" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i}>
          <div className="mini skeleton" />
          <span className="skeleton skeleton-line" />
        </li>
      ))}
    </ul>
  );
}

export function ExplorePage() {
  const collections = useCollections();
  const list = collections.data?.collections ?? [];
  return (
    <div className="page">
      <SkipLink />
      <Topbar current="explore" />
      <main className="page-main" id="conteudo" tabIndex={-1}>
        <div className="hero">
          <h1>A capa viva da sua playlist</h1>
          <p>Paradas, décadas e gêneros com faixas e prévias de 30 s reais do Deezer e da Apple. Abra uma coleção para ouvir, ou use como base para montar a sua.</p>
        </div>
        <OfflineBanner />
        {collections.isPending && collections.fetchStatus !== "paused" && GROUPS.map((g) => <SkeletonGrid key={g.id} />)}
        {collections.isPending && collections.fetchStatus === "paused" && (
          <ErrorState title="Sem conexão" message="As coleções ainda não foram salvas neste navegador. Conecte-se para carregar." />
        )}
        {collections.isError && !collections.data && (
          <ErrorState title="Não deu para carregar as coleções" message={failureMessage(collections.error)} onRetry={() => void collections.refetch()} />
        )}
        {GROUPS.map((group) => {
          const items = list.filter((c) => c.group === group.id);
          if (!items.length) return null;
          return (
            <section className="section" key={group.id} aria-labelledby={`g-${group.id}`}>
              <div className="section-head">
                <h2 id={`g-${group.id}`}>{group.title}</h2>
                <p>{group.hint}</p>
              </div>
              <ul className="grid">
                {items.map((c) => (
                  <CollectionCard key={c.id} summary={c} />
                ))}
              </ul>
            </section>
          );
        })}
      </main>
    </div>
  );
}
