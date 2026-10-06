// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

describe("DialogContent", () => {
  it("lays its column out so unwrappable content cannot widen the dialog", () => {
    const { unmount } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Hand off</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content?.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(content?.className).toContain("max-w-[580px]");
    unmount();
  });
});
