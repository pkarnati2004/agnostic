// Defaults the page needs before `GET /config` answers, which is why they are browser-safe and
// carry no schema: the catalog notice draws on the first render, and the daemon's answer is later.

/** Days before the workspace calls the catalog stale. A weekend and a Monday fit inside it. */
export const DEFAULT_CATALOG_STALE_DAYS = 7;
