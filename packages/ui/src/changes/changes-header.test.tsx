// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { find, render } from "../test/render";
import { changesResponse, taskRow } from "./changes-fixture";
import { ChangesHeader } from "./changes-header";

function header(over: Partial<Parameters<typeof ChangesHeader>[0]> = {}) {
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  return {
    onRefresh,
    onClose,
    ...render(
      <TooltipProvider>
        <ChangesHeader
          task={taskRow()}
          response={changesResponse()}
          cleaned={false}
          loading={false}
          onRefresh={onRefresh}
          onClose={onClose}
          {...over}
        />
      </TooltipProvider>,
    ),
  };
}

describe("ChangesHeader", () => {
  it("counts the badge from the files the response carries, not a fixed number", () => {
    const three = header({ response: changesResponse() });
    expect(find(three.container, '[data-slot="badge"]').textContent).toBe("3");
    three.unmount();

    const one = header({
      response: changesResponse({ files: changesResponse().files.slice(0, 1) }),
    });
    expect(find(one.container, '[data-slot="badge"]').textContent).toBe("1");
    one.unmount();
  });

  it("draws no badge before the first read has landed", () => {
    const { container, unmount } = header({ response: null });
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();
    unmount();
  });

  it("calls the panel's toggle from its own Close button, not Refresh", () => {
    const { container, onClose, onRefresh, unmount } = header();
    find<HTMLButtonElement>(container, 'button[aria-label="Close the Changes column"]').click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onRefresh).not.toHaveBeenCalled();
    unmount();
  });
});
