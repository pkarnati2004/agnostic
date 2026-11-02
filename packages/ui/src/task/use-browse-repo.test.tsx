// @vitest-environment happy-dom
import type { Repo } from "@agnostic/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { useBrowseRepo } from "./use-browse-repo";

const REPO: Repo = {
  id: "r1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
};

type Api = ReturnType<typeof useBrowseRepo>;

function mount(client: WorkspaceClient, pickFolder?: () => Promise<string | null>) {
  if (pickFolder === undefined) {
    window.agnostic = undefined;
  } else {
    window.agnostic = { pickFolder };
  }
  const onPicked = vi.fn();
  const onReopen = vi.fn(() => Promise.resolve());
  const seen: { api: Api | null } = { api: null };
  const Probe = () => {
    seen.api = useBrowseRepo({ client, onPicked, onReopen });
    return null;
  };
  const page = render(<Probe />);
  const api = (): Api => {
    if (seen.api === null) {
      throw new Error("the hook never ran");
    }
    return seen.api;
  };
  /** Runs the picker and lets every promise it started settle inside `act`. */
  const browse = async () => {
    await act(async () => {
      api().browse?.();
      await new Promise((done) => setTimeout(done, 0));
    });
  };
  return { ...page, api, browse, onPicked, onReopen };
}

afterEach(() => {
  window.agnostic = undefined;
});

describe("useBrowseRepo", () => {
  it("offers no browse in a browser", () => {
    const page = mount(stubClient());
    expect(page.api()).toEqual({ browse: null, error: null });
    page.unmount();
  });

  it("registers the picked folder without git init and selects an added repo", async () => {
    const registerRepo = vi.fn(() => Promise.resolve({ repo: REPO, created: true }));
    const page = mount(stubClient({ registerRepo }), () => Promise.resolve("/Users/dev/petal"));
    await page.browse();
    expect(registerRepo).toHaveBeenCalledWith({ path: "/Users/dev/petal", gitInit: false });
    expect(page.onPicked).toHaveBeenCalledWith("r1");
    expect(page.onReopen).not.toHaveBeenCalled();
    page.unmount();
  });

  it("selects a repo that was already known, without reopening it", async () => {
    const registerRepo = () => Promise.resolve({ repo: REPO, created: false });
    const page = mount(stubClient({ registerRepo }), () => Promise.resolve("/Users/dev/petal"));
    await page.browse();
    expect(page.onPicked).toHaveBeenCalledWith("r1");
    expect(page.onReopen).not.toHaveBeenCalled();
    page.unmount();
  });

  it("reopens a closed repo first, then selects it", async () => {
    const order: string[] = [];
    const registerRepo = () =>
      Promise.resolve({ repo: { ...REPO, status: "archived" as const }, created: false });
    const page = mount(stubClient({ registerRepo }), () => Promise.resolve("/Users/dev/petal"));
    page.onReopen.mockImplementation(() => {
      order.push("reopen");
      return Promise.resolve();
    });
    page.onPicked.mockImplementation(() => order.push("picked"));
    await page.browse();
    expect(page.onReopen).toHaveBeenCalledWith("r1");
    expect(order).toEqual(["reopen", "picked"]);
    page.unmount();
  });

  it("does nothing when the dialog is cancelled", async () => {
    const registerRepo = vi.fn();
    const page = mount(stubClient({ registerRepo }), () => Promise.resolve(null));
    await page.browse();
    expect(registerRepo).not.toHaveBeenCalled();
    expect(page.onPicked).not.toHaveBeenCalled();
    expect(page.api().error).toBeNull();
    page.unmount();
  });

  it("surfaces the daemon's refusal as the error, and selects nothing", async () => {
    const refusal = new ApiError("/Users/dev/notes is not a git repo", {
      code: "repo-not-git",
      hint: "Run git init there.",
      status: 409,
    });
    const page = mount(stubClient({ registerRepo: () => Promise.reject(refusal) }), () =>
      Promise.resolve("/Users/dev/notes"),
    );
    await page.browse();
    expect(page.api().error).toMatchObject({
      message: "/Users/dev/notes is not a git repo",
      hint: "Run git init there.",
    });
    expect(page.onPicked).not.toHaveBeenCalled();
    page.unmount();
  });

  it("clears an earlier error when the next pick starts", async () => {
    const registerRepo = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("refused", { code: "x", status: 409 }))
      .mockResolvedValueOnce({ repo: REPO, created: true });
    const page = mount(stubClient({ registerRepo }), () => Promise.resolve("/Users/dev/petal"));
    await page.browse();
    expect(page.api().error?.message).toBe("refused");
    await page.browse();
    expect(page.api().error).toBeNull();
    expect(page.onPicked).toHaveBeenCalledWith("r1");
    page.unmount();
  });
});
