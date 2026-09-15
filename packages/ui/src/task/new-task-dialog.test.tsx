// @vitest-environment happy-dom
// The Write spec story lives in new-task-dialog-spec.test.tsx, split out to stay under the line cap.
import { act } from "react";
import { describe, expect, it } from "vitest";
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
