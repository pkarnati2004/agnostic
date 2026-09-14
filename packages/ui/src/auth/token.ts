export const TOKEN_KEY = "agn.token";

/** The browser handles this needs, injected so the rules can be read and tested on their own. */
export type TokenSources = {
  hash: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  clearFragment(): void;
};

/**
 * `#token=<hex>` is how `agn ui` hands the token over: it is stored and then stripped, so a
 * reload, a bookmark and a copied URL all carry nothing secret.
 */
export function readToken(sources: TokenSources): string | null {
  const fromFragment = new URLSearchParams(sources.hash.replace(/^#/, "")).get("token");
  if (fromFragment !== null && fromFragment !== "") {
    sources.storage.setItem(TOKEN_KEY, fromFragment);
    sources.clearFragment();
    return fromFragment;
  }
  return sources.storage.getItem(TOKEN_KEY);
}

/** The real page's handles: the fragment goes without adding a history entry. */
export function browserTokenSources(): TokenSources {
  return {
    hash: window.location.hash,
    storage: window.localStorage,
    clearFragment: () =>
      window.history.replaceState(null, "", window.location.pathname + window.location.search),
  };
}
