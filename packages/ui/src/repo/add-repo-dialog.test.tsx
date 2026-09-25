// @vitest-environment happy-dom
import type { Repo } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { AddRepoDialog } from "./add-repo-dialog";

const REPO: Repo = {
  id: "r1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
};

const CLOSED: Repo = { ...REPO, status: "archived" };

function dialog(client: WorkspaceClient, onReopen = (_id: string) => Promise.resolve()) {
  const onOpenChange = vi.fn();
  const page = render(
    <AddRepoDialog open onOpenChange={onOpenChange} client={client} onReopen={onReopen} />,
  );
  return { ...page, onOpenChange };
}

function pathField(): HTMLInputElement {
  return document.getElementById("add-repo-path") as HTMLInputElement;
}

/** React's controlled-input setter, bypassed so the `input` event carries a real value change. */
function type(value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(pathField(), value);
    pathField().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll("button")).find(
    (found) => found.textContent === label,
  ) as HTMLButtonElement;
}

async function clickAdd(): Promise<void> {
  await act(async () => {
    button("Add").click();
  });
}

async function pressEnter(): Promise<void> {
  await act(async () => {
    pathField().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
  });
}

describe("AddRepoDialog", () => {
  it("draws its fields inside the dialog's body, between the header and the footer", () => {
    const { unmount } = dialog(stubClient());
    expect(document.querySelector("[data-slot='dialog-body']")).not.toBeNull();
    unmount();
  });

  it("takes the focus into the path field and disables Add until something is typed", () => {
    const { unmount } = dialog(stubClient());
    expect(document.activeElement).toBe(pathField());
    expect(button("Add").disabled).toBe(true);
    type("/Users/dev/petal");
    expect(button("Add").disabled).toBe(false);
    unmount();
  });

  it("closes as soon as the daemon says it added the repo, saying nothing else", async () => {
    const registerRepo = vi.fn(() => Promise.resolve({ repo: REPO, created: true }));
    const { onOpenChange, unmount } = dialog(stubClient({ registerRepo }));
    type("/Users/dev/petal");
    await clickAdd();
    expect(registerRepo).toHaveBeenCalledWith({ path: "/Users/dev/petal", gitInit: false });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.body.textContent).not.toContain("already registered");
    unmount();
  });

  it("sends the git init the box asks for", async () => {
    const registerRepo = vi.fn(() => Promise.resolve({ repo: REPO, created: true }));
    const { unmount } = dialog(stubClient({ registerRepo }));
    type("/Users/dev/petal");
    act(() => {
      (document.getElementById("add-repo-git-init") as HTMLInputElement).click();
    });
    await clickAdd();
    expect(registerRepo).toHaveBeenCalledWith({ path: "/Users/dev/petal", gitInit: true });
    unmount();
  });

  it("stays open and names the repo agn already had", async () => {
    const registerRepo = () => Promise.resolve({ repo: REPO, created: false });
    const { onOpenChange, unmount } = dialog(stubClient({ registerRepo }));
    type("/Users/dev/petal");
    await clickAdd();
    expect(document.body.textContent).toContain("petal is already registered.");
    expect(document.body.textContent).not.toContain("It is closed");
    expect(onOpenChange).not.toHaveBeenCalled();
    unmount();
  });

  it("offers Reopen for a repo that is registered and closed, and closes once it is back", async () => {
    const openRepo = vi.fn(() => Promise.resolve({ repo: REPO }));
    const client = stubClient({
      registerRepo: () => Promise.resolve({ repo: CLOSED, created: false }),
      openRepo,
    });
    const { onOpenChange, unmount } = dialog(client, (id) => client.openRepo(id).then());
    type("/Users/dev/petal");
    await clickAdd();
    expect(document.body.textContent).toContain("It is closed, so it is not in the list.");

    await act(async () => {
      button("Reopen").click();
    });
    expect(openRepo).toHaveBeenCalledWith("r1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    unmount();
  });

  it("shows the daemon's words when Reopen is refused, and stays open with Add ready again", async () => {
    const refusal = new ApiError("repo petal has a task that is still running", {
      code: "repo-busy",
      hint: "Run `agn stop task1` first.",
      status: 409,
    });
    const client = stubClient({
      registerRepo: () => Promise.resolve({ repo: CLOSED, created: false }),
    });
    const onReopen = vi.fn(() => Promise.reject(refusal));
    const { onOpenChange, unmount } = dialog(client, onReopen);
    type("/Users/dev/petal");
    await clickAdd();

    await act(async () => {
      button("Reopen").click();
    });
    expect(onReopen).toHaveBeenCalledWith("r1");
    expect(document.body.textContent).toContain("repo petal has a task that is still running");
    expect(document.body.textContent).toContain("Run agn stop task1 first.");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(button("Add").disabled).toBe(false);
    unmount();
  });

  it("shows the daemon's own words when the path is not there, with Add ready to try again", async () => {
    const registerRepo = () =>
      Promise.reject(
        new ApiError("/Users/dev/nope does not exist", {
          code: "path-not-found",
          hint: "Check the path and try again.",
          status: 400,
        }),
      );
    const { onOpenChange, unmount } = dialog(stubClient({ registerRepo }));
    type("/Users/dev/nope");
    await clickAdd();
    expect(document.body.textContent).toContain("/Users/dev/nope does not exist");
    expect(document.body.textContent).toContain("Check the path and try again.");
    expect(button("Add").disabled).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
    unmount();
  });

  it("answers a relative path itself, without asking the daemon", async () => {
    const registerRepo = vi.fn(() => Promise.resolve({ repo: REPO, created: true }));
    const { unmount } = dialog(stubClient({ registerRepo }));
    type("code/petal");
    await pressEnter();
    expect(registerRepo).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Type the full path to the folder, starting with /.",
    );
    unmount();
  });

  it("adds on Enter in the path field", async () => {
    const registerRepo = vi.fn(() => Promise.resolve({ repo: REPO, created: true }));
    const { unmount } = dialog(stubClient({ registerRepo }));
    type("/Users/dev/petal");
    await pressEnter();
    expect(registerRepo).toHaveBeenCalledTimes(1);
    unmount();
  });
});
