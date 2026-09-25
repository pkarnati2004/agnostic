// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ApiError } from "./api/error";
import { Notice } from "./notice";
import { render } from "./test/render";

const BOOTSTRAP = new ApiError("the agn daemon is not answering on this page", {
  code: "daemon-unreachable",
  hint: "Run `agn daemon start`.",
  status: null,
});

describe("Notice", () => {
  it("renders the bootstrap failure the page could not start from", () => {
    const { container, unmount } = render(<Notice error={BOOTSTRAP} />);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("the agn daemon is not answering on this page");
    expect(container.textContent).toContain("Run agn daemon start.");
    unmount();
  });

  it("renders nothing once there is no bootstrap error to show", () => {
    const { container, unmount } = render(<Notice error={null} />);
    expect(container.textContent).toBe("");
    unmount();
  });

  // The line stays until the page loads: the banner's Retry is what takes it away, so there is no
  // Dismiss to leave the page saying nothing about a daemon it cannot reach.
  it("offers nothing to dismiss", () => {
    const { container, unmount } = render(<Notice error={BOOTSTRAP} />);
    expect(container.querySelector("button")).toBeNull();
    unmount();
  });
});
