import { CHANGES_RANGE, ceiling, gridTemplateColumns, RAIL_PX, SIDEBAR_RANGE } from "./pane-width";
import { type PaneWidth, usePaneWidth } from "./use-pane-width";

export type PaneColumn = PaneWidth & { min: number; max: number };

export type WorkspaceColumns = { sidebar: PaneColumn; changes: PaneColumn; template: string };

/** Two `usePaneWidth`s, each pane's ceiling against the other, and the template for the grid. */
export function useWorkspaceColumns(input: {
  collapsed: boolean;
  changesShown: boolean;
}): WorkspaceColumns {
  const { collapsed, changesShown } = input;
  const sidebar = usePaneWidth(SIDEBAR_RANGE, !collapsed);
  const changes = usePaneWidth(CHANGES_RANGE, changesShown);
  // Read on render, not watched: a drag re-renders, so the bound is current from its second frame.
  const viewport = window.innerWidth;
  // Each pane's ceiling is measured against the width the other one asked for, so neither bound
  // depends on the other's bound; the pair is always at least as narrow as the window allows.
  const sidebarMax = ceiling(SIDEBAR_RANGE, viewport, changesShown ? changes.width : 0);
  const changesMax = ceiling(CHANGES_RANGE, viewport, collapsed ? RAIL_PX : sidebar.width);
  // A pane keeps the width it was dragged to, and reports the ceiling until the window or the
  // other pane gives the room back: opening the Changes column must not push the centre under its
  // minimum, and `aria-valuenow` must not read above `aria-valuemax`.
  const sidebarWidth = Math.min(sidebar.width, sidebarMax);
  const changesWidth = Math.min(changes.width, changesMax);
  return {
    sidebar: { ...sidebar, width: sidebarWidth, min: SIDEBAR_RANGE.min, max: sidebarMax },
    changes: { ...changes, width: changesWidth, min: CHANGES_RANGE.min, max: changesMax },
    template: gridTemplateColumns(
      collapsed ? null : sidebarWidth,
      changesShown ? changesWidth : null,
    ),
  };
}
