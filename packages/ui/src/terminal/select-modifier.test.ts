import { afterEach, describe, expect, it, vi } from "vitest";
import { selectModifier } from "./select-modifier";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selectModifier", () => {
  it("names Option on macOS, where xterm.js gives that modifier to selection", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(selectModifier()).toBe("Option");
  });

  it("names Shift everywhere else", () => {
    vi.stubGlobal("navigator", { platform: "Linux x86_64" });
    expect(selectModifier()).toBe("Shift");
  });
});
