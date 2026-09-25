// @vitest-environment happy-dom
import type { TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { find, render } from "../test/render";
import { StatusGlyph } from "./status-glyph";

function glyph(status: TaskStatus, cleaned = false) {
  const drawn = render(<StatusGlyph status={status} cleaned={cleaned} />);
  return { ...drawn, span: find<HTMLElement>(drawn.container, "span") };
}

describe("StatusGlyph", () => {
  it("draws one shape per status", () => {
    const shapes: [TaskStatus, string][] = [
      ["waiting", "halo"],
      ["running", "filled"],
      ["queued", "spinner"],
      ["done", "ring"],
      ["failed", "filled"],
      ["stopped", "square"],
    ];
    for (const [status, shape] of shapes) {
      const { span, unmount } = glyph(status);
      expect(span.dataset.status).toBe(status);
      expect(span.dataset.shape).toBe(shape);
      unmount();
    }
  });

  it("draws a cleaned worktree as the dashed ring whatever the status", () => {
    const { span, unmount } = glyph("failed", true);
    expect(span.dataset.shape).toBe("cleaned");
    expect(span.style.border).toContain("dashed");
    unmount();
  });

  it("spins the queued ring, and stops for a machine that asks for less motion", () => {
    const { span, unmount } = glyph("queued");
    expect(span.className).toContain("glyph-spin");
    expect(span.className).toContain("motion-reduce:animate-none");
    unmount();
  });

  it("gives the spin to queued alone: the page's one animation draws for one status", () => {
    const statuses: TaskStatus[] = ["waiting", "running", "done", "failed", "stopped"];
    for (const status of statuses) {
      const { span, unmount } = glyph(status);
      expect(span.className, status).not.toContain("glyph-spin");
      unmount();
    }
  });

  it("takes its colour from the status token and nothing else", () => {
    const { span, unmount } = glyph("running");
    expect(span.style.backgroundColor).toBe("var(--status-running)");
    unmount();
  });

  it("says nothing to a screen reader: the row around it carries the word", () => {
    const { span, unmount } = glyph("done");
    expect(span.getAttribute("aria-hidden")).toBe("true");
    unmount();
  });
});
