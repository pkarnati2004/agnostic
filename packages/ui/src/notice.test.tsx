// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/error";
import { Notice } from "./notice";
import { click, find, render } from "./test/render";

const BOOTSTRAP = new ApiError("the agn daemon is not answering on this page", {
  code: "daemon-unreachable",
  hint: "Run `agn daemon start`.",
  status: null,
});

describe("Notice", () => {
  it("renders the bootstrap failure the page could not start from", () => {
    const { container, unmount } = render(<Notice error={BOOTSTRAP} onDismiss={vi.fn()} />);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("the agn daemon is not answering on this page");
    expect(container.textContent).toContain("Run agn daemon start.");
    unmount();
  });

  it("renders nothing once there is no bootstrap error to show", () => {
    const { container, unmount } = render(<Notice error={null} onDismiss={vi.fn()} />);
    expect(container.textContent).toBe("");
    unmount();
  });

  it("dismisses only what it was given: an action failure is never routed through here", () => {
    // app.tsx passes only the bootstrap error to this prop; every action failure travels through
    // `notices` and TaskNoticeLine instead, so this component has no way to receive one at all.
    const onDismiss = vi.fn();
    const { container, unmount } = render(<Notice error={BOOTSTRAP} onDismiss={onDismiss} />);
    click(find(container, "button"));
    expect(onDismiss).toHaveBeenCalledOnce();
    unmount();
  });
});
