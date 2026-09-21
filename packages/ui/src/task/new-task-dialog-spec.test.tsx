// @vitest-environment happy-dom
// The Write spec story for NewTaskDialog; shared fixtures and helpers live in new-task-dialog-fixture.tsx.
import { act } from "react";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import {
  button,
  dialog,
  PROFILE,
  pickProfile,
  runButton,
  setValue,
  stubClient,
} from "./new-task-dialog-fixture";

const SPEC = {
  title: "Add a retry budget",
  spec: "Change the client.\n\n### Notes",
  acceptance: "- [ ] the client retries",
  profileId: PROFILE.id,
  model: "opus",
};

/** Types the prompt, picks the profile, and presses Write spec; the answer arrives before it returns. */
async function writeSpec() {
  const textarea = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
  act(() => setValue(textarea, "add a retry budget"));
  pickProfile();
  await act(async () => {
    button("Write spec").click();
  });
}

describe("NewTaskDialog Write spec", () => {
  it("fills the fields from the spec it was written and runs with them", async () => {
    const asked: { repoId: string; body: unknown }[] = [];
    const runs: unknown[] = [];
    const { unmount } = dialog(
      stubClient({
        writeSpec: (repoId, body) => {
          asked.push({ repoId, body });
          return Promise.resolve(SPEC);
        },
        runTask: (_repoId, body) => {
          runs.push(body);
          return new Promise(() => undefined);
        },
      }),
    );
    await writeSpec();

    expect(asked).toEqual([{ repoId: "r1", body: { prompt: "add a retry budget" } }]);
    const title = document.getElementById("new-task-title") as HTMLInputElement;
    const spec = document.getElementById("new-task-spec") as HTMLTextAreaElement;
    const acceptance = document.getElementById("new-task-acceptance") as HTMLTextAreaElement;
    expect(title.value).toBe(SPEC.title);
    expect(spec.value).toBe(SPEC.spec);
    expect(acceptance.value).toBe(SPEC.acceptance);
    expect(document.body.textContent).toContain(`written by ${PROFILE.id}`);

    act(() => setValue(acceptance, ""));
    act(() => runButton().click());
    expect(runs).toEqual([
      {
        prompt: "add a retry budget",
        profile: PROFILE.id,
        title: SPEC.title,
        spec: SPEC.spec,
      },
    ]);
    unmount();
  });

  it("says why no spec was written and leaves the dialog usable", async () => {
    const { unmount } = dialog(
      stubClient({
        writeSpec: () =>
          Promise.reject(
            new ApiError("no subscription-billed agent can write specs on this machine", {
              code: "spec-writer-unavailable",
              hint: "Write the spec yourself in the dialog.",
              status: 409,
            }),
          ),
      }),
    );
    await writeSpec();

    expect(document.body.textContent).toContain("no subscription-billed agent can write specs");
    expect(document.body.textContent).toContain("Write the spec yourself in the dialog.");
    const spec = document.getElementById("new-task-spec") as HTMLTextAreaElement;
    expect(spec.value).toBe("");
    expect(runButton().disabled).toBe(false);
    unmount();
  });

  it("says why the agent that was asked did not answer and leaves the dialog usable", async () => {
    const { unmount } = dialog(
      stubClient({
        writeSpec: () =>
          Promise.reject(
            new ApiError("claude-code exited with code 3", {
              code: "spec-writer-failed",
              hint: "Write the spec yourself, or run `claude -p` in the repo to see why.",
              status: 502,
            }),
          ),
      }),
    );
    await writeSpec();

    expect(document.body.textContent).toContain("claude-code exited with code 3");
    expect(document.body.textContent).toContain("Write the spec yourself, or run claude -p");
    const spec = document.getElementById("new-task-spec") as HTMLTextAreaElement;
    expect(spec.value).toBe("");
    expect(runButton().disabled).toBe(false);
    unmount();
  });

  it("is busy while Write spec is in flight and usable again once it answers", async () => {
    let resolve!: (spec: typeof SPEC) => void;
    const pending = new Promise<typeof SPEC>((res) => {
      resolve = res;
    });
    const { unmount } = dialog(stubClient({ writeSpec: () => pending }));
    const textarea = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
    act(() => setValue(textarea, "add a retry budget"));
    pickProfile();

    act(() => button("Write spec").click());
    const busy = button("Writing…");
    expect(busy).toBeDefined();
    expect(busy.disabled).toBe(true);
    expect(runButton().disabled).toBe(false);

    await act(async () => {
      resolve(SPEC);
      await pending;
    });
    expect(button("Write spec").disabled).toBe(false);
    unmount();
  });

  it("shows empty fields with no attribution when the user writes it themselves", () => {
    const { unmount } = dialog(stubClient());
    expect(document.getElementById("new-task-title")).toBeNull();

    act(() => button("Write it yourself").click());

    const title = document.getElementById("new-task-title") as HTMLInputElement;
    const spec = document.getElementById("new-task-spec") as HTMLTextAreaElement;
    const acceptance = document.getElementById("new-task-acceptance") as HTMLTextAreaElement;
    expect(title.value).toBe("");
    expect(spec.value).toBe("");
    expect(acceptance.value).toBe("");
    expect(document.body.textContent).not.toContain("written by");
    unmount();
  });

  it("replaces the fields when Write spec is pressed a second time", async () => {
    const second = {
      title: "Add a flag",
      spec: "Change the CLI.",
      acceptance: "- [ ] the flag exists",
      profileId: "codex:gpt-5:native",
      model: "gpt-5",
    };
    let calls = 0;
    const { unmount } = dialog(
      stubClient({ writeSpec: () => Promise.resolve(calls++ === 0 ? SPEC : second) }),
    );
    await writeSpec();
    const title = document.getElementById("new-task-title") as HTMLInputElement;
    expect(title.value).toBe(SPEC.title);

    await act(async () => {
      button("Write spec").click();
    });

    expect(title.value).toBe("Add a flag");
    const spec = document.getElementById("new-task-spec") as HTMLTextAreaElement;
    const acceptance = document.getElementById("new-task-acceptance") as HTMLTextAreaElement;
    expect(spec.value).toBe("Change the CLI.");
    expect(acceptance.value).toBe("- [ ] the flag exists");
    expect(document.body.textContent).toContain("written by codex:gpt-5:native");
    unmount();
  });

  it("keeps a user's edit to the spec across a re-render the prompt causes", async () => {
    const { unmount } = dialog(stubClient({ writeSpec: () => Promise.resolve(SPEC) }));
    await writeSpec();
    const spec = document.getElementById("new-task-spec") as HTMLTextAreaElement;
    act(() => setValue(spec, "Change the client differently."));
    expect(spec.value).toBe("Change the client differently.");

    const prompt = document.getElementById("new-task-prompt") as HTMLTextAreaElement;
    act(() => setValue(prompt, "add a retry budget please"));

    expect(spec.value).toBe("Change the client differently.");
    unmount();
  });

  it("keeps Run enabled once a spec is filled in", async () => {
    const { unmount } = dialog(stubClient({ writeSpec: () => Promise.resolve(SPEC) }));
    await writeSpec();
    expect(runButton().disabled).toBe(false);
    unmount();
  });
});
