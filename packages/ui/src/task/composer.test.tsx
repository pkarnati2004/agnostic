// @vitest-environment happy-dom
import { act, createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../test/render";
import { PROFILE, REPO, setValue } from "../test/workspace-fixture";
import { Composer, type ComposerProps } from "./composer";
import type { NewTaskForm } from "./new-task-request";
import type { RecommendationState } from "./use-recommendation";

const IDLE: RecommendationState = { status: "idle", recommendation: null, error: null };

const FORM: NewTaskForm = {
  repoId: REPO.id,
  prompt: "",
  intent: "automatic",
  profileId: null,
  title: "",
  spec: "",
  acceptance: "",
  ignoreBudget: false,
};

function composer(overrides: Partial<ComposerProps> = {}) {
  const props: ComposerProps = {
    form: FORM,
    onChange: vi.fn(),
    repos: [REPO],
    profiles: [PROFILE],
    budget: null,
    recommendation: IDLE,
    profileId: null,
    onPickProfile: vi.fn(),
    writeSpec: false,
    onWriteSpec: vi.fn(),
    canStart: true,
    busy: false,
    onStart: vi.fn(),
    onChooseRepo: vi.fn(),
    promptRef: createRef<HTMLTextAreaElement>(),
    active: true,
    ...overrides,
  };
  return { props, ...render(<Composer {...props} />) };
}

function prompt(): HTMLTextAreaElement {
  return document.getElementById("new-task-prompt") as HTMLTextAreaElement;
}

function startButton(): HTMLButtonElement {
  return document.querySelector('[aria-label="Start task"]') as HTMLButtonElement;
}

describe("Composer", () => {
  it("asks for a repo before a prompt when the machine has none", () => {
    const { props, container, unmount } = composer({ repos: [], form: { ...FORM, repoId: "" } });

    expect(prompt().disabled).toBe(true);
    const choose = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Choose a repo",
    );
    act(() => choose?.click());

    expect(props.onChooseRepo).toHaveBeenCalled();
    unmount();
  });

  it("reports the spec switch as a switch, and flips what the arrow will do", () => {
    const { props, container, unmount } = composer();
    const toggle = container.querySelector('[role="switch"]') as HTMLButtonElement;

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    act(() => toggle.click());

    expect(props.onWriteSpec).toHaveBeenCalledWith(true);
    unmount();
  });

  it("shows the switch as on when it is", () => {
    const { container, unmount } = composer({ writeSpec: true });
    const toggle = container.querySelector('[role="switch"]') as HTMLButtonElement;

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    unmount();
  });

  it("keeps the arrow out of reach until there is something to start", () => {
    const { unmount } = composer({ canStart: false });
    expect(startButton().disabled).toBe(true);
    unmount();

    const ready = composer();
    expect(startButton().disabled).toBe(false);
    ready.unmount();
  });

  it("starts on Cmd or Ctrl with Enter, and leaves a plain Enter to write a newline", () => {
    const { props, unmount } = composer();

    act(() => {
      prompt().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(props.onStart).not.toHaveBeenCalled();

    act(() => {
      prompt().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(props.onStart).toHaveBeenCalled();
    unmount();
  });

  it("hands every keystroke to the page that owns the form", () => {
    const { props, unmount } = composer();

    act(() => setValue(prompt(), "add a retry budget"));

    expect(props.onChange).toHaveBeenCalledWith({ ...FORM, prompt: "add a retry budget" });
    unmount();
  });

  it("says what the classifier read while the intent is left on auto", () => {
    const { container, unmount } = composer({
      recommendation: {
        status: "ready",
        error: null,
        recommendation: {
          recommended: { profileId: PROFILE.id, reason: "why", evidence: "some", sources: [] },
          alternative: null,
          worthTrying: null,
          riskNote: null,
          taskClass: {
            intent: "ui",
            scope: "small",
            risk: [],
            needsBrowser: false,
            automaticIntent: null,
          },
        },
      },
    });

    expect(container.textContent).toContain("Intent: auto (reads as ui)");
    unmount();
  });
});
