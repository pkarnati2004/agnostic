import { describe, expect, it } from "vitest";
import { keyHint, paletteHint } from "./shortcut-hint";

describe("keyHint", () => {
  it("leaves the Mac glyphs alone", () => {
    expect(keyHint("MacIntel", "⌘⇧H")).toBe("⌘⇧H");
    expect(keyHint("MacIntel", "⌃⇥")).toBe("⌃⇥");
  });

  it("spells both control glyphs out off macOS", () => {
    expect(keyHint("Win32", "⌘⇧H")).toBe("Ctrl ⇧H");
    expect(keyHint("Linux x86_64", "⌘\\")).toBe("Ctrl \\");
    expect(keyHint("Win32", "⌃⇥")).toBe("Ctrl ⇥");
  });

  it("leaves a shortcut with no modifier as it is", () => {
    expect(keyHint("Win32", "⇧F10")).toBe("⇧F10");
    expect(keyHint("MacIntel", "⎋")).toBe("⎋");
  });
});

describe("paletteHint", () => {
  it("names the modifier the machine's own keyboard has", () => {
    expect(paletteHint("MacIntel")).toBe("⌘K");
    expect(paletteHint("Win32")).toBe("Ctrl K");
    expect(paletteHint("Linux x86_64")).toBe("Ctrl K");
  });
});
