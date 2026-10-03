// @vitest-environment happy-dom
import type { EvidenceLevel } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { EvidenceBadge } from "./evidence-badge";

const LEVELS: EvidenceLevel[] = ["strong", "some", "model-level", "none"];

describe("EvidenceBadge", () => {
  it("says the level as a word, never as a figure", () => {
    for (const level of LEVELS) {
      const { container, unmount } = render(<EvidenceBadge level={level} />);
      expect(container.textContent).toBe(`Evidence: ${level}`);
      expect(container.textContent).not.toMatch(/\d/);
      unmount();
    }
  });

  it("draws each level differently, so the word is not the only difference", () => {
    const looks = LEVELS.map((level) => {
      const { container, unmount } = render(<EvidenceBadge level={level} />);
      const className = container.firstElementChild?.className ?? "";
      unmount();
      return className;
    });

    expect(new Set(looks).size).toBe(LEVELS.length);
  });
});
