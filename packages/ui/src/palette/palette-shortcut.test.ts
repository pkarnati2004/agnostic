import { describe, expect, it } from "vitest";
import { isPaletteShortcut } from "./palette-shortcut";

function press(over: Partial<KeyboardEvent>): boolean {
  return isPaletteShortcut({
    key: "k",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  });
}

describe("isPaletteShortcut", () => {
  it("takes either modifier, so no platform is hard-coded", () => {
    expect(press({ metaKey: true })).toBe(true);
    expect(press({ ctrlKey: true })).toBe(true);
  });

  it("takes the upper-case key a modified press reports on some layouts", () => {
    expect(press({ key: "K", metaKey: true })).toBe(true);
  });

  it("leaves every other combination to the page", () => {
    expect(press({})).toBe(false);
    expect(press({ metaKey: true, shiftKey: true })).toBe(false);
    expect(press({ metaKey: true, altKey: true })).toBe(false);
    expect(press({ key: "j", metaKey: true })).toBe(false);
  });
});
