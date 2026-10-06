import { describe, expect, it } from "vitest";
import {
  CHANGES_RANGE,
  ceiling,
  clampWidth,
  gridTemplateColumns,
  SIDEBAR_RANGE,
} from "./pane-width";

describe("clampWidth", () => {
  it("keeps a width inside the range", () => {
    expect(clampWidth(SIDEBAR_RANGE, 263)).toBe(263);
    expect(clampWidth(SIDEBAR_RANGE, SIDEBAR_RANGE.min)).toBe(200);
    expect(clampWidth(SIDEBAR_RANGE, SIDEBAR_RANGE.max)).toBe(400);
  });

  it("pulls a width outside the range to the nearest end", () => {
    expect(clampWidth(SIDEBAR_RANGE, 10)).toBe(200);
    expect(clampWidth(SIDEBAR_RANGE, 1000)).toBe(400);
    expect(clampWidth(CHANGES_RANGE, 1000)).toBe(720);
  });
});

describe("ceiling", () => {
  it("leaves the centre its 640 px on a 1280 px window", () => {
    expect(ceiling(SIDEBAR_RANGE, 1280, 360)).toBe(280);
  });

  it("never goes under the pane's minimum, however little is left", () => {
    expect(ceiling(SIDEBAR_RANGE, 1280, 720)).toBe(200);
    expect(ceiling(CHANGES_RANGE, 900, 240)).toBe(300);
  });

  it("gives the pane its own maximum when the window has the room", () => {
    expect(ceiling(SIDEBAR_RANGE, 2560, 360)).toBe(400);
    expect(ceiling(CHANGES_RANGE, 2560, 240)).toBe(720);
  });
});

describe("gridTemplateColumns", () => {
  it("draws the rail for a collapsed sidebar and no third column for a closed panel", () => {
    expect(gridTemplateColumns(240, 360)).toBe("240px 1fr 360px");
    expect(gridTemplateColumns(null, 360)).toBe("52px 1fr 360px");
    expect(gridTemplateColumns(240, null)).toBe("240px 1fr");
    expect(gridTemplateColumns(null, null)).toBe("52px 1fr");
  });
});
