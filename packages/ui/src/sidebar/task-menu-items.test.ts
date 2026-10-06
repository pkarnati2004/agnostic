import { describe, expect, it } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { type MenuPlacement, menuSections } from "./task-menu-items";

function shape(over: Parameters<typeof taskRow>[0], placement: MenuPlacement = "row") {
  return menuSections(taskRow(over), placement).map((section) => [
    section.id,
    section.items.map((item) => item.id).join(","),
  ]);
}

describe("menuSections", () => {
  it("offers a finished task its worktree, its lifecycle, Archive and Delete", () => {
    expect(shape({ status: "done" })).toEqual([
      ["copy", "copy-branch,copy-id"],
      ["open", "open"],
      ["lifecycle", "resume,handoff,pr"],
      ["archive", "archive"],
      ["delete", "delete"],
    ]);
  });

  it("offers a running task the attach command and Stop, and no Archive", () => {
    expect(shape({ status: "running" })).toEqual([
      ["copy", "copy-branch,copy-id,copy-attach"],
      ["open", "open"],
      ["lifecycle", "stop,handoff,pr"],
      ["delete", "delete"],
    ]);
  });

  it("leaves a queued row its copy rows alone: agn is still launching it", () => {
    expect(shape({ status: "queued" })).toEqual([
      ["copy", "copy-branch,copy-id"],
      ["open", "open"],
      ["delete", "delete"],
    ]);
    const [deleteItem] = menuSections(taskRow({ status: "queued" }), "row")
      .filter((section) => section.id === "delete")
      .flatMap((section) => section.items);
    expect(deleteItem?.disabled).toBe("Stop the task first");
  });

  it("offers a History row Resume and says what a resume does", () => {
    const task = taskRow({ status: "done", worktreePresent: false });
    expect(shape({ status: "done", worktreePresent: false })).toEqual([
      ["copy", "copy-branch,copy-id"],
      ["lifecycle", "resume"],
      ["delete", "delete"],
    ]);
    const lifecycle = menuSections(task, "row").find((section) => section.id === "lifecycle");
    expect(lifecycle?.items[0]?.tooltip).toBe("Rebuilds the worktree from its branch");
  });

  it("leaves out of the header's menu what the header's own buttons already are", () => {
    expect(shape({ status: "done" }, "header")).toEqual([
      ["copy", "copy-branch,copy-id"],
      ["open", "open"],
      ["delete", "delete"],
    ]);
  });

  it("disables Delete while the task is still live, and says what to do first", () => {
    const [item] = menuSections(taskRow({ status: "waiting" }), "row")
      .filter((section) => section.id === "delete")
      .flatMap((section) => section.items);
    expect(item?.disabled).toBe("Stop the task first");
    expect(item?.tone).toBe("destructive");
  });

  it("carries the task id beside Copy task id and names the Archive tooltip", () => {
    const sections = menuSections(taskRow({ status: "stopped" }), "row");
    const items = sections.flatMap((section) => section.items);
    expect(items.find((item) => item.id === "copy-id")?.meta).toBe("task1");
    expect(items.find((item) => item.id === "archive")?.tooltip).toBe(
      "Removes the worktree. The task moves to History; Resume rebuilds it from its branch.",
    );
  });

  it("drops Copy branch name and Create PR for a task with no branch of agn's", () => {
    expect(
      shape({ status: "done", worktreePath: null, worktreePresent: false, branch: null }),
    ).toEqual([
      ["copy", "copy-id"],
      ["lifecycle", "resume,handoff"],
      ["delete", "delete"],
    ]);
  });
});
