import { describe, expect, it } from "vitest";
import { decodeServerFrame, encodeResize } from "./terminal-frames";

describe("encodeResize", () => {
  it("writes the frame the daemon parses", () => {
    expect(encodeResize({ cols: 120, rows: 40 })).toBe('{"type":"resize","cols":120,"rows":40}');
  });
});

describe("decodeServerFrame", () => {
  it("reads ready", () => {
    expect(decodeServerFrame('{"type":"ready"}')).toEqual({ type: "ready" });
  });

  it("reads exit with and without a code", () => {
    expect(decodeServerFrame('{"type":"exit","code":0}')).toEqual({ type: "exit", code: 0 });
    expect(decodeServerFrame('{"type":"exit"}')).toEqual({ type: "exit" });
  });

  it("ignores a frame the page does not send or read", () => {
    expect(decodeServerFrame('{"type":"resize","cols":80,"rows":24}')).toBeNull();
    expect(decodeServerFrame("not json")).toBeNull();
    expect(decodeServerFrame("[]")).toBeNull();
    expect(decodeServerFrame("null")).toBeNull();
  });
});
