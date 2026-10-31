import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NATIVE_DEPENDENCIES,
  nativePins,
  OPTIONAL_EXTERNALS,
  publishedManifest,
  type WorkspaceManifest,
} from "./npm-manifest.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ledger = { name: "@agnostic/ledger", dependencies: { "better-sqlite3": "13.0.3", zod: "4" } };
const executor = { name: "@agnostic/executor-tmux", dependencies: { "node-pty": "1.2.0-beta.15" } };
const PINS = { "better-sqlite3": "13.0.3", "node-pty": "1.2.0-beta.15" };

function workspace(overrides: Partial<WorkspaceManifest> = {}): WorkspaceManifest {
  return {
    name: "agnostic-dev",
    version: "0.1.0",
    description: "d",
    license: "MIT",
    type: "module",
    bin: { agn: "./dist/main.js" },
    files: ["dist"],
    engines: { node: ">=22" },
    keywords: ["cli"],
    repository: { type: "git", url: "git+https://example.invalid/x.git" },
    homepage: "https://example.invalid",
    bugs: "https://example.invalid/issues",
    dependencies: { "@agnostic/core": "workspace:*" },
    devDependencies: { vitest: "4" },
    exports: { ".": "./dist/index.js" },
    private: true,
    scripts: { build: "tsc" },
    ...overrides,
  };
}

function packageManifests(): WorkspaceManifest[] {
  const packages = join(repoRoot, "packages");
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packages, entry.name, "package.json"))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, "utf8")) as WorkspaceManifest);
}

describe("nativePins", () => {
  it("reads one registry version for each native package from the real workspace", () => {
    const pins = nativePins(packageManifests());
    expect(Object.keys(pins).sort()).toEqual([...NATIVE_DEPENDENCIES].sort());
    for (const version of Object.values(pins)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it("accepts the same version declared by two packages", () => {
    const usage = { name: "@agnostic/usage", dependencies: { "better-sqlite3": "13.0.3" } };
    expect(nativePins([ledger, usage, executor])).toEqual(PINS);
  });

  it("ignores dependencies that are not native", () => {
    expect(Object.keys(nativePins([ledger, executor]))).toEqual([...NATIVE_DEPENDENCIES]);
  });

  it("throws on an empty workspace", () => {
    expect(() => nativePins([])).toThrow(/better-sqlite3/);
  });

  it("finds each native package in whichever manifest declares it", () => {
    expect(nativePins([ledger, executor, { name: "@agnostic/core" }])).toEqual(PINS);
  });

  it("names the package no manifest declares", () => {
    expect(() => nativePins([ledger])).toThrow(/node-pty/);
  });

  it("names both packages when two pin different versions", () => {
    const usage = { name: "@agnostic/usage", dependencies: { "better-sqlite3": "12.0.0" } };
    expect(() => nativePins([ledger, usage, executor])).toThrow(
      /@agnostic\/ledger.*@agnostic\/usage/,
    );
  });
});

describe("publishedManifest", () => {
  it("keeps every field npm reads and replaces dependencies with the pins", () => {
    const input = workspace();
    const published = publishedManifest(input, PINS);
    for (const field of [
      "name",
      "version",
      "description",
      "license",
      "type",
      "bin",
      "files",
      "engines",
      "keywords",
      "repository",
      "homepage",
      "bugs",
    ] as const) {
      expect(published[field]).toEqual(input[field]);
    }
    expect(published.dependencies).toEqual(PINS);
    for (const dropped of ["exports", "private", "scripts", "devDependencies"]) {
      expect(Object.keys(published)).not.toContain(dropped);
    }
  });

  it.each(["bin", "version", "license", "engines", "files"] as const)(
    "throws when %s is missing",
    (field) => {
      const { [field]: _missing, ...rest } = workspace();
      expect(() => publishedManifest(rest as WorkspaceManifest, PINS)).toThrow(field);
    },
  );

  it("throws when a pin is still a workspace range", () => {
    expect(() => publishedManifest(workspace(), { "node-pty": "workspace:*" })).toThrow(
      /workspace:/,
    );
  });

  it("leaves no workspace range in the manifest made from the real CLI package", () => {
    const cli = JSON.parse(
      readFileSync(join(repoRoot, "packages/cli/package.json"), "utf8"),
    ) as WorkspaceManifest;
    expect(JSON.stringify(publishedManifest(cli, PINS))).not.toContain("workspace:");
  });

  it("takes the version from the source manifest", () => {
    expect(publishedManifest(workspace({ version: "2.3.4" }), PINS).version).toBe("2.3.4");
  });

  it("declares only the native packages, whatever the source manifest depends on", () => {
    const published = publishedManifest(
      workspace({ dependencies: { "@agnostic/core": "workspace:*", hono: "4" } }),
      PINS,
    );
    expect(Object.keys(published.dependencies)).toEqual([...NATIVE_DEPENDENCIES]);
  });

  it("does not change the source manifest or share the pins object", () => {
    const input = workspace();
    const before = structuredClone(input);
    const pins = { ...PINS };
    const published = publishedManifest(input, pins);
    expect(input).toEqual(before);
    expect(published.dependencies).not.toBe(pins);
  });

  it("keeps the bundled optional externals out of the manifest", () => {
    const published = publishedManifest(workspace(), PINS);
    for (const name of OPTIONAL_EXTERNALS) {
      expect(published.dependencies).not.toHaveProperty(name);
    }
  });

  it("builds from the real CLI package with the real pins and no private fields", () => {
    const cli = JSON.parse(
      readFileSync(join(repoRoot, "packages/cli/package.json"), "utf8"),
    ) as WorkspaceManifest;
    const published = publishedManifest(cli, nativePins(packageManifests()));
    expect(published.version).toBe(cli.version);
    expect(published.bin).toEqual({ agn: "./dist/main.js" });
    expect(published).not.toHaveProperty("private");
    expect(Object.keys(published.dependencies)).toEqual([...NATIVE_DEPENDENCIES]);
  });
});
