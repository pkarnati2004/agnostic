import { LedgerError } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon();
});

afterEach(() => daemon.close());

describe("createApp error handling", () => {
  it("gives an unknown route a JSON 404", async () => {
    const response = await daemon.request("/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not-found" } });
  });

  it("maps a LedgerError thrown in a route to the status of its code", async () => {
    daemon.ledger.repos.list = () => {
      throw new LedgerError("no repo with id abc", {
        code: "repo-not-found",
        hint: "Run agn repos.",
      });
    };
    const response = await daemon.request("/repos");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "repo-not-found", message: "no repo with id abc", hint: "Run agn repos." },
    });
  });

  it("tells the client nothing about an unexpected failure", async () => {
    daemon.ledger.repos.list = () => {
      throw new Error("sqlite handle closed under us");
    };
    const response = await daemon.request("/repos");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal", message: "internal error" },
    });
  });

  it("writes the real failure to the log and only there", async () => {
    daemon.ledger.repos.list = () => {
      throw new Error("sqlite handle closed under us");
    };
    await daemon.request("/repos");
    await new Promise((done) => setTimeout(done, 20));
    const log = await daemon.readLog();
    expect(log).toContain("ERROR unhandled GET /repos");
    expect(log).toContain("sqlite handle closed under us");
  });

  it("logs the request even when the route failed", async () => {
    daemon.ledger.repos.list = () => {
      throw new Error("boom");
    };
    await daemon.request("/repos");
    await new Promise((done) => setTimeout(done, 20));
    expect(await daemon.readLog()).toMatch(/http GET \/repos status=500/);
  });
});
