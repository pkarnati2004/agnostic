import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { harnesses } from "./harness-list.js";

const PACKAGES = fileURLToPath(new URL("../../", import.meta.url));

/** The ids a feature could be tempted to branch on: the rows agn integrates rather than launches. */
const IDS = harnesses.filter((row) => row.tier === 1).map((row) => row.id);

/**
 * Where naming a harness is the job rather than a branch in shared code. Every other file reads
 * the facts off `HarnessDefinition`, so a harness added next month gets the feature by filling its
 * row and its adapter (BUILD-GUIDE, "Harness-agnostic by construction").
 */
const ALLOWED: { why: string; matches: (path: string) => boolean }[] = [
  {
    why: "the registry rows themselves, and the one file that writes each harness's identity",
    matches: (path) => /registry\/src\/(harness-list[\w-]*|harness-identity)\.ts$/.test(path),
  },
  {
    why: "a harness's own module: the adapter that fills a standard interface for it",
    matches: (path) =>
      IDS.some((id) => path.includes(`/src/${id}/`) || basename(path) === `${id}.ts`),
  },
  {
    why: "a table keyed by harness, which is the interface others fill rather than a branch",
    matches: (path) =>
      [
        "registry/src/detect-login.ts",
        "registry/src/install-commands.ts",
        "registry/src/api-keys.ts",
        "registry/src/gateways.ts",
        "hooks/src/harness-hooks.ts",
        "usage/src/harness-transcripts.ts",
        "usage/src/statusline-parsers.ts",
      ].some((file) => path.endsWith(file)),
  },
  {
    why: "the hook families' own members, and `copilot` as the name of a JSON hook layout",
    matches: (path) =>
      path.endsWith("hooks/src/hooks-json-file.ts") ||
      path.endsWith("hooks/src/hooks-dir/install.ts"),
  },
  {
    why: "the ledger migration that rewrote stored `other:<id>` ids once (ADR 035)",
    matches: (path) => path.endsWith("ledger/src/migrations/005-harness-ids.ts"),
  },
  {
    why: "tests, fixtures and the preview daemon, which stand in for a machine with harnesses on it",
    matches: (path) =>
      /\.test\.tsx?$/.test(path) ||
      path.includes("fixture") ||
      /\/test-[\w-]+\.ts$/.test(path) ||
      basename(path) === "preview-daemon.ts",
  },
];

describe("harness id literals", () => {
  it("names a harness only where naming it is the job", () => {
    const offenders = sources()
      .filter((path) => !ALLOWED.some((entry) => entry.matches(path)))
      .flatMap((path) => literals(path));

    expect(offenders).toEqual([]);
  });

  // Guards the guard: a walk that found no sources, or no ids, would make the assertion vacuous.
  it("walks every package's sources and knows the tier-1 ids", () => {
    expect(sources().length).toBeGreaterThan(300);
    expect(IDS).toContain("claude-code");
    expect(IDS.length).toBeGreaterThan(10);
    expect(literals(join(PACKAGES, "registry/src/harness-identity.ts")).length).toBeGreaterThan(10);
  });
});

/** `file:line` for every quoted tier-1 id in the file; a backtick is left to comments and messages. */
function literals(path: string): string[] {
  const found: string[] = [];
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, index) => {
      const id = IDS.find(
        (candidate) => line.includes(`"${candidate}"`) || line.includes(`'${candidate}'`),
      );
      if (id !== undefined) {
        found.push(`${path.slice(PACKAGES.length)}:${index + 1}: ${id}`);
      }
    });
  return found;
}

function sources(root = PACKAGES): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...sources(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}
