import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogSource, type LoadedCatalog, readCatalogFile } from "@agnostic/catalog";
import { type AgnosticPaths, agnosticPaths, type CatalogCheckState } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CatalogChecker, createCatalogChecker } from "./catalog-check.js";
import type { CatalogStore } from "./catalog-store.js";
import type { Logger } from "./log.js";

const REMOTE = fileURLToPath(new URL("../../../tests/fixtures/catalog/remote", import.meta.url));
const SOURCE = catalogSource({ AGNOSTIC_CATALOG_URL: "http://catalog.test" });
const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-09-12T09:00:00.000Z");

let home: string;
let paths: AgnosticPaths;
let warnings: string[];
let log: Logger;
let reloads: number;
let updated: number;
let store: CatalogStore;
let checker: CatalogChecker | null;

/** The fixture catalog, served as the published one, with a manifest that matches its bytes. */
async function published(version = 2): Promise<typeof fetch> {
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

function loaded(version: number): LoadedCatalog {
  return {
    catalog: { ...empty, version },
    origin: "bundled",
    path: null,
    problems: [],
  };
}

const empty = {
  schemaVersion: 1 as const,
  version: 1,
  generatedAt: "2026-09-01T00:00:00Z",
  sources: [],
  benchmarks: [],
  models: [],
  plans: [],
  entitlements: [],
  pricing: [],
};

function create(over: {
  enabled?: boolean;
  fetch?: typeof fetch;
  startDelayMs?: number;
  intervalMs?: number;
}): CatalogChecker {
  checker = createCatalogChecker({
    store,
    source: SOURCE,
    paths,
    log,
    enabled: over.enabled ?? true,
    onUpdated: () => {
      updated += 1;
      return Promise.resolve();
    },
    now: () => NOW,
    intervalMs: over.intervalMs ?? 24 * HOUR_MS,
    startDelayMs: over.startDelayMs ?? 5_000,
    ...(over.fetch === undefined ? {} : { fetch: over.fetch }),
  });
  return checker;
}

async function writeState(over: Partial<CatalogCheckState>): Promise<void> {
  const state: CatalogCheckState = {
    checkedAt: NOW.toISOString(),
    outcome: "current",
    localVersion: 1,
    remoteVersion: 1,
    message: null,
    ...over,
  };
  await writeFile(paths.catalogCheck, JSON.stringify(state), "utf8");
}

/** Only the timers are faked, so the file writes a check makes still happen on their own. */
function fakeTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
}

/**
 * Drains the I/O a check queues; a faked clock does not move file writes along. The extra rounds
 * after the condition holds let the check finish, not just reach the point being waited for.
 */
async function settle(until: () => boolean): Promise<void> {
  for (let round = 0; round < 500 && !until(); round += 1) {
    await new Promise((done) => setImmediate(done));
  }
  for (let round = 0; round < 20; round += 1) {
    await new Promise((done) => setImmediate(done));
  }
}

async function readState(): Promise<CatalogCheckState> {
  return JSON.parse(await readFile(paths.catalogCheck, "utf8")) as CatalogCheckState;
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-check-"));
  paths = agnosticPaths(home);
  warnings = [];
  reloads = 0;
  updated = 0;
  checker = null;
  log = {
    info: () => undefined,
    warn: (msg) => warnings.push(msg),
    error: () => undefined,
    close: () => undefined,
  };
  let current = loaded(1);
  store = {
    current: () => current,
    reload: async () => {
      reloads += 1;
      const catalog = await readCatalogFile(paths.catalog);
      current = catalog === null ? current : { ...current, catalog, origin: "downloaded" };
      return current;
    },
  };
});

afterEach(async () => {
  checker?.close();
  vi.useRealTimers();
  await rm(home, { recursive: true, force: true });
});

describe("createCatalogChecker", () => {
  it("downloads a newer catalog, reloads the store and says so once", async () => {
    const update = await create({ fetch: await published() }).update();
    expect(update.outcome).toBe("updated");
    expect(reloads).toBe(1);
    expect(updated).toBe(1);
    expect(await readState()).toMatchObject({ outcome: "updated", remoteVersion: 2 });
  });

  it("records a check that found nothing newer", async () => {
    const update = await create({ fetch: await published(1) }).update();
    expect(update.outcome).toBe("current");
    expect(reloads).toBe(0);
    expect(await readState()).toMatchObject({ outcome: "current", localVersion: 1 });
  });

  it("records a failure as a warning, never as an error the user sees", async () => {
    const refused: typeof fetch = () => Promise.reject(new Error("connect ECONNREFUSED"));
    await expect(create({ fetch: refused }).update()).rejects.toThrowError(
      expect.objectContaining({ code: "catalog-fetch-failed" }),
    );
    expect(warnings).toEqual(["catalog check failed"]);
    expect(await readState()).toMatchObject({ outcome: "failed", remoteVersion: null });
  });

  it("shares one check between the timer and a caller", async () => {
    let calls = 0;
    const counting = await published();
    const checkerUnderTest = create({
      fetch: (input, init) => {
        calls += 1;
        return counting(input, init);
      },
    });
    const [first, second] = await Promise.all([
      checkerUnderTest.update(),
      checkerUnderTest.update(),
    ]);
    expect(first).toEqual(second);
    // Two requests, not four: one manifest and one file for the pair of calls.
    expect(calls).toBe(2);
  });

  it("checks at start when nothing was ever recorded", async () => {
    fakeTimers();
    create({ fetch: await published(), startDelayMs: 5_000 });
    expect(checker?.lastCheck()).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    await settle(() => checker?.lastCheck() !== null);
    expect(checker?.lastCheck()).toMatchObject({ outcome: "updated" });
  });

  it("does not check at start when the last check was an hour ago", async () => {
    await writeState({ checkedAt: new Date(NOW.getTime() - HOUR_MS).toISOString() });
    fakeTimers();
    create({ fetch: await published() });
    await vi.advanceTimersByTimeAsync(60_000);
    await settle(() => false);
    // The state file is the one from an hour ago, untouched: no check ran.
    expect(checker?.lastCheck()?.remoteVersion).toBe(1);
    expect(reloads).toBe(0);
  });

  it("checks at start when the last check was more than a day ago, and again a day later", async () => {
    await writeState({ checkedAt: new Date(NOW.getTime() - 25 * HOUR_MS).toISOString() });
    const serve = await published();
    let manifests = 0;
    fakeTimers();
    create({
      intervalMs: 24 * HOUR_MS,
      fetch: (input, init) => {
        manifests += Number(String(input) === SOURCE.manifestUrl);
        return serve(input, init);
      },
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await settle(() => reloads === 1);
    expect(reloads).toBe(1);
    expect(manifests).toBe(1);
    await vi.advanceTimersByTimeAsync(24 * HOUR_MS);
    await settle(() => manifests === 2);
    // The second check finds the version it just downloaded, so there is nothing to reload.
    expect(manifests).toBe(2);
    expect(reloads).toBe(1);
  });

  it("runs no timer when the daily check is off, and still updates when asked", async () => {
    fakeTimers();
    const off = create({ enabled: false, fetch: await published() });
    await vi.advanceTimersByTimeAsync(48 * HOUR_MS);
    await settle(() => false);
    expect(reloads).toBe(0);
    expect(await readFile(paths.catalogCheck, "utf8").catch(() => null)).toBeNull();

    vi.useRealTimers();
    expect((await off.update()).outcome).toBe("updated");
    expect(reloads).toBe(1);
  });

  it("treats an unreadable state file as never having checked", async () => {
    await writeFile(paths.catalogCheck, "{not json", "utf8");
    const withBadState = create({ fetch: await published() });
    expect(withBadState.lastCheck()).toBeNull();
    expect(warnings).toEqual(["catalog check state unreadable"]);
  });

  it("unrefs its timers so a pending check never keeps a process running", async () => {
    // setTimeout and setInterval share one Timeout prototype in Node; spying there catches both.
    const probe = setTimeout(() => undefined, 0);
    clearTimeout(probe);
    const unref = vi.spyOn(Object.getPrototypeOf(probe) as { unref(): void }, "unref");
    create({ fetch: await published(), startDelayMs: 100_000, intervalMs: 100_000 });
    expect(unref).toHaveBeenCalled();
    unref.mockRestore();
  });
});
