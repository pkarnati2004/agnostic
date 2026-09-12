import { CatalogError } from "./error.js";

/** The repo the weekly Action publishes to; `main` is always the current pair of files. */
export const CATALOG_BASE_URL =
  "https://raw.githubusercontent.com/pkarnati2004/agnostic-catalog/main";

export type CatalogSource = { manifestUrl: string; fileUrl: string };

/**
 * The two URLs the one outbound call in agn may touch (ADR 002). `AGNOSTIC_CATALOG_URL` replaces
 * the base so tests point at a loopback server and a user behind a mirror points at their copy;
 * it is checked here, before anything is fetched, because it decides where agn reaches.
 */
export function catalogSource(env: Record<string, string>): CatalogSource {
  const override = env.AGNOSTIC_CATALOG_URL;
  const base = (override === undefined ? CATALOG_BASE_URL : checked(override)).replace(/\/$/, "");
  return { manifestUrl: `${base}/manifest.json`, fileUrl: `${base}/catalog.json` };
}

/** http and https only: a file: URL or a bare path would make "fetch the catalog" mean something else. */
function checked(base: string): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch (cause) {
    throw invalid(base, "that is not a URL", cause);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalid(base, `agn does not fetch over ${url.protocol}`, undefined);
  }
  return base;
}

function invalid(base: string, why: string, cause: unknown): CatalogError {
  return new CatalogError(`AGNOSTIC_CATALOG_URL is "${base}": ${why}`, {
    code: "catalog-url-invalid",
    hint: "Set it to an http or https base serving manifest.json and catalog.json, or unset it.",
    cause,
  });
}
