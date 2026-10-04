import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogSource, type LoadedCatalog, readCatalogFile } from "@agnostic/catalog";
import { type AgnosticPaths, agnosticPaths, type CatalogCheckState } from "@agnostic/core";
import { planVendor } from "@agnostic/registry";
import { type CatalogChecker, createCatalogChecker } from "./catalog-check.js";
import type { CatalogStore } from "./catalog-store.js";

const REMOTE = fileURLToPath(new URL("../../../tests/fixtures/catalog/remote", import.meta.url));

export const SOURCE = catalogSource({ AGNOSTIC_CATALOG_URL: "http://catalog.test" });
export const HOUR_MS = 60 * 60 * 1000;
export const NOW = new Date("2026-09-12T09:00:00.000Z");

export type CheckerOptions = {
  enabled?: boolean;
  fetch?: typeof fetch;
  startDelayMs?: number;
  intervalMs?: number;
  /** What the re-probe the check triggers does, for the tests that watch it fail or hang. */
  probe?: () => Promise<void>;
};

export type CheckerFixture = {
  paths: AgnosticPaths;
  /** The messages the checker warned about, in order. */
  warnings: string[];
  /** Store reloads and probes, counted as they happen. */
  counts: { reloads: number; probes: number };
  create(over: CheckerOptions): CatalogChecker;
  readState(): Promise<CatalogCheckState>;
  writeState(over: Partial<CatalogCheckState>): Promise<void>;
  close(): Promise<void>;
};

/** The fixture catalog, served as the published one, with a manifest that matches its bytes. */
export async function published(version = 2): Promise<typeof fetch> {
  const body = await readFile(join(REMOTE, "catalog.json"), "utf8");
  const manifest = JSON.stringify({
    schemaVersion: 1,
    version,
    generatedAt: "2026-09-08T00:00:00Z",
    sha256: createHash("sha256").update(body).digest("hex"),
  });
  return (input) =>
    Promise.resolve(new Response(String(input) === SOURCE.manifestUrl ? manifest : body));
}

/** Rounds of the event loop with nothing to wait for, so whatever is queued gets to run. */
export async function drain(rounds = 20): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((done) => setImmediate(done));
  }
}

/** One checker's world: a temporary state directory, a counting store and a collecting log. */
export async function createCheckerFixture(): Promise<CheckerFixture> {
  const home = await mkdtemp(join(tmpdir(), "agn-check-"));
  const paths = agnosticPaths(home);
  const warnings: string[] = [];
  const counts = { reloads: 0, probes: 0 };
  let current = loaded(1);
  let checker: CatalogChecker | null = null;

  const store: CatalogStore = {
    current: () => current,
    reload: async () => {
      counts.reloads += 1;
      const catalog = await readCatalogFile(paths.catalog, { vendorOf: planVendor });
      current = catalog === null ? current : { ...current, catalog, origin: "downloaded" };
      return current;
    },
  };

  const readState = async (): Promise<CatalogCheckState> =>
    JSON.parse(await readFile(paths.catalogCheck, "utf8")) as CatalogCheckState;

  return {
    paths,
    warnings,
    counts,
    readState,
    create: (over) => {
      checker = createCatalogChecker({
        store,
        source: SOURCE,
        paths,
        log: {
          info: () => undefined,
          debug: () => undefined,
          warn: (message) => warnings.push(message),
          error: () => undefined,
          close: () => undefined,
        },
        enabled: over.enabled ?? true,
        onChecked: () => {
          counts.probes += 1;
          return over.probe === undefined ? Promise.resolve() : over.probe();
        },
        now: () => NOW,
        intervalMs: over.intervalMs ?? 24 * HOUR_MS,
        startDelayMs: over.startDelayMs ?? 5_000,
        ...(over.fetch === undefined ? {} : { fetch: over.fetch }),
      });
      return checker;
    },
    writeState: async (over) => {
      const state: CatalogCheckState = {
        checkedAt: NOW.toISOString(),
        outcome: "current",
        localVersion: 1,
        remoteVersion: 1,
        message: null,
        ...over,
      };
      await writeFile(paths.catalogCheck, JSON.stringify(state), "utf8");
    },
    close: async () => {
      checker?.close();
      await rm(home, { recursive: true, force: true });
    },
  };
}

function loaded(version: number): LoadedCatalog {
  return {
    catalog: {
      schemaVersion: 1,
      version,
      generatedAt: "2026-09-01T00:00:00Z",
      sources: [],
      benchmarks: [],
      models: [],
      plans: [],
      entitlements: [],
      pricing: [],
    },
    origin: "bundled",
    path: null,
    problems: [],
  };
}
