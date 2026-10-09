// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { type AppearanceRoot, createAppearanceRoot, readMirror } from "./appearance-root";

/** A `MediaQueryList` the test drives: `matches` is set, and `fire` is the system changing. */
function stubMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => void listeners.delete(listener),
  };
  return {
    media: media as unknown as MediaQueryList,
    listeners,
    fire(next: boolean) {
      media.matches = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("html");
  localStorage.clear();
});

describe("apply", () => {
  it("names the theme and the scheme the mode asks for", () => {
    const appearance = createAppearanceRoot(root, stubMedia(false).media, localStorage);
    appearance.apply({ theme: "slate", mode: "dark" });
    expect(root.getAttribute("data-theme")).toBe("slate");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("light")).toBe(false);

    appearance.apply({ theme: "paper", mode: "light" });
    expect(root.getAttribute("data-theme")).toBe("paper");
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("resolves system against the media query, and follows it until the next apply", () => {
    const system = stubMedia(true);
    const appearance = createAppearanceRoot(root, system.media, localStorage);
    appearance.apply({ theme: "ink", mode: "system" });
    expect(root.classList.contains("dark")).toBe(true);

    system.fire(false);
    expect(root.classList.contains("light")).toBe(true);
    expect(root.getAttribute("data-theme")).toBe("ink");
  });

  it("stops following the system once the user names a mode, and on dispose", () => {
    const system = stubMedia(true);
    const appearance = createAppearanceRoot(root, system.media, localStorage);
    appearance.apply({ theme: "ink", mode: "system" });
    expect(system.listeners.size).toBe(1);

    appearance.apply({ theme: "ink", mode: "dark" });
    expect(system.listeners.size).toBe(0);
    system.fire(false);
    expect(root.classList.contains("dark")).toBe(true);

    appearance.apply({ theme: "ink", mode: "system" });
    appearance.dispose();
    expect(system.listeners.size).toBe(0);
  });

  it("writes the mirror the next load paints from", () => {
    const appearance = createAppearanceRoot(root, stubMedia(false).media, localStorage);
    appearance.apply({ theme: "moss", mode: "light" });
    expect(readMirror(localStorage)).toEqual({ theme: "moss", mode: "light" });
  });
});

describe("readMirror", () => {
  it("is the default when nothing was written, and when what was written is garbage", () => {
    expect(readMirror(localStorage)).toEqual({ theme: "rosewood", mode: "system" });

    for (const written of ["{", "null", '"slate"', '{"theme":"midnight","mode":"auto"}', "[]"]) {
      localStorage.setItem("agn.appearance", written);
      expect(readMirror(localStorage), written).toEqual({ theme: "rosewood", mode: "system" });
    }
  });

  it("keeps the half of a mirror that is still a value the page knows", () => {
    localStorage.setItem("agn.appearance", '{"theme":"dusk","mode":"auto"}');
    expect(readMirror(localStorage)).toEqual({ theme: "dusk", mode: "system" });
  });
});

describe("applyTerminal", () => {
  let appearance: AppearanceRoot;

  beforeEach(() => {
    appearance = createAppearanceRoot(root, stubMedia(false).media, localStorage);
  });

  it("sets the family and the size as custom properties on the root", () => {
    appearance.applyTerminal({ font: "IBM Plex Mono", size: 15 });
    expect(root.style.getPropertyValue("--terminal-font")).toBe("IBM Plex Mono");
    expect(root.style.getPropertyValue("--terminal-font-size")).toBe("15px");
  });

  it("removes the family for the page's own mono stack, and keeps the size", () => {
    appearance.applyTerminal({ font: "Menlo", size: 15 });
    appearance.applyTerminal({ font: null, size: 13 });
    expect(root.style.getPropertyValue("--terminal-font")).toBe("");
    expect(root.style.getPropertyValue("--terminal-font-size")).toBe("13px");
  });
});
