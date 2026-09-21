// @vitest-environment happy-dom
// The Write spec story lives in new-task-dialog-spec.test.tsx, split out to stay under the line cap.
import type { RecommendRequest } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  dialog,
  PROFILE,
  pickProfile,
  runButton,
  setValue,
  stubClient,
} from "./new-task-dialog-fixture";

describe("NewTaskDialog", () => {
  it("enables Run only once there is a prompt and a profile", () => {
    const { unmount } = dialog(stubClient());
    expect(runButton().disabled).toBe(true);

    const textarea = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
    act(() => setValue(textarea, "add a retry budget"));
    expect(runButton().disabled).toBe(true);

    pickProfile();
    expect(runButton().disabled).toBe(false);
    unmount();
  });

  it("asks for the pick as a dry run, so a pause in the typing records no recommendation", () => {
    vi.useFakeTimers();
    const asked: RecommendRequest[] = [];
    const { unmount } = dialog(
      stubClient({
        recommend: (body) => {
          asked.push(body);
          return new Promise(() => undefined);
        },
      }),
    );
    const textarea = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
    act(() => setValue(textarea, "add a retry budget"));
    // The card asks once the typing stops; the debounce is what "stopped" means.
    act(() => void vi.advanceTimersByTime(500));

    expect(asked).toEqual([{ repoId: "r1", prompt: "add a retry budget", dryRun: true }]);
    unmount();
    vi.useRealTimers();
  });

  it("runs on Cmd/Ctrl+Enter and leaves a plain Enter alone", () => {
    const calls: { repoId: string; body: unknown }[] = [];
    const { unmount } = dialog(
      stubClient({
        runTask: (repoId, body) => {
          calls.push({ repoId, body });
          return new Promise(() => undefined);
        },
      }),
    );
    const textarea = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
    act(() => setValue(textarea, "add a retry budget"));
    pickProfile();

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(calls).toHaveLength(0);

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(calls).toEqual([
      { repoId: "r1", body: { prompt: "add a retry budget", profile: PROFILE.id } },
    ]);
    unmount();
  });
});
