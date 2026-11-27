import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CollectionGroup, CollectionSummary } from "../../server/types";
import { ErrorState, MiniCover, OfflineBanner, SkipLink, Topbar } from "../components/Chrome";
import { Icon } from "../components/icons";
import { useSegPill } from "../components/Seg";
import { ApiError, failureMessage, useCollection, useCollections } from "../lib/api";
import { collectionsFor, eraLabel, erasIn, filterLabel, GROUPS, SCOPE_LABEL } from "../lib/collections";
import { formatDate, plural } from "../lib/design";
import { href, navigate, rememberExplore, requestAutoplay, type ExploreFilter } from "../lib/router";

/** No "Tudo", cada grupo mostra só as primeiras; o resto fica a um clique ("Ver todas"). */
const PREVIEW_COUNT = 8;

/** Carrega o detalhe do cartão só quando ele chega perto da tela: com dezenas de coleções, a home não pede tudo de uma vez. */
function useNearViewport<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

function CollectionCard({ summary }: { summary: CollectionSummary }) {
  const [ref, near] = useNearViewport<HTMLLIElement>();
  const query = useCollection(near ? summary.id : null);
  const detail = query.data;
  const paused = query.isPending && query.fetchStatus === "paused";
  const updated = formatDate(detail?.updatedAt);
  const playable = detail ? detail.tracks.filter((t) => t.preview).length : 0;
  let meta: ReactNode;
  if (detail) meta = `${plural(detail.total, "faixa", "faixas")}${updated ? ` · atualizado em ${updated}` : ""}`;
  else if (paused) meta = "Sem conexão para carregar";
  else if (query.isError) meta = query.error instanceof ApiError && query.error.failure === "unavailable" ? "Servidor indisponível" : "Não carregou agora";
  else meta = <span className="skeleton skeleton-line">carregando</span>;
  const listen = () => {
    requestAutoplay(summary.id);
    navigate(href.collection(summary.id));
  };
  return (
    <li className="ccard-item" ref={ref}>
      <a className="ccard" href={href.collection(summary.id)} aria-label={`${summary.title}. ${typeof meta === "string" ? meta : "Carregando"}. ${summary.source.label}`}>
        <MiniCover title={summary.title} theme={summary.theme} tracks={detail?.tracks ?? []} tag={summary.source.kind === "apple-chart" ? "Apple Music" : "Deezer"} />
        <span className="ccard-meta">
          <b>{summary.title}</b>
          <span>{meta}</span>
          {detail && playable < detail.tracks.length && <span>{plural(playable, "prévia", "prévias")} de 30 s</span>}
        </span>
      </a>
      <button type="button" className="ccard-play" onClick={listen} aria-label={`Ouvir as prévias de ${summary.title}`} title="Ouvir as prévias">
        <Icon.play />
      </button>
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

/** Grupo principal (Tudo, Paradas, Décadas, Gêneros): links com endereço próprio, o voltar do navegador funciona. */
function GroupNav({ filter }: { filter: ExploreFilter }) {
  const current = filter.group ?? "tudo";
  const ref = useSegPill<HTMLElement>(current);
  const items: { id: CollectionGroup | "tudo"; title: string }[] = [{ id: "tudo", title: "Tudo" }, ...GROUPS];
  return (
    <nav className="seg group-nav" aria-label="Tipo de coleção" ref={ref}>
      {items.map((g) => (
        <a key={g.id} href={g.id === "tudo" ? href.explore() : href.explore({ group: g.id })} aria-current={g.id === current ? "page" : undefined}>
          {g.title}
        </a>
      ))}
    </nav>
  );
}

/** Subfiltro: década (em Décadas) ou brasileiros/internacionais (em Gêneros). */
function SubNav({ filter, list }: { filter: ExploreFilter & { group: CollectionGroup }; list: readonly CollectionSummary[] }) {
  const inGroup = list.filter((c) => c.group === filter.group);
  let chips: { label: string; to: string; on: boolean }[] = [];
  if (filter.group === "decadas")
    chips = erasIn(inGroup).map((era) => ({ label: eraLabel(era), to: href.explore({ group: "decadas", era }), on: filter.era === era }));
  else if (filter.group === "generos")
    chips = (["brasil", "mundo"] as const).map((scope) => ({ label: SCOPE_LABEL[scope], to: href.explore({ group: "generos", scope }), on: filter.scope === scope }));
  if (!chips.length) return null;
  const all = { label: filter.group === "decadas" ? "Todas" : "Todos", to: href.explore({ group: filter.group }), on: !filter.era && !filter.scope };
  return (
    <nav className="chips" aria-label={filter.group === "decadas" ? "Década" : "Origem"}>
      {[all, ...chips].map((chip) => (
        <a key={chip.to} className="chip" href={chip.to} aria-current={chip.on ? "page" : undefined}>
          {chip.label}
        </a>
      ))}
    </nav>
  );
}

function GroupSection({ group, items, total, compact }: { group: (typeof GROUPS)[number]; items: CollectionSummary[]; total: number; compact: boolean }) {
  if (!items.length) return null;
  const shown = compact ? items.slice(0, PREVIEW_COUNT) : items;
  return (
    <section className="section" aria-labelledby={`g-${group.id}`}>
      <div className="section-head">
        <div className="section-title">
          <h2 id={`g-${group.id}`}>{group.title}</h2>
          <span className="count">
            {total}
            <span className="sr"> {total === 1 ? "coleção" : "coleções"}</span>
          </span>
        </div>
        <p>{group.hint}</p>
      </div>
      <ul className="grid">
        {shown.map((c) => (
          <CollectionCard key={c.id} summary={c} />
        ))}
      </ul>
      {compact && total > shown.length && (
        <p className="see-all">
          <a className="ghost" href={href.explore({ group: group.id })}>
            Ver {group.id === "decadas" ? "todas as" : "todos os"} {total} {group.id === "paradas" ? "rankings" : group.title.toLowerCase()}
            <Icon.back />
          </a>
        </p>
      )}
    </section>
  );
}

export function ExplorePage({ filter = {} }: { filter?: ExploreFilter }) {
  const collections = useCollections();
  const list = collections.data?.collections ?? [];
  const backTo = href.explore(filter);
  useEffect(() => rememberExplore(backTo), [backTo]);
  const groups = filter.group ? GROUPS.filter((g) => g.id === filter.group) : GROUPS;
  return (
    <div className="page">
      <SkipLink />
      <Topbar current="explore" />
      <main className="page-main" id="conteudo" tabIndex={-1}>
        <div className="hero">
          <h1>A capa viva da sua playlist</h1>
          <p>
            {list.length ? `${list.length} coleções` : "Paradas, décadas e gêneros"} com faixas e prévias de 30 s reais do Deezer e da Apple. Toque no play de uma capa para ouvir na hora, ou abra para ver as faixas e
            usar como base.
          </p>
        </div>
        <div className="explore-nav">
          <GroupNav filter={filter} />
          {filter.group && <SubNav filter={{ ...filter, group: filter.group }} list={list} />}
        </div>
        <OfflineBanner />
        {collections.isPending && collections.fetchStatus !== "paused" && groups.map((g) => <SkeletonGrid key={g.id} />)}
        {collections.isPending && collections.fetchStatus === "paused" && (
          <ErrorState title="Sem conexão" message="As coleções ainda não foram salvas neste navegador. Conecte-se para carregar." />
        )}
        {collections.isError && !collections.data && (
          <ErrorState title="Não deu para carregar as coleções" message={failureMessage(collections.error)} onRetry={() => void collections.refetch()} />
        )}
        {filter.group && collections.data && (
          <p className="sr" role="status">
            {filterLabel(filter)}: {plural(collectionsFor(list, { ...filter, group: filter.group }).length, "coleção", "coleções")}
          </p>
        )}
        {groups.map((group) => {
          const items = collectionsFor(list, { ...filter, group: group.id });
          return <GroupSection key={group.id} group={group} items={items} total={items.length} compact={!filter.group} />;
        })}
      </main>
    </div>
  );
}
