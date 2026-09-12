import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Catalog, type LoadedCatalog, readCatalogFile } from "@agnostic/catalog";
import type { Editor, HarnessId, HarnessReport, Profile } from "@agnostic/core";
import { harnessDefinition, type LocalServer } from "@agnostic/registry";
import type { CatalogStore } from "./catalog-store.js";
import type { Detection } from "./detection-cache.js";

// Not part of the package's exports: this is what a daemon test detects instead of a real machine.
export function fixtureProfile(model: string | null): Profile {
  return {
    id: `claude-code:${model ?? "default"}:native`,
    harness: "claude-code",
    model,
    route: "native",
    billing: "subscription",
    available: true,
    evidence: "binary",
    tier: 1,
  };
}

function fixtureReport(models: string[], harness: HarnessId): HarnessReport {
  const definition = harnessDefinition(harness);
  return {
    harness,
    name: definition.name,
    binary: definition.binary,
    path: `/opt/bin/${definition.binary}`,
    version: "2.0.0",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    models,
    modelSource: "probe",
    planVendor: harness === "claude-code" ? "claude" : null,
    plan:
      harness === "claude-code"
        ? { value: "max20", source: "detected", known: true, confirmed: true }
        : null,
  };
}

/** The file the fixture catalog is read from, which a test daemon reloads as its bundled copy. */
export function fixtureCatalogPath(): string {
  return fileURLToPath(new URL("../../../tests/fixtures/catalog/complete.json", import.meta.url));
}

/** The catalog every daemon test runs against, so nothing here depends on the shipped snapshot. */
export async function fixtureCatalog(): Promise<Catalog> {
  const file = fixtureCatalogPath();
  const catalog = await readCatalogFile(file);
  if (catalog === null) {
    throw new Error(`the fixture catalog is missing: ${file}`);
  }
  return catalog;
}

/** One catalog that never changes, for a test that wires `realDetect` up by hand. */
export function fixtureCatalogStore(catalog: Catalog): CatalogStore {
  const loaded: LoadedCatalog = {
    catalog,
    origin: "bundled",
    path: fixtureCatalogPath(),
    problems: [],
  };
  return { current: () => loaded, reload: () => Promise.resolve(loaded) };
}

export function fixtureDetection(
  models: string[] = ["sonnet-4.5"],
  harnesses: HarnessId[] = ["claude-code"],
): Detection {
  return {
    harnesses: harnesses.map((harness) => fixtureReport(models, harness)),
    profiles: [null, ...models].map(fixtureProfile),
    tools: [],
    servers: [],
    detectedAt: new Date().toISOString(),
    pathVar: "/opt/bin",
  };
}

/** What a launch test detects: the two fake harnesses on PATH, and Pi installed nowhere. */
export function launchDetection(binDir: string, servers: LocalServer[]): Detection {
  const installed = (harness: HarnessId, binary: string, path: string | null): HarnessReport => ({
    harness,
    name: binary,
    binary,
    path,
    version: path === null ? null : "1.0.0",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    models: [],
    modelSource: "none",
    planVendor: null,
    plan: null,
  });
  return {
    harnesses: [
      installed("claude-code", "claude", join(binDir, "claude")),
      installed("codex", "codex", join(binDir, "codex")),
      installed("pi", "pi", null),
    ],
    profiles: [fixtureProfile(null)],
    tools: [],
    servers,
    detectedAt: new Date().toISOString(),
    pathVar: binDir,
  };
}

/** One editor of each kind, so an open test can check both argv shapes without a real editor. */
export const fixtureEditors: Editor[] = [
  { id: "vscode", name: "Visual Studio Code", via: "path", path: "/opt/bin/code" },
  { id: "cursor", name: "Cursor", via: "app", path: "/Applications/Cursor.app" },
];
