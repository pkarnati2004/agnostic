// @vitest-environment happy-dom
import type { TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { find, render } from "../test/render";
import { StatusPill } from "./status-pill";

describe("StatusPill", () => {
  it("writes the design's word for every status", () => {
    const words: [TaskStatus, string][] = [
      ["waiting", "Waiting for you"],
      ["running", "Running"],
      ["queued", "Running tests"],
      ["done", "Done"],
      ["failed", "Failed"],
      ["stopped", "Stopped"],
    ];
    for (const [status, word] of words) {
      const { container, unmount } = render(<StatusPill status={status} />);
      expect(container.textContent, status).toBe(word);
      unmount();
    }
  });

  it("adds the caller's detail after the status word", () => {
    const { container, unmount } = render(<StatusPill status="waiting" detail="4m" />);
    expect(container.textContent).toBe("Waiting for you · 4m");
    unmount();
  });

  it("is the word alone when there is nothing to add", () => {
    const { container, unmount } = render(<StatusPill status="done" />);
    expect(container.textContent).toBe("Done");
    unmount();
  });

  it("weights and tints the one status that wants an answer", () => {
    const { container, unmount } = render(<StatusPill status="waiting" />);
    const pill = find<HTMLElement>(container, "span");
    expect(pill.className).toContain("font-medium");
    expect(pill.getAttribute("style")).toContain("--status-waiting");
    unmount();
  });

  it("leaves a settled task neutral", () => {
    const { container, unmount } = render(<StatusPill status="stopped" />);
    const pill = find<HTMLElement>(container, "span");
    expect(pill.className).toContain("text-muted-foreground");
    expect(pill.style.backgroundColor).toBe("var(--muted)");
    unmount();
  });
});
