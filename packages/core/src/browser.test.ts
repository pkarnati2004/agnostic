import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Specifiers that would put Node, or a dependency the page has no use for, in its bundle. A
 * type-only import is erased before the bundler sees it, so the walk below skips those and checks
 * value imports and re-exports only. zod is here because the page needs no parsing: it reads the
 * daemon's answers, and one schema import pulls the whole library into the index chunk.
 */
const FORBIDDEN = [/^node:/, /^execa$/, /^fs$/, /^path$/, /^zod$/, /process\.js$/];

/** `export * from "./x.js"`, `import { a } from "b"`; group 1 is set for a type-only statement. */
const CLAUSE = /\b(?:import|export)\s+(type\s)?[^;]*?from\s+"([^"]+)"/g;

/** `import "./x.js"` and `import("execa")`: no clause, so CLAUSE never sees them. */
const BARE = [/\bimport\s+"([^"]+)"/g, /\bimport\s*\(\s*"([^"]+)"/g];

const SRC = new URL("./", import.meta.url);

describe("@agnostic/core/browser", () => {
  it("imports nothing that needs Node, and no dependency, at runtime", () => {
    const offenders: string[] = [];
    for (const [module, specifiers] of graph()) {
      offenders.push(...forbiddenImports(specifiers).map((s) => `${module} imports ${s}`));
    }

    expect(offenders).toEqual([]);
  });

  // Guards the guard: a regex that matched nothing would make the assertion above vacuous.
  it("walks every module the subpath re-exports", () => {
    expect([...graph().keys()].sort()).toEqual([
      "./browser.js",
      "./error.js",
      "./profile-id.js",
      "./usage-format.js",
      "./usage.js",
    ]);
  });
});

describe("the import walk", () => {
  it("catches a side-effect import, a dynamic import and a nested relative one", () => {
    const root = mkdtempSync(join(tmpdir(), "agn-browser-walk-"));
    try {
      write(root, "entry.ts", 'export * from "./nested/inner.js";');
      write(root, "nested/inner.ts", INNER);
      write(root, "nested/deep.ts", "export const deep = 1;");

      const walked = graph(pathToFileURL(`${root}/`), "./entry.js");

      // `./deep.js` resolves under `nested/`, and the type-only `../plans.js` is never read.
      expect([...walked.keys()].sort()).toEqual([
        "./entry.js",
        "./nested/deep.js",
        "./nested/inner.js",
      ]);
      expect(forbiddenImports(walked.get("./nested/inner.js") ?? [])).toEqual(["node:fs", "execa"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const INNER = [
  'import "node:fs";',
  'import type { Plan } from "../plans.js";',
  'export * from "./deep.js";',
  "export function load(): Promise<unknown> {",
  '  return import("execa");',
  "}",
].join("\n");

/** Every module the entry reaches by a value import or a re-export, with what each imports. */
function graph(root = SRC, entry = "./browser.js"): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const module = queue.shift();
    if (module === undefined || sources.has(module)) {
      continue;
    }
    const specifiers = valueImports(readFileSync(new URL(asSource(module), root), "utf8"));
    sources.set(module, specifiers);
    for (const specifier of specifiers.filter(isRelative)) {
      queue.push(resolveFrom(module, specifier, root));
    }
  }
  return sources;
}

function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const [, type, specifier] of source.matchAll(CLAUSE)) {
    if (type === undefined && specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  for (const pattern of BARE) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

function forbiddenImports(specifiers: string[]): string[] {
  return specifiers.filter((s) => FORBIDDEN.some((pattern) => pattern.test(s)));
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/** A relative specifier is relative to the importing file, not to `root`. */
function resolveFrom(importer: string, specifier: string, root: URL): string {
  const target = new URL(specifier, new URL(importer, root));
  if (!target.href.startsWith(root.href)) {
    return target.href; // Outside `root`, so keep the full URL and let the read fail on a real path.
  }
  return `./${target.href.slice(root.href.length)}`;
}

function asSource(module: string): string {
  return module.replace(/\.js$/, ".ts");
}

function write(root: string, relative: string, source: string): void {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${source}\n`);
}
