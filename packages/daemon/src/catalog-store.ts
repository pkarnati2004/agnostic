import { type LoadedCatalog, loadCatalog } from "@agnostic/catalog";
import type { Logger } from "./log.js";

/**
 * The catalog the daemon is serving, and the one way it changes. A download replaces the file on
 * disk; `reload` is what makes the running daemon see it, so an update needs no restart.
 */
export type CatalogStore = {
  current(): LoadedCatalog;
  reload(): Promise<LoadedCatalog>;
};

export function createCatalogStore(opts: {
  loaded: LoadedCatalog;
  downloaded: string;
  bundled?: string;
  log: Logger;
}): CatalogStore {
  let loaded = opts.loaded;
  report(opts.log, loaded);
  return {
    current: () => loaded,
    reload: async () => {
      // loadCatalog never throws: a download that stopped parsing is a log line and the bundle.
      loaded = await loadCatalog({
        downloaded: opts.downloaded,
        ...(opts.bundled === undefined ? {} : { bundled: opts.bundled }),
      });
      report(opts.log, loaded);
      return loaded;
    },
  };
}

function report(log: Logger, loaded: LoadedCatalog): void {
  for (const problem of loaded.problems) {
    log.error("catalog problem", { code: problem.code, message: problem.message });
  }
  log.info("catalog loaded", {
    origin: loaded.origin,
    version: loaded.catalog.version,
    models: loaded.catalog.models.length,
  });
}
