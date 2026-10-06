// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { TooltipProvider } from "../components/tooltip";
import type { PaneColumn } from "../layout/workspace-columns";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { changesResponse, taskRow } from "./changes-fixture";
import { ChangesPanel } from "./changes-panel";

/** The page's column; nothing here drags it, so the two callbacks are never reached. */
const COLUMN: PaneColumn = {
  width: 360,
  min: 300,
  max: 720,
  set: () => undefined,
  reset: () => undefined,
};

const HANDLERS = {
  onOpen: () => Promise.resolve(),
  onCreatePr: () => Promise.resolve(null),
  onUpdate: () => Promise.resolve(null),
  onAskCommit: () => Promise.resolve(null),
  onLoaded: () => undefined,
  onClose: () => undefined,
};

function client(): WorkspaceClient {
  return stubClient({
    changes: () => Promise.resolve(changesResponse()),
    diff: () => Promise.resolve({ patch: "" }),
    editors: () => Promise.resolve({ editors: [], default: null }),
  });
}

async function panel(column?: PaneColumn) {
  const view = render(
    <TooltipProvider>
      <ChangesPanel
        task={taskRow()}
        client={client()}
        notice={null}
        column={column}
        {...HANDLERS}
      />
    </TooltipProvider>,
  );
  await act(async () => undefined);
  await act(async () => undefined);
  return view;
}

describe("the Changes column's resize handle", () => {
  it("sits on the column's left edge when the page gives it a column", async () => {
    const view = await panel(COLUMN);
    const handles = view.container.querySelectorAll('[role="separator"]');

    expect(handles.length).toBe(1);
    expect(handles[0]?.getAttribute("aria-label")).toBe("Resize Changes");
    view.unmount();
  });

  it("is not drawn when the panel is given no column", async () => {
    const view = await panel();

    expect(view.container.querySelectorAll('[role="separator"]').length).toBe(0);
    view.unmount();
  });
});
