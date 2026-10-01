import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Specifiers that would put Node, a parser, or the rest of the registry in the page's bundle. The
 * page reads harness names, marks and vendors and nothing else, so the subpath may reach for
 * nothing: `@agnostic/core`'s index pulls in `process.ts`, and the registry's own modules read the
 * disk. A type-only import is erased before the bundler sees it, so the walk checks value imports
 * and re-exports only.
 */
const FORBIDDEN = [/^@agnostic\/core$/, /^@agnostic\/catalog$/, /^node:/, /^zod$/, /^execa$/];

/** `export * from "./x.js"`, `import { a } from "b"`; group 1 is set for a type-only statement. */
const CLAUSE = /\b(?:import|export)\s+(type\s)?[^;]*?from\s+"([^"]+)"/g;

/** `import "./x.js"` and `import("execa")`: no clause, so CLAUSE never sees them. */
const BARE = [/\bimport\s+"([^"]+)"/g, /\bimport\s*\(\s*"([^"]+)"/g];

const SRC = new URL("./", import.meta.url);

describe("@agnostic/registry/browser", () => {
  it("imports nothing that needs Node, and no other package, at runtime", () => {
    const offenders: string[] = [];
    for (const [module, specifiers] of graph()) {
      const bad = specifiers.filter((s) => FORBIDDEN.some((pattern) => pattern.test(s)));
      offenders.push(...bad.map((s) => `${module} imports ${s}`));
    }

    expect(offenders).toEqual([]);
  });

  // Guards the guard: a regex that matched nothing would make the assertion above vacuous.
  it("walks every module the subpath re-exports", () => {
    expect([...graph().keys()].sort()).toEqual(["./browser.js", "./harness-identity.js"]);
  });
});

/** Every module the entry reaches by a value import or a re-export, with what each imports. */
function graph(): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  const queue = ["./browser.js"];
  while (queue.length > 0) {
    const module = queue.shift();
    if (module === undefined || sources.has(module)) {
      continue;
    }
    const specifiers = valueImports(
      readFileSync(new URL(module.replace(/\.js$/, ".ts"), SRC), "utf8"),
    );
    sources.set(module, specifiers);
    queue.push(...specifiers.filter((s) => s.startsWith("./")));
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
