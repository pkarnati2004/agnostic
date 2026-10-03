import { describe, expect, it } from "vitest";
import { xtermTheme } from "./terminal-theme";

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
