import { describe, expect, it } from "vitest";
import { TERMINAL_FONTS } from "../settings/terminal-options";
// The faces themselves, as source: this asks what the @font-face rules point at.
import FONTS from "./fonts.css?raw";

// Every stylesheet the page ships, not only fonts.css: a remote request from any one of them would
// break the "nothing is fetched" promise the bundled families make (DECISIONS, 2026-10-06).
const SHEETS = import.meta.glob<string>("./**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** What a bundled face points at: a path under ./fonts/, no host, no scheme, no inlined bytes. */
const BUNDLED = /^"\.\/fonts\/[a-z0-9-]+\/[A-Za-z0-9.-]+\.woff2"$/;

/** Named in a stack or in the select and deliberately not bundled: macOS or Windows ships these. */
const SYSTEM_FAMILIES = ["SF Mono", "Menlo", "Segoe UI", "Consolas"];

describe("packages/ui/src/styles/*.css", () => {
  it("fetches no font from Google or any other host", () => {
    for (const [sheet, css] of Object.entries(SHEETS)) {
      expect(text(sheet, css), sheet).not.toContain("fonts.googleapis");
    }
  });

  it("imports no stylesheet over the network", () => {
    for (const [sheet, css] of Object.entries(SHEETS)) {
      expect(text(sheet, css), sheet).not.toMatch(/@import\s+url\(/);
    }
  });

  it("points every url() at a woff2 beside this sheet, by relative path", () => {
    for (const [sheet, css] of Object.entries(SHEETS)) {
      for (const target of targets(text(sheet, css))) {
        expect(target, `${sheet} ${target}`).toMatch(BUNDLED);
      }
    }
  });

  it("reaches no face over http and inlines none as a data URI", () => {
    for (const [sheet, css] of Object.entries(SHEETS)) {
      for (const target of targets(text(sheet, css))) {
        expect(target, `${sheet} ${target}`).not.toMatch(/^"?(?:https?:|\/\/|data:)/i);
      }
    }
  });

  // Guards the two checks above: with no url() found they would both pass on an empty page.
  it("declares a face for every family the select and the theme stacks name", () => {
    const declared = quoted(FONTS, /font-family:\s*"([^"]+)"/g);
    const asked = [...TERMINAL_FONTS, ...stackFamilies()].filter(
      (family) => !SYSTEM_FAMILIES.includes(family),
    );
    expect(asked.length).toBeGreaterThan(0);
    for (const family of asked) {
      expect(declared, family).toContain(family);
    }
  });

  // Guards the guard: a glob that matched nothing would make the checks above vacuous.
  it("finds the stylesheets the page ships", () => {
    expect(Object.keys(SHEETS).sort()).toEqual([
      "./fonts.css",
      "./index.css",
      "./themes/carbon.css",
      "./themes/claudette.css",
      "./themes/dusk.css",
      "./themes/ink.css",
      "./themes/moss.css",
      "./themes/paper.css",
      "./themes/rosewood.css",
      "./themes/slate.css",
      "./tokens.css",
      "./type.css",
    ]);
  });
});

/** Every `url()` target in one sheet, quotes kept: the quotes are part of what the path may be. */
function targets(css: string): string[] {
  return [...css.matchAll(/url\(([^)]*)\)/g)].map(([, target]) => (target ?? "").trim());
}

/** Every family a `--font-stack-sans` or `--font-stack-mono` names, base stack and themes alike. */
function stackFamilies(): string[] {
  const names: string[] = [];
  for (const [sheet, css] of Object.entries(SHEETS)) {
    for (const [, stack] of text(sheet, css).matchAll(/--font-stack-(?:sans|mono):([^;]*);/g)) {
      names.push(...quoted(stack ?? "", /"([^"]+)"/g));
    }
  }
  return names;
}

function quoted(css: string, pattern: RegExp): string[] {
  return [...css.matchAll(pattern)].flatMap(([, name]) => (name === undefined ? [] : [name]));
}

/** `?raw` hands back the file's own text; anything else means the sheet was not read as source. */
function text(sheet: string, css: unknown): string {
  if (typeof css !== "string") {
    throw new Error(`${sheet} did not import as text`);
  }
  return css;
}
