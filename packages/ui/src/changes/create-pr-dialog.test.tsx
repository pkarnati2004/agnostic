// @vitest-environment happy-dom
import type { ChangesResponse, CreatePrRequest, CreatePrResponse } from "@agnostic/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import type { TaskNotice } from "../store/task-notices";
import { render } from "../test/render";
import { changesResponse, taskRow } from "./changes-fixture";
import { CreatePrDialog } from "./create-pr-dialog";

const TASK = taskRow();

const RESPONSE: CreatePrResponse = {
  task: TASK,
  url: "https://github.com/agn/petal/pull/12",
  body: "## Spec\n\nAdd the invite links.",
  via: "gh",
  pushed: true,
  base: "main",
  branch: TASK.branch ?? "",
};

const REFUSED: TaskNotice = {
  action: "pr",
  host: "dialog",
  error: new ApiError("git refused to push agn/invite-links-a1b2: rejected", {
    code: "push-rejected",
    hint: "Bring the branch up to date first.",
    status: 409,
  }),
  at: 1000,
};

const REFUSED_WITH_COMMAND: TaskNotice = {
  action: "pr",
  host: "dialog",
  error: new ApiError("git refused to push agn/invite-links-a1b2: rejected", {
    code: "push-rejected",
    hint: "Bring the branch up to date first (`agn update t1`), then try again.",
    status: 409,
  }),
  at: 1000,
};

type Tab = { closed: number; href: string };

function stubWindowOpen(): Tab {
  const tab: Tab = { closed: 0, href: "" };
  const fake = {
    location: {
      set href(value: string) {
        tab.href = value;
      },
    },
    close: () => {
      tab.closed += 1;
    },
  };
  vi.stubGlobal("open", () => fake);
  return tab;
}

function stubClipboard(writes: string[], refuse = false): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        writes.push(text);
        return refuse ? Promise.reject(new Error("denied")) : Promise.resolve();
      },
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (one) => one.textContent === label,
  );
  if (found === undefined) {
    throw new Error(`no "${label}" button`);
  }
  return found;
}

function title(): HTMLInputElement {
  return document.getElementById("pr-title") as HTMLInputElement;
}

/** React's controlled-input setter, bypassed so the `input` event carries a real value change. */
function type(value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(title(), value);
    title().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function open(
  onSubmit: (body: CreatePrRequest) => Promise<CreatePrResponse | null>,
  changes: ChangesResponse = changesResponse(),
  notice: TaskNotice | null = null,
) {
  const rendered = render(
    <CreatePrDialog
      task={TASK}
      changes={changes}
      notice={notice}
      disabled={false}
      onSubmit={onSubmit}
    />,
  );
  act(() => button("Create PR").click());
  return rendered;
}

describe("CreatePrDialog", () => {
  it("shows the remote, the branch, the base and the task's title", () => {
    const { unmount } = open(() => Promise.resolve(null));
    const text = document.body.textContent ?? "";
    expect(text).toContain("git@github.com:agn/petal.git");
    expect(text).toContain("agn/invite-links-a1b2");
    expect(text).toContain("main");
    expect(title().value).toBe(TASK.title);
    unmount();
  });

  it("says what stays behind and what the branch is behind by", () => {
    const { unmount } = open(
      () => Promise.resolve(null),
      changesResponse({ uncommitted: 2, behind: 4 }),
    );
    expect(document.body.textContent).toContain(
      "2 uncommitted changes stay in the worktree; only commits are pushed.",
    );
    expect(document.body.textContent).toContain("The branch is behind main by 4 commits.");
    unmount();
  });

  it("leaves those lines out when there is nothing to say", () => {
    const { unmount } = open(
      () => Promise.resolve(null),
      changesResponse({ uncommitted: 0, behind: 0 }),
    );
    expect(document.body.textContent).not.toContain("uncommitted changes stay");
    expect(document.body.textContent).not.toContain("is behind");
    unmount();
  });

  it("refuses to submit an empty title, and sends the edited one", async () => {
    const asked: CreatePrRequest[] = [];
    stubWindowOpen();
    stubClipboard([]);
    const { unmount } = open((body) => {
      asked.push(body);
      return Promise.resolve(RESPONSE);
    });
    type("");
    expect(button("Push and create PR").disabled).toBe(true);
    type("Ship the invite links");
    await act(async () => button("Push and create PR").click());
    expect(asked).toEqual([{ title: "Ship the invite links" }]);
    unmount();
  });

  it("waits on the daemon with the button disabled", async () => {
    stubWindowOpen();
    stubClipboard([]);
    let answer: (response: CreatePrResponse) => void = () => undefined;
    const { unmount } = open(
      () =>
        new Promise<CreatePrResponse>((resolve) => {
          answer = resolve;
        }),
    );
    act(() => button("Push and create PR").click());
    expect(button("Push and create PR").disabled).toBe(true);
    await act(async () => answer(RESPONSE));
    unmount();
  });

  it("points the tab it opened at the PR, copies the description and shows both", async () => {
    const tab = stubWindowOpen();
    const writes: string[] = [];
    stubClipboard(writes);
    const { unmount } = open(() => Promise.resolve(RESPONSE));
    await act(async () => button("Push and create PR").click());
    expect(tab.href).toBe(RESPONSE.url);
    expect(writes).toEqual([RESPONSE.body]);
    expect(document.body.textContent).toContain("Pull request opened.");
    expect(document.body.textContent).toContain("Description copied to the clipboard.");
    expect(document.querySelector("a")?.getAttribute("href")).toBe(RESPONSE.url);
    unmount();
  });

  it("says to copy the description when the browser refused the clipboard", async () => {
    stubWindowOpen();
    stubClipboard([], true);
    const { unmount } = open(() => Promise.resolve(RESPONSE));
    await act(async () => button("Push and create PR").click());
    expect(document.body.textContent).toContain("Copy the description below.");
    expect(document.querySelector("pre")?.textContent).toBe(RESPONSE.body);
    unmount();
  });

  it("stays open with the daemon's answer, and closes the tab it opened", async () => {
    const tab = stubWindowOpen();
    const { unmount } = open(() => Promise.resolve(null), changesResponse(), REFUSED);
    await act(async () => button("Push and create PR").click());
    expect(tab.closed).toBe(1);
    expect(tab.href).toBe("");
    expect(document.body.textContent).toContain("Create PR failed for Add the invite links");
    expect(document.body.textContent).toContain("Bring the branch up to date first.");
    expect(button("Push and create PR").disabled).toBe(false);
    unmount();
  });

  it("shows the command in a 409's hint as code, and keeps the dialog open", async () => {
    const tab = stubWindowOpen();
    const { unmount } = open(() => Promise.resolve(null), changesResponse(), REFUSED_WITH_COMMAND);
    await act(async () => button("Push and create PR").click());
    expect(tab.closed).toBe(1);
    expect([...document.querySelectorAll("code")].map((el) => el.textContent)).toEqual([
      "agn update t1",
    ]);
    // The fields are still there to resubmit from, not the success view.
    expect(title()).not.toBeNull();
    unmount();
  });
});
