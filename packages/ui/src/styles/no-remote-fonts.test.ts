import { describe, expect, it } from "vitest";

// Every stylesheet the page ships, not only tokens.css: a remote request from any one of them would
// break the "no request leaves the page" promise the mono-stack pick makes (handoff pick 2).
const SHEETS = import.meta.glob<string>("./**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

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

  // Guards the guard: a glob that matched nothing would make the checks above vacuous.
  it("finds the stylesheets the page ships", () => {
    expect(Object.keys(SHEETS).sort()).toEqual([
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

/** `?raw` hands back the file's own text; anything else means the sheet was not read as source. */
function text(sheet: string, css: unknown): string {
  if (typeof css !== "string") {
    throw new Error(`${sheet} did not import as text`);
  }
  return css;
}
