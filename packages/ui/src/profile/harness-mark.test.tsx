// @vitest-environment happy-dom
import type { PlanVendor } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { find, render } from "../test/render";
import { HarnessMark, markLetter, VendorMark } from "./harness-mark";

describe("markLetter", () => {
  it("gives the drawn harnesses their own letter", () => {
    expect(markLetter("claude-code")).toBe("C");
    expect(markLetter("codex")).toBe("X");
    expect(markLetter("opencode")).toBe("O");
    expect(markLetter("pi")).toBe("π");
    expect(markLetter("gemini")).toBe("G");
  });

  it("takes two letters of the name for every other harness", () => {
    expect(markLetter("grok")).toBe("Gr");
    expect(markLetter("kimi")).toBe("Ki");
    expect(markLetter("cursor-agent")).toBe("Cu");
    expect(markLetter("droid")).toBe("Dr");
    expect(markLetter("copilot")).toBe("Co");
  });

  it("marks an unknown executable by its own name, not by the `other:` prefix", () => {
    expect(markLetter("other:ralph")).toBe("Ra");
  });
});

describe("HarnessMark", () => {
  it("names the harness for a screen reader and colours the box from its token", () => {
    const { container, unmount } = render(<HarnessMark harness="pi" size="card" />);
    const mark = find<HTMLElement>(container, "span");
    expect(mark.getAttribute("aria-label")).toBe("pi");
    expect(mark.style.backgroundColor).toBe("var(--mark-pi)");
    expect(mark.style.width).toBe("18px");
    unmount();
  });

  it("draws an unlisted harness on the neutral surface", () => {
    const { container, unmount } = render(<HarnessMark harness="droid" dim />);
    const mark = find<HTMLElement>(container, "span");
    expect(mark.className).toContain("bg-secondary");
    expect(mark.style.opacity).toBe("0.6");
    unmount();
  });
});

describe("VendorMark", () => {
  it("draws the harness the vendor's plan bills for", () => {
    const { container, unmount } = render(<VendorMark vendor="chatgpt" />);
    const mark = find<HTMLElement>(container, "span");
    expect(mark.textContent).toBe("X");
    expect(mark.getAttribute("aria-label")).toBe("codex");
    unmount();
  });

  it("says a plan with no vendor is unknown rather than guessing one", () => {
    const { container, unmount } = render(<VendorMark vendor={null} />);
    const mark = find<HTMLElement>(container, "span");
    expect(mark.textContent).toBe("?");
    expect(mark.getAttribute("aria-label")).toBe("no plan vendor");
    unmount();
  });

  it("maps every vendor to the harness its plan bills through, so one company reads as one mark", () => {
    const harnesses: [PlanVendor, string, string][] = [
      ["claude", "C", "claude-code"],
      ["chatgpt", "X", "codex"],
      ["google", "G", "gemini"],
      ["xai", "Gr", "grok"],
      ["moonshot", "Ki", "kimi"],
      ["cursor", "Cu", "cursor-agent"],
    ];
    for (const [vendor, letter, harness] of harnesses) {
      const { container, unmount } = render(<VendorMark vendor={vendor} />);
      const mark = find<HTMLElement>(container, "span");
      expect(mark.textContent, vendor).toBe(letter);
      expect(mark.getAttribute("aria-label"), vendor).toBe(harness);
      unmount();
    }
  });
});
