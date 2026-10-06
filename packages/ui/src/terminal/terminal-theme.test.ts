import { describe, expect, it } from "vitest";
import { MONO_STACK, xtermFont, xtermTheme } from "./terminal-theme";

const TOKENS: Record<string, string> = {
  "--terminal": " #121010 ",
  "--foreground": "#e8e4df",
  "--ring": "#7fa3cf",
};

describe("xtermTheme", () => {
  it("takes the pane's colours from the page's tokens", () => {
    expect(xtermTheme((token) => TOKENS[token] ?? "")).toEqual({
      background: "#121010",
      foreground: "#e8e4df",
      cursor: "#e8e4df",
      cursorAccent: "#121010",
      selectionBackground: "#7fa3cf66",
    });
  });

  it("passes a colour that takes no alpha byte through untouched", () => {
    const theme = xtermTheme((token) => (token === "--ring" ? "oklch(0.5 0 0)" : "#000000"));
    expect(theme.selectionBackground).toBe("oklch(0.5 0 0)");
  });
});

describe("xtermFont", () => {
  it("puts the user's family in front of the page's own stack", () => {
    const font = xtermFont((token) => (token === "--terminal-font" ? " IBM Plex Mono " : "15px"));
    expect(font).toEqual({ fontFamily: `"IBM Plex Mono", ${MONO_STACK}`, fontSize: 15 });
  });

  it("is the page's stack at 13 px when the root says nothing", () => {
    expect(xtermFont(() => "")).toEqual({ fontFamily: MONO_STACK, fontSize: 13 });
  });

  it("drops the quotes a computed style may put round a family name", () => {
    const font = xtermFont((token) => (token === "--terminal-font" ? '"DM Mono"' : ""));
    expect(font.fontFamily).toBe(`"DM Mono", ${MONO_STACK}`);
  });

  it("falls back for a size that is not a length the pane can draw at", () => {
    for (const size of ["", "none", "0px", "-2px"]) {
      expect(xtermFont((token) => (token === "--terminal-font-size" ? size : "")).fontSize).toBe(
        13,
      );
    }
  });
});
