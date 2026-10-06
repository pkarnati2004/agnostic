export type PaneRange = { defaultWidth: number; min: number; max: number };

export const SIDEBAR_RANGE: PaneRange = { defaultWidth: 240, min: 200, max: 400 };
export const CHANGES_RANGE: PaneRange = { defaultWidth: 360, min: 300, max: 720 };

/** The collapsed sidebar; `sidebar/rail.tsx` draws it and nothing here changes it. */
export const RAIL_PX = 52;

/** The centre's own minimum, set on `centre.tsx`'s `<main>`; a drag stops where it would break it. */
export const CENTRE_MIN_PX = 640;

export function clampWidth(range: PaneRange, width: number): number {
  return Math.min(Math.max(width, range.min), range.max);
}

/**
 * The most a pane may take on this window: its max, or what is left after the other pane and the
 * centre's minimum, whichever is less; never under its min.
 */
export function ceiling(range: PaneRange, viewport: number, other: number): number {
  const left = viewport - other - CENTRE_MIN_PX;
  return Math.max(range.min, Math.min(range.max, left));
}

/** `grid-template-columns` for the page: a null sidebar is the rail, a null changes is no third column. */
export function gridTemplateColumns(sidebar: number | null, changes: number | null): string {
  const first = `${sidebar ?? RAIL_PX}px 1fr`;
  return changes === null ? first : `${first} ${changes}px`;
}
