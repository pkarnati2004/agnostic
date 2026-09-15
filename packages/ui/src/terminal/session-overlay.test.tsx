// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { click, find, render } from "../test/render";
import { SessionOverlay } from "./session-overlay";

const never = () => new Promise<void>(() => undefined);

describe("SessionOverlay", () => {
  it("offers a resume when the session has ended", () => {
    const { container, unmount } = render(
      <SessionOverlay phase="ended" notice={null} onResume={never} />,
    );
    expect(container.textContent).toContain("Session ended.");
    expect(find(container, "button").textContent).toBe("Resume");
    unmount();
  });

  it("asks once and waits", () => {
    const onResume = vi.fn(never);
    const { container, unmount } = render(
      <SessionOverlay phase="ended" notice={null} onResume={onResume} />,
    );
    const button = find<HTMLButtonElement>(container, "button");
    click(button);
    click(button);
    expect(onResume).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    unmount();
  });

  it("shows what the close said while it reconnects", () => {
    const { container, unmount } = render(
      <SessionOverlay phase="reconnecting" notice="The daemon is restarting." onResume={never} />,
    );
    expect(container.textContent).toContain("Reconnecting…");
    expect(container.textContent).toContain("The daemon is restarting.");
    expect(container.querySelector("button")).toBeNull();
    unmount();
  });

  it("says when a session cannot be attached to at all", () => {
    const { container, unmount } = render(
      <SessionOverlay phase="unattachable" notice={null} onResume={never} />,
    );
    expect(container.textContent).toContain("agn can watch it but not attach");
    unmount();
  });

  it("says a queued task has not started yet", () => {
    const { container, unmount } = render(
      <SessionOverlay phase="starting" notice={null} onResume={never} />,
    );
    expect(container.textContent).toContain("Starting…");
    unmount();
  });
});
