import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CATALOG_SCHEMA_VERSION, type Catalog, parseCatalog } from "./catalog-schema.js";
import { CatalogError } from "./error.js";

export type CatalogOrigin = "downloaded" | "bundled" | "empty";

export type LoadedCatalog = {
  catalog: Catalog;
  origin: CatalogOrigin;
  /** The file the rows came from; null when nothing was readable. */
  path: string | null;
  /** Everything that went wrong, for the daemon to log. An empty list is the normal case. */
  problems: CatalogError[];
};

/** The snapshot this package ships, resolved so that it works from `src` and from `dist`. */
export function bundledCatalogPath(): string {
  return fileURLToPath(new URL("./catalog.json", import.meta.url));
}

export function emptyCatalog(): Catalog {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    version: 0,
    generatedAt: new Date(0).toISOString(),
    sources: [],
    benchmarks: [],
    models: [],
    plans: [],
    entitlements: [],
    pricing: [],
  };
}

/** null when the file is not there, which is the normal state of the downloaded one. */
export async function readCatalogFile(path: string): Promise<Catalog | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new CatalogError(`cannot read ${path}`, {
      code: "catalog-unreadable",
      hint: "Check the file's permissions, or delete it to use the catalog agn ships with.",
      cause,
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new CatalogError(`${path} is not JSON`, {
      code: "catalog-malformed",
      hint: "Delete the file; agn falls back to the catalog it ships with.",
      cause,
    });
  }
  return parseCatalog(raw);
}

/**
 * Both files, higher `version` wins. A download only counts once it parses, so a truncated or
 * tampered file costs nothing but a log line. Nothing here throws: the daemon must start.
 */
export async function loadCatalog(opts: {
  downloaded: string;
  bundled?: string;
}): Promise<LoadedCatalog> {
  const bundledPath = opts.bundled ?? bundledCatalogPath();
  const problems: CatalogError[] = [];
  const downloaded = await read(opts.downloaded, problems);
  const bundled = await read(bundledPath, problems);
  if (downloaded && (!bundled || downloaded.version >= bundled.version)) {
    return { catalog: downloaded, origin: "downloaded", path: opts.downloaded, problems };
  }
  if (bundled) {
    return { catalog: bundled, origin: "bundled", path: bundledPath, problems };
  }
  if (!downloaded) {
    // Only now is a missing bundle a problem: without it there is nothing left to score with.
    problems.push(
      new CatalogError(`no catalog at ${bundledPath}`, {
        code: "catalog-missing",
        hint: "Reinstall agn: the catalog ships with it.",
      }),
    );
  }
  return { catalog: emptyCatalog(), origin: "empty", path: null, problems };
}

async function read(path: string, problems: CatalogError[]): Promise<Catalog | null> {
  try {
    return await readCatalogFile(path);
  } catch (cause) {
    problems.push(
      cause instanceof CatalogError
        ? cause
        : new CatalogError(`cannot read ${path}`, { code: "catalog-unreadable", cause }),
    );
    return null;
  }
}
