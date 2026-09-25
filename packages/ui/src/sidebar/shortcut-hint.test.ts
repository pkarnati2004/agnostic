import { describe, expect, it } from "vitest";
import { paletteHint } from "./shortcut-hint";

describe("paletteHint", () => {
  it("names the modifier the machine's own keyboard has", () => {
    expect(paletteHint("MacIntel")).toBe("⌘K");
    expect(paletteHint("Win32")).toBe("Ctrl K");
    expect(paletteHint("Linux x86_64")).toBe("Ctrl K");
  });
});
