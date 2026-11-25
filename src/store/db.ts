import { createStore, del, get, set, type UseStore } from "idb-keyval";
import { migrate, newPlaylistId, type Library, type MigrationResult } from "./schema";

const LIBRARY_KEY = "library";
/** Chave do protótipo; lida uma vez se ainda não existe biblioteca no IndexedDB. */
export const LEGACY_LOCAL_KEY = "ladoa:v2";

let store: UseStore | null = null;
const db = () => (store ??= createStore("coverlist", "kv"));

export interface LoadResult extends MigrationResult {
  /** IndexedDB indisponível (modo privado restrito, por exemplo): o app segue só em memória. */
  persistent: boolean;
}

function readLegacy(): unknown {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export async function loadLibrary(): Promise<LoadResult> {
  try {
    const stored = await get<unknown>(LIBRARY_KEY, db());
    const result = migrate(stored ?? readLegacy(), newPlaylistId);
    if (stored == null && result.library.playlists.length) await set(LIBRARY_KEY, result.library, db());
    else if (result.migrated && !result.fromFuture) await set(LIBRARY_KEY, result.library, db());
    return { ...result, persistent: true };
  } catch {
    return { ...migrate(null, newPlaylistId), persistent: false };
  }
}

export async function saveLibrary(library: Library): Promise<boolean> {
  try {
    await set(LIBRARY_KEY, library, db());
    return true;
  } catch {
    return false;
  }
}

/** Storage do cache persistido do TanStack Query (só coleções). */
export const queryCacheStorage = {
  getItem: async (key: string) => {
    try {
      return (await get<string>(`query:${key}`, db())) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await set(`query:${key}`, value, db());
    } catch {
      /* sem IndexedDB o cache offline só não é gravado */
    }
  },
  removeItem: async (key: string) => {
    try {
      await del(`query:${key}`, db());
    } catch {
      /* idem */
    }
  },
};
