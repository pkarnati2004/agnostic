// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { DiffView } from "./diff-view";

const PATCH = ["@@ -5,3 +5,4 @@", " keep this", "-drop this", "+add this", "+another add", ""].join(
  "\n",
);

/** The three <td>s of one data row; the hunk-header row has a single colSpan=3 cell instead. */
function dataRows(container: HTMLElement): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter(
    (row) => row.cells.length === 3,
  );
}

describe("DiffView", () => {
  it("carries the add and del token classes and numbers each side of the gutter", () => {
    const { container, unmount } = render(<DiffView patch={PATCH} path="src/invite.ts" />);
    const [context, del, add, add2] = dataRows(container);
    if (context === undefined || del === undefined || add === undefined || add2 === undefined) {
      throw new Error("expected four data rows");
    }

    expect(context.className).not.toContain("--diff-add-bg");
    expect(context.className).not.toContain("--diff-del-bg");
    expect(context.cells[0]?.textContent).toBe("5");
    expect(context.cells[1]?.textContent).toBe("5");
    expect(context.cells[2]?.textContent).toBe(" keep this");

    expect(del.className).toContain("--diff-del-bg");
    expect(del.cells[0]?.textContent).toBe("6");
    expect(del.cells[1]?.textContent).toBe("");
    expect(del.className).toContain("--diff-del-fg");
    expect(del.querySelector("span")?.textContent).toBe("-");
    expect(del.cells[2]?.textContent).toBe("-drop this");

    expect(add.className).toContain("--diff-add-bg");
    expect(add.cells[0]?.textContent).toBe("");
    expect(add.cells[1]?.textContent).toBe("6");
    expect(add.className).toContain("--diff-add-fg");
    expect(add.querySelector("span")?.textContent).toBe("+");
    expect(add.cells[2]?.textContent).toBe("+add this");

    expect(add2.cells[1]?.textContent).toBe("7");
    unmount();
  });

  it("keeps the hunk header above its rows", () => {
    const { container, unmount } = render(<DiffView patch={PATCH} path="src/invite.ts" />);
    expect(container.querySelector("tbody tr")?.textContent).toBe("@@ -5,3 +5,4 @@");
    unmount();
  });

  it("says a binary file has no diff to show", () => {
    const patch = "Binary files a/assets/logo.png and b/assets/logo.png differ\n";
    const { container, unmount } = render(<DiffView patch={patch} path="assets/logo.png" />);
    expect(container.textContent).toBe("binary file, no diff");
    expect(container.querySelector("table")).toBeNull();
    unmount();
  });

  it("says there is nothing to show for an empty patch", () => {
    const { container, unmount } = render(<DiffView patch="" path="src/invite.ts" />);
    expect(container.textContent).toBe("No changes in src/invite.ts.");
    unmount();
  });
});
