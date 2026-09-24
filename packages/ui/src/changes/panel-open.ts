/** The panel is remembered per origin, as the tabs are, so dev and the daemon do not share it. */
export const CHANGES_KEY = "agn.changes";

// Below this the centre column and the panel do not both fit (TESTING v1 item 7).
const WIDE_PX = 1280;

/** No stored value: the panel starts open on a wide window and closed on a narrow one. */
export function readPanelOpen(storage: Pick<Storage, "getItem">, width: number): boolean {
  const stored = storage.getItem(CHANGES_KEY);
  if (stored === "open" || stored === "closed") {
    return stored === "open";
  }
  return width >= WIDE_PX;
}

export function writePanelOpen(storage: Pick<Storage, "setItem">, open: boolean): void {
  storage.setItem(CHANGES_KEY, open ? "open" : "closed");
}
