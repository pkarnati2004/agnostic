// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { button, buttonWith, PROFILE, setValue } from "../test/workspace-fixture";
import { SpecStep, type SpecStepProps } from "./spec-step";

const DRAFT = { title: "Add a retry budget", spec: "Change the client.", acceptance: "it retries" };

function step(overrides: Partial<SpecStepProps> = {}) {
  const props: SpecStepProps = {
    prompt: "add a retry budget",
    draft: DRAFT,
    onChange: vi.fn(),
    writtenBy: PROFILE.id,
    busy: false,
    error: null,
    profile: PROFILE,
    onBack: vi.fn(),
    onRewrite: vi.fn(),
    onApprove: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<SpecStep {...props} />) };
}

describe("SpecStep", () => {
  it("draws what was written, and who wrote it", () => {
    const { container, unmount } = step();

    expect(container.textContent).toContain("add a retry budget");
    expect((document.getElementById("new-task-spec") as HTMLTextAreaElement).value).toBe(
      DRAFT.spec,
    );
    // The harness and the model, not the profile id the writer answered with.
    expect(container.textContent).toContain("Written by claude-code · opus");
    expect(container.textContent).not.toContain(PROFILE.id);
    unmount();
  });

  it("says the spec is yours to write when nothing has written one", () => {
    const { container, unmount } = step({ writtenBy: null });
    expect(container.textContent).toContain("Write the spec yourself.");
    unmount();
  });

  it("goes back to the prompt from either way out", () => {
    const { props, unmount } = step();

    act(() => button("Edit prompt").click());
    act(() => button("Back").click());

    expect(props.onBack).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("asks the model again, and starts the task, from the two buttons that say so", () => {
    const { props, unmount } = step();

    act(() => button("Rewrite").click());
    act(() => buttonWith("Approve and start").click());

    expect(props.onRewrite).toHaveBeenCalled();
    expect(props.onApprove).toHaveBeenCalled();
    unmount();
  });

  it("holds both buttons while the writer is working", () => {
    const { unmount } = step({ busy: true });

    expect(button("Writing…").disabled).toBe(true);
    expect(buttonWith("Approve and start").disabled).toBe(true);
    unmount();
  });

  it("hands an edit to either field back to the page", () => {
    const { props, unmount } = step();

    act(() =>
      setValue(document.getElementById("new-task-acceptance") as HTMLTextAreaElement, "one line"),
    );

    expect(props.onChange).toHaveBeenCalledWith({ ...DRAFT, acceptance: "one line" });
    unmount();
  });

  it("says why no spec was written without taking the step away", () => {
    const error = new ApiError("no subscription-billed agent can write specs on this machine", {
      code: "spec-writer-unavailable",
      hint: "Write the spec yourself.",
      status: 409,
    });
    const { container, unmount } = step({ error, writtenBy: null });

    expect(container.textContent).toContain("no subscription-billed agent can write specs");
    expect(buttonWith("Approve and start").disabled).toBe(false);
    unmount();
  });
});
