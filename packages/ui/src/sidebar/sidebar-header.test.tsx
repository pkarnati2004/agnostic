// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { render } from "../test/render";
import { paletteHint } from "./shortcut-hint";
import { SidebarHeader } from "./sidebar-header";

function header(handlers: {
  onNewTask?: () => void;
  onSearch?: () => void;
  onToggle?: () => void;
}) {
  const on = {
    onNewTask: handlers.onNewTask ?? vi.fn(),
    onSearch: handlers.onSearch ?? vi.fn(),
    onToggle: handlers.onToggle ?? vi.fn(),
  };
  return render(
    <TooltipProvider>
      <SidebarHeader {...on} />
    </TooltipProvider>,
  );
}

function row(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((one) =>
    one.textContent?.startsWith(label),
  );
  if (found === undefined) {
    throw new Error(`no "${label}" row`);
  }
  return found;
}

describe("SidebarHeader", () => {
  it("starts a task", () => {
    const onNewTask = vi.fn();
    const { container, unmount } = header({ onNewTask });
    row(container, "New task").click();
    expect(onNewTask).toHaveBeenCalledOnce();
    unmount();
  });

  it("opens the palette from Search, with the machine's own shortcut beside it", () => {
    const onSearch = vi.fn();
    const { container, unmount } = header({ onSearch });
    const search = row(container, "Search");
    search.click();
    expect(onSearch).toHaveBeenCalledOnce();
    expect(search.textContent).toContain(paletteHint(navigator.platform));
    unmount();
  });

  // Cmd-N belongs to the browser, so agn does not claim it and does not advertise it (GAPS 9a).
  it("advertises no shortcut for New task", () => {
    const { container, unmount } = header({});
    expect(row(container, "New task").querySelector("kbd")).toBeNull();
    unmount();
  });
});
