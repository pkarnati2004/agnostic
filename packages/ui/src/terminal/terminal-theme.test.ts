import { describe, expect, it } from "vitest";
import { xtermTheme } from "./terminal-theme";

const TOKENS: Record<string, string> = {
  "--background": " #0a0a0a ",
  "--foreground": "#fafafa",
  "--ring": "#737373",
};

describe("xtermTheme", () => {
  it("takes the pane's colours from the page's tokens", () => {
    expect(xtermTheme((token) => TOKENS[token] ?? "")).toEqual({
      background: "#0a0a0a",
      foreground: "#fafafa",
      cursor: "#fafafa",
      cursorAccent: "#0a0a0a",
      selectionBackground: "#73737366",
    });
  });

  it("passes a colour that takes no alpha byte through untouched", () => {
    const theme = xtermTheme((token) => (token === "--ring" ? "oklch(0.5 0 0)" : "#000000"));
    expect(theme.selectionBackground).toBe("oklch(0.5 0 0)");
  });
});
