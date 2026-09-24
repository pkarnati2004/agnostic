import { describe, expect, it } from "vitest";
import { errorMessage, parseIncoming, resultMessage } from "./json-rpc.js";

describe("parseIncoming", () => {
  it("reads a request, id and params included", () => {
    const line = '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"agn_status"}}';
    expect(parseIncoming(line)).toEqual({
      kind: "request",
      request: { id: 7, method: "tools/call", params: { name: "agn_status" } },
    });
  });

  it("defaults missing params to an empty object", () => {
    expect(parseIncoming('{"jsonrpc":"2.0","id":"a","method":"ping"}')).toEqual({
      kind: "request",
      request: { id: "a", method: "ping", params: {} },
    });
  });

  it("reads a notification as a message with no id", () => {
    expect(parseIncoming('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toEqual({
      kind: "notification",
      notification: { method: "notifications/initialized", params: {} },
    });
  });

  it("ignores a response, which is an answer to a request agn never sent", () => {
    expect(parseIncoming('{"jsonrpc":"2.0","id":1,"result":{}}')).toEqual({ kind: "ignored" });
    expect(parseIncoming('{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"x"}}')).toEqual({
      kind: "ignored",
    });
  });

  it("keeps the extra keys a client may add out of the way", () => {
    const line = '{"jsonrpc":"2.0","id":1,"method":"ping","params":{},"_meta":{"x":1}}';
    expect(parseIncoming(line)).toEqual({
      kind: "request",
      request: { id: 1, method: "ping", params: {} },
    });
  });

  it("refuses a batch and a message of another version", () => {
    for (const line of ["[]", '[{"jsonrpc":"2.0","id":1,"method":"ping"}]', '{"jsonrpc":"1.0"}']) {
      expect(parseIncoming(line)).toMatchObject({ kind: "invalid", code: -32600 });
    }
  });

  it("answers an invalid request at the id it could read", () => {
    const parsed = parseIncoming('{"jsonrpc":"1.0","id":4,"method":"ping"}');
    expect(parsed).toMatchObject({ kind: "invalid", id: 4, code: -32600 });
  });

  it("refuses valid JSON with no jsonrpc key at all, at the id it could read", () => {
    const parsed = parseIncoming('{"id":5,"method":"ping","params":{}}');
    expect(parsed).toMatchObject({ kind: "invalid", id: 5, code: -32600 });
  });

  it("refuses a method that is not a string", () => {
    const parsed = parseIncoming('{"jsonrpc":"2.0","id":6,"method":123}');
    expect(parsed).toMatchObject({ kind: "invalid", id: 6, code: -32600 });
  });

  it("reports a line that is not JSON at a null id", () => {
    expect(parseIncoming("not json")).toMatchObject({ kind: "invalid", id: null, code: -32700 });
  });
});

describe("resultMessage", () => {
  it("echoes a string id as it came", () => {
    const line = resultMessage("call-1", { ok: true });
    expect(JSON.parse(line)).toEqual({ jsonrpc: "2.0", id: "call-1", result: { ok: true } });
  });

  it("writes one line even when the result text holds newlines", () => {
    const line = resultMessage(1, { content: [{ type: "text", text: "a\nb" }] });
    expect(line).not.toContain("\n");
    expect(JSON.parse(line).result.content[0].text).toBe("a\nb");
  });
});

describe("errorMessage", () => {
  it("leaves data out when there is none", () => {
    expect(JSON.parse(errorMessage(2, -32601, "method not found: x"))).toEqual({
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32601, message: "method not found: x" },
    });
  });

  it("carries data and a null id", () => {
    expect(JSON.parse(errorMessage(null, -32602, "invalid params", "name: required"))).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32602, message: "invalid params", data: "name: required" },
    });
  });
});
