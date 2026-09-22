import { describe, expect, it } from "vitest";
import { CHANGES_KEY, readPanelOpen, writePanelOpen } from "./panel-open";

function storage(stored: string | null): Storage & { written: string | null } {
  const box = {
    written: null as string | null,
    getItem: (key: string) => (key === CHANGES_KEY ? stored : null),
    setItem: (_key: string, value: string) => {
      box.written = value;
    },
  };
  return box as unknown as Storage & { written: string | null };
}

describe("readPanelOpen", () => {
  it("opens on a wide window that has never been told otherwise", () => {
    expect(readPanelOpen(storage(null), 1440)).toBe(true);
  });

  it("stays closed on a narrow one", () => {
    expect(readPanelOpen(storage(null), 1279)).toBe(false);
  });

  it("honours a panel the user closed, however wide the window", () => {
    expect(readPanelOpen(storage("closed"), 1440)).toBe(false);
  });

  it("honours a panel the user opened, however narrow the window", () => {
    expect(readPanelOpen(storage("open"), 1024)).toBe(true);
  });
});

describe("writePanelOpen", () => {
  it("writes back what readPanelOpen reads", () => {
    const opened = storage(null);
    writePanelOpen(opened, true);
    expect(opened.written).toBe("open");
    expect(readPanelOpen(storage(opened.written), 800)).toBe(true);
    const closed = storage(null);
    writePanelOpen(closed, false);
    expect(closed.written).toBe("closed");
    expect(readPanelOpen(storage(closed.written), 1600)).toBe(false);
  });
});
