// @vitest-environment happy-dom
import type { Repo } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import type { RepoActions } from "./use-repo-actions";
import { useRepoActions } from "./use-repo-actions";

const REPO: Repo = {
  id: "r1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
};

/** Exposes the hook's return value to the test on every render, so a caller can act on it directly. */
function Harness({
  client,
  onRender,
}: {
  client: WorkspaceClient;
  onRender: (actions: RepoActions) => void;
}) {
  onRender(useRepoActions(client));
  return null;
}

function harness(client: WorkspaceClient) {
  let latest: RepoActions | undefined;
  const page = render(<Harness client={client} onRender={(actions) => (latest = actions)} />);
  return {
    ...page,
    current: (): RepoActions => {
      if (latest === undefined) {
        throw new Error("hook never rendered");
      }
      return latest;
    },
  };
}

const BUSY = new ApiError("repo petal has a task that is still running", {
  code: "repo-busy",
  hint: "Run `agn stop task1` first.",
  status: 409,
});

describe("useRepoActions", () => {
  it("closes a repo with no notice recorded once the daemon agrees", async () => {
    const client = stubClient({ closeRepo: () => Promise.resolve({ repo: REPO }) });
    const { current, unmount } = harness(client);
    await act(async () => {
      await current().close("r1");
    });
    expect(current().notices).toEqual({});
    unmount();
  });

  it("records a close failure under the repo and rejects for the caller to see", async () => {
    const client = stubClient({ closeRepo: () => Promise.reject(BUSY) });
    const { current, unmount } = harness(client);
    await act(async () => {
      await expect(current().close("r1")).rejects.toBe(BUSY);
    });
    expect(current().notices.r1).toMatchObject({ action: "close", error: BUSY });
    unmount();
  });

  it("records a reopen failure with the reopen action, not close", async () => {
    const NOT_FOUND = new ApiError("no repo matches r1", { code: "not-found", status: 404 });
    const client = stubClient({ openRepo: () => Promise.reject(NOT_FOUND) });
    const { current, unmount } = harness(client);
    await act(async () => {
      await current()
        .reopen("r1")
        .catch(() => undefined);
    });
    expect(current().notices.r1).toMatchObject({ action: "reopen", error: NOT_FOUND });
    unmount();
  });

  it("removes a repo with no notice recorded once the daemon agrees", async () => {
    const removeRepo = vi.fn(() =>
      Promise.resolve({ repo: { ...REPO, status: "removed" as const }, worktreesRemoved: 2 }),
    );
    const client = stubClient({ removeRepo });
    const { current, unmount } = harness(client);
    await act(async () => {
      await current().remove("r1");
    });
    expect(removeRepo).toHaveBeenCalledWith("r1");
    expect(current().notices).toEqual({});
    unmount();
  });

  it("records a refused remove under the repo and rejects for the dialog to show", async () => {
    const client = stubClient({ removeRepo: () => Promise.reject(BUSY) });
    const { current, unmount } = harness(client);
    await act(async () => {
      await expect(current().remove("r1")).rejects.toBe(BUSY);
    });
    expect(current().notices.r1).toMatchObject({ action: "remove", error: BUSY });
    unmount();
  });

  it("keeps two repos closed at once as two separate notices", async () => {
    const other = new ApiError("repo katha has a task that is still running", {
      code: "repo-busy",
      status: 409,
    });
    const client = stubClient({
      closeRepo: (id) => Promise.reject(id === "r1" ? BUSY : other),
    });
    const { current, unmount } = harness(client);
    await act(async () => {
      await current()
        .close("r1")
        .catch(() => undefined);
    });
    await act(async () => {
      await current()
        .close("r2")
        .catch(() => undefined);
    });
    expect(Object.keys(current().notices).sort()).toEqual(["r1", "r2"]);
    expect(current().notices.r1?.error).toBe(BUSY);
    expect(current().notices.r2?.error).toBe(other);
    unmount();
  });

  it("syncs a repo with no notice recorded when the generated files were already current", async () => {
    const syncRepo = vi.fn(() =>
      Promise.resolve({ writes: [], roles: [], mcp: [], applied: false }),
    );
    const client = stubClient({ syncRepo });
    const { current, unmount } = harness(client);
    await act(async () => {
      await current().sync("r1");
    });
    expect(syncRepo).toHaveBeenCalledWith("r1", {});
    expect(current().notices).toEqual({});
    unmount();
  });

  it("records a sync failure under the repo and rejects for the caller to see", async () => {
    const client = stubClient({ syncRepo: () => Promise.reject(BUSY) });
    const { current, unmount } = harness(client);
    await act(async () => {
      await expect(current().sync("r1")).rejects.toBe(BUSY);
    });
    expect(current().notices.r1).toMatchObject({ action: "sync", error: BUSY });
    unmount();
  });

  it("clears a repo's own notice on its next success, leaving the other repo's alone", async () => {
    let refuse = true;
    const client = stubClient({
      closeRepo: () => Promise.reject(BUSY),
      openRepo: () => (refuse ? Promise.reject(BUSY) : Promise.resolve({ repo: REPO })),
    });
    const { current, unmount } = harness(client);
    await act(async () => {
      await current()
        .close("r2")
        .catch(() => undefined);
      await current()
        .reopen("r1")
        .catch(() => undefined);
    });
    expect(Object.keys(current().notices).sort()).toEqual(["r1", "r2"]);
    const r2Notice = current().notices.r2;

    refuse = false;
    await act(async () => {
      await current().reopen("r1");
    });
    expect(current().notices).toEqual({ r2: r2Notice });
    unmount();
  });
});
