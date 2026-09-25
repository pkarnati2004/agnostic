// @vitest-environment happy-dom
import type { ChangesResponse } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { changesResponse, taskRow } from "./changes-fixture";
import { ChangesPanel } from "./changes-panel";

const PATCHES: Record<string, string> = {
  "src/invite.ts": "@@ -10,2 +10,2 @@\n-  const ttl = 3600;\n+  const ttl = readTtl();\n",
  "src/invite.test.ts": "@@ -0,0 +1 @@\n+test('signs', () => {});\n",
};

function panelClient(over: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return stubClient({
    changes: () => Promise.resolve(changesResponse()),
    diff: (_id, path) => Promise.resolve({ patch: PATCHES[path] ?? "" }),
    editors: () => Promise.resolve({ editors: [], default: null }),
    ...over,
  });
}

/** The panel's callbacks: every test but the ones that watch a click answers the same way. */
const HANDLERS = {
  onOpen: () => Promise.resolve(),
  onCreatePr: () => Promise.resolve(null),
  onUpdate: () => Promise.resolve(null),
  onAskCommit: () => Promise.resolve(null),
  onLoaded: () => undefined,
};

/** The list and the first file's patch both arrive before the panel has drawn anything. */
async function panel(client: WorkspaceClient, task = taskRow()) {
  const view = render(
    <TooltipProvider>
      <ChangesPanel task={task} client={client} notice={null} {...HANDLERS} />
    </TooltipProvider>,
  );
  await act(async () => undefined);
  await act(async () => undefined);
  return view;
}

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
}

describe("ChangesPanel", () => {
  it("draws the header, the files and the first file's patch", async () => {
    const { container, unmount } = await panel(panelClient());
    expect(container.textContent).toContain("agn/invite-links-a1b2");
    expect(container.textContent).toContain("3 commits, 3 uncommitted");
    expect(rows(container).map((row) => row.textContent)).toEqual([
      "src/invite.tsM+42 -3",
      "src/invite.test.tsA+80 -0",
      "docs/invites.md?untracked",
    ]);
    const unstaged = container.querySelectorAll('[role="group"][data-state="unstaged"]');
    expect(unstaged).toHaveLength(1);
    expect(unstaged[0]?.firstElementChild?.textContent).toBe("Unstaged 3");
    expect(rows(container)[0]?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector("table")?.textContent).toContain("const ttl = readTtl();");
    unmount();
  });

  it("reads the patch of a file that is clicked, and marks it selected", async () => {
    const asked: string[] = [];
    const client = panelClient({
      diff: (_id, path) => {
        asked.push(path);
        return Promise.resolve({ patch: PATCHES[path] ?? "" });
      },
    });
    const { container, unmount } = await panel(client);
    const second = rows(container)[1];
    if (second === undefined) {
      throw new Error("the second file is not listed");
    }
    click(second);
    await act(async () => undefined);
    expect(asked).toEqual(["src/invite.ts", "src/invite.test.ts"]);
    expect(rows(container)[1]?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector("table")?.textContent).toContain("test('signs'");
    unmount();
  });

  it("re-reads the list on Refresh and keeps the rows while it waits", async () => {
    let answer: (response: ChangesResponse) => void = () => undefined;
    let reads = 0;
    const client = panelClient({
      changes: () => {
        reads += 1;
        return reads === 1
          ? Promise.resolve(changesResponse())
          : new Promise<ChangesResponse>((resolve) => {
              answer = resolve;
            });
      },
    });
    const { container, unmount } = await panel(client);
    click(button(container, "Refresh"));
    expect(rows(container)).toHaveLength(3);
    expect(button(container, "Refresh").disabled).toBe(true);
    await act(async () => {
      answer(changesResponse({ files: [], uncommitted: 0 }));
    });
    expect(reads).toBe(2);
    expect(container.textContent).toContain("No changes against main yet.");
    unmount();
  });

  it("says how to make a folder workspace a git one", async () => {
    const refused = new ApiError("petal is a folder workspace, so it has no changes to read", {
      code: "repo-not-git",
      hint: "Run `git init` in /repos/petal, or `agn add /repos/petal --git-init`.",
      status: 409,
    });
    const client = panelClient({ changes: () => Promise.reject(refused) });
    const { container, unmount } = await panel(client);
    expect(container.textContent).toContain("git init to enable");
    expect(container.querySelector("code")?.textContent).toBe("git init");
    expect(container.textContent).toContain("agn add /repos/petal --git-init");
    expect(container.querySelector("button")).toBeNull();
    unmount();
  });

  it("says a branch that is gone, with Refresh the only control left", async () => {
    const gone = new ApiError("the branch agn/invite-links-a1b2 no longer exists", {
      code: "branch-gone",
      hint: "Run `agn clean task1` to drop the task.",
      status: 409,
    });
    const client = panelClient({ changes: () => Promise.reject(gone) });
    const { container, unmount } = await panel(client);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "the branch agn/invite-links-a1b2 no longer exists",
    );
    expect(container.querySelector("code")?.textContent).toBe("agn clean task1");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((one) => one.textContent)).toEqual(["Refresh"]);
    unmount();
  });

  it("shows a loading line and no controls while the first read is in flight", async () => {
    const client = panelClient({ changes: () => new Promise<ChangesResponse>(() => undefined) });
    const { container, unmount } = render(
      <TooltipProvider>
        <ChangesPanel task={taskRow()} client={client} notice={null} {...HANDLERS} />
      </TooltipProvider>,
    );
    await act(async () => undefined);
    expect(container.textContent).toContain("Loading changes…");
    expect(container.querySelector("button")).toBeNull();
    unmount();
  });

  it("names the ref an adopted task is read against, with no branch/base row", async () => {
    const client = panelClient();
    const { container, unmount } = await panel(client, taskRow({ origin: "adopted" }));
    expect(container.textContent).toContain("adopted: changes against main");
    expect(container.textContent).not.toContain("→");
    unmount();
  });

  it("says a base the branch is behind", async () => {
    const client = panelClient({ changes: () => Promise.resolve(changesResponse({ behind: 4 })) });
    const { container, unmount } = await panel(client);
    expect(container.textContent).toContain("behind 4");
    unmount();
  });

  it("disables Open in editor and Bring up to date once the worktree is cleaned", async () => {
    const client = panelClient({
      editors: () =>
        Promise.resolve({
          editors: [{ id: "vscode", name: "VS Code", via: "path", path: "/usr/bin/code" }],
          default: "vscode",
        }),
    });
    const cleanedTask = taskRow({ worktreePresent: false, worktreePath: "/tmp/wt/task1" });
    const { container, unmount } = await panel(client, cleanedTask);
    expect(container.textContent).toContain("worktree cleaned; branch agn/invite-links-a1b2 kept");
    const named = Array.from(container.querySelectorAll("button")).find(
      (one) => one.textContent === "Open in VS Code",
    );
    if (named === undefined) {
      throw new Error("no Open in VS Code button");
    }
    expect(named.disabled).toBe(true);
    const update = Array.from(container.querySelectorAll("button")).find(
      (one) => one.textContent === "Bring up to date",
    );
    expect(update?.disabled).toBe(true);
    unmount();
  });

  it("says there is nothing changed against the task's base", async () => {
    const client = panelClient({
      changes: () => Promise.resolve(changesResponse({ files: [], uncommitted: 0 })),
    });
    const { container, unmount } = await panel(client);
    expect(container.textContent).toContain("No changes against main yet.");
    expect(container.querySelector('[role="option"]')).toBeNull();
    unmount();
  });

  it("says a selected file is binary, with no diff to draw", async () => {
    const binaryFile = {
      path: "assets/logo.png",
      status: "modified" as const,
      state: "unstaged" as const,
      additions: null,
      deletions: null,
    };
    const client = panelClient({
      changes: () => Promise.resolve(changesResponse({ files: [binaryFile] })),
      diff: () =>
        Promise.resolve({ patch: "Binary files a/assets/logo.png and b/assets/logo.png differ\n" }),
    });
    const { container, unmount } = await panel(client);
    expect(rows(container).map((row) => row.textContent)).toEqual(["assets/logo.pngMbinary"]);
    expect(container.textContent).toContain("binary file, no diff");
    unmount();
  });

  it("exposes the changed files as a listbox, one option selected at a time", async () => {
    const { container, unmount } = await panel(panelClient());
    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox?.getAttribute("aria-label")).toBe("Changed files");
    expect(rows(container).map((row) => row.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    unmount();
  });

  it("draws a panel notice under the action row, and drops it once it is cleared", async () => {
    const failed = new ApiError("zed did not start", {
      code: "editor-failed",
      hint: "Run `agn doctor`.",
      status: 409,
    });
    const openNotice = {
      action: "open" as const,
      host: "panel" as const,
      error: failed,
      at: 1000,
    };
    const client = panelClient();
    const rendered = render(
      <TooltipProvider>
        <ChangesPanel task={taskRow()} client={client} notice={openNotice} {...HANDLERS} />
      </TooltipProvider>,
    );
    await act(async () => undefined);
    await act(async () => undefined);
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
      "Open in editor failed for Add the invite links: zed did not start",
    );
    expect(rendered.container.querySelector("code")?.textContent).toBe("agn doctor");

    rendered.update(
      <TooltipProvider>
        <ChangesPanel task={taskRow()} client={client} notice={null} {...HANDLERS} />
      </TooltipProvider>,
    );
    expect(rendered.container.querySelector('[role="alert"]')).toBeNull();
    rendered.unmount();
  });
});

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (one) => one.textContent === label,
  );
  if (found === undefined) {
    throw new Error(`no ${label} button`);
  }
  return found;
}
