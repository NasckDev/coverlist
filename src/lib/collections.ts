import { ERAS, type CollectionGroup, type CollectionScope, type CollectionSummary, type Era } from "../../server/types";
import type { ExploreFilter } from "./router";

export const GROUPS: readonly { id: CollectionGroup; title: string; hint: string }[] = [
  { id: "paradas", title: "Paradas", hint: "Rankings reais, atualizados pelas fontes" },
  { id: "decadas", title: "Décadas", hint: "Seleções editoriais do Deezer, dos anos 60 até agora" },
  { id: "generos", title: "Gêneros", hint: "Curadoria das redações do Deezer" },
];

export const groupTitle = (group: CollectionGroup) => GROUPS.find((g) => g.id === group)?.title ?? "Explorar";

/** "Anos 80", "Anos 2000". */
export const eraLabel = (era: Era) => `Anos ${era < 2000 ? String(era).slice(2) : era}`;

export const SCOPE_LABEL: Record<CollectionScope, string> = { brasil: "Brasileiros", mundo: "Internacionais" };

export const erasIn = (list: readonly CollectionSummary[]): Era[] => ERAS.filter((era) => list.some((c) => c.era === era));

/** Coleções de um grupo, já com o subfiltro (década ou recorte) aplicado. Décadas saem em ordem cronológica. */
export function collectionsFor(list: readonly CollectionSummary[], filter: ExploreFilter & { group: CollectionGroup }): CollectionSummary[] {
  const items = list.filter((c) => c.group === filter.group && (!filter.era || c.era === filter.era) && (!filter.scope || c.scope === filter.scope));
  if (filter.group !== "decadas") return items;
  return [...items].sort((a, b) => (a.era ?? 0) - (b.era ?? 0));
}

/** Rótulo do filtro atual, para o botão voltar e o título da seção ("Décadas · Anos 80"). */
export function filterLabel(filter: ExploreFilter): string {
  if (!filter.group) return "Explorar";
  const sub = filter.era ? eraLabel(filter.era) : filter.scope ? SCOPE_LABEL[filter.scope] : null;
  return sub ? `${groupTitle(filter.group)} · ${sub}` : groupTitle(filter.group);
}
