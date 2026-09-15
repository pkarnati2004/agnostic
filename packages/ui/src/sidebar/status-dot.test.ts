import type { TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { STATUS_DOT } from "./status-dot";

const STATUSES: TaskStatus[] = ["waiting", "running", "queued", "done", "failed", "stopped"];

describe("STATUS_DOT", () => {
  it("has a token and a label for every status", () => {
    for (const status of STATUSES) {
      expect(STATUS_DOT[status].token).toMatch(/^--status-/);
      expect(STATUS_DOT[status].label.length).toBeGreaterThan(0);
    }
  });

  it("gives every status its own token", () => {
    const tokens = STATUSES.map((status) => STATUS_DOT[status].token);
    expect(new Set(tokens).size).toBe(STATUSES.length);
  });

  it("marks waiting as the one that needs the user", () => {
    expect(STATUS_DOT.waiting).toEqual({ token: "--status-waiting", label: "waiting for you" });
  });
});
