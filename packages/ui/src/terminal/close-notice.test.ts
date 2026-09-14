import { describe, expect, it } from "vitest";
import { closeNotice } from "./close-notice";

describe("closeNotice", () => {
  const ctx = (code: number, reason = "", sawExit = false) => ({ code, reason, sawExit });

  it("says nothing when the exit frame already did", () => {
    expect(closeNotice(ctx(1000, "", true))).toBeNull();
  });

  it("names a close the page did not expect", () => {
    expect(closeNotice(ctx(1000))).toBe("Connection closed (1000).");
    expect(closeNotice(ctx(1005))).toBe("Connection closed (1005).");
  });

  it("reads the codes the daemon uses", () => {
    expect(closeNotice(ctx(1001))).toBe("The daemon is restarting.");
    expect(closeNotice(ctx(1006))).toBe("Connection lost.");
    expect(closeNotice(ctx(1008, "request-invalid"))).toBe(
      "The daemon refused the terminal protocol: request-invalid.",
    );
    expect(closeNotice(ctx(1011, "session-not-running"))).toBe(
      "The terminal could not open: session-not-running.",
    );
  });

  it("leaves the reason out when there is none", () => {
    expect(closeNotice(ctx(1011))).toBe("The terminal could not open.");
  });
});
