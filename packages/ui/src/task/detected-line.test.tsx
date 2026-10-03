// @vitest-environment happy-dom
import type { Profile } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { PROFILE } from "../test/workspace-fixture";
import { DetectedLine } from "./detected-line";

const CODEX: Profile = {
  ...PROFILE,
  id: "codex:gpt-5.6:native",
  harness: "codex",
  model: "gpt-5.6",
};

function marks(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("[role='img']")).map((mark) =>
    mark.getAttribute("aria-label"),
  );
}

describe("DetectedLine", () => {
  it("draws one mark per available harness, in the order the profiles came in", () => {
    const { container, unmount } = render(<DetectedLine profiles={[PROFILE, CODEX]} />);

    expect(container.textContent).toContain("Detected");
    expect(marks(container)).toEqual(["claude-code", "codex"]);
    unmount();
  });

  it("marks a harness once however many models it has", () => {
    const second = { ...PROFILE, id: "claude-code:sonnet:native", model: "sonnet" };
    const { container, unmount } = render(<DetectedLine profiles={[PROFILE, second]} />);

    expect(marks(container)).toEqual(["claude-code"]);
    unmount();
  });

  it("leaves out what this machine cannot run, and draws nothing at all when none can", () => {
    const { container, unmount } = render(
      <DetectedLine profiles={[{ ...CODEX, available: false }]} />,
    );

    expect(container.textContent).toBe("");
    unmount();
  });
});
