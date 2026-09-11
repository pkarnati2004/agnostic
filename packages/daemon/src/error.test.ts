import { ConfigError, CoreError } from "@agnostic/core";
import { LedgerError } from "@agnostic/ledger";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DaemonError, errorBody, httpStatus, requestInvalid } from "./error.js";

describe("httpStatus", () => {
  it("maps the codes every package throws", () => {
    expect(httpStatus("unauthorized")).toBe(401);
    expect(httpStatus("repo-not-found")).toBe(404);
    expect(httpStatus("task-not-found")).toBe(404);
    expect(httpStatus("repo-exists")).toBe(409);
    expect(httpStatus("repo-id-registered")).toBe(409);
    expect(httpStatus("ag-file-malformed")).toBe(400);
  });

  it("calls an ambiguous prefix a bad request, not a conflict", () => {
    expect(httpStatus("ambiguous-id")).toBe(400);
  });

  it("treats an unmapped code as a bug in the daemon", () => {
    expect(httpStatus("ledger-sqlite")).toBe(500);
  });
});

describe("errorBody", () => {
  it("passes a CoreError's code, message and hint through", () => {
    const error = new LedgerError("no repo with id abc", {
      code: "repo-not-found",
      hint: "Run agn repos.",
    });
    expect(errorBody(error)).toEqual({
      status: 404,
      body: {
        error: { code: "repo-not-found", message: "no repo with id abc", hint: "Run agn repos." },
      },
    });
  });

  it("omits hint when the error has none", () => {
    const { body } = errorBody(new CoreError("nope", { code: "unauthorized" }));
    expect(body.error).toEqual({ code: "unauthorized", message: "nope" });
  });

  it("gives a plain Error nothing but a 500", () => {
    expect(errorBody(new Error("connection string leaked here"))).toEqual({
      status: 500,
      body: { error: { code: "internal", message: "internal error" } },
    });
  });

  it("maps a malformed .ag file to 400", () => {
    const error = new ConfigError("bad yaml", {
      code: "ag-file-malformed",
      hint: "Fix it.",
      file: "/repo/.ag/agnostic.yaml",
    });
    expect(errorBody(error).status).toBe(400);
  });
});

describe("requestInvalid", () => {
  it("names the offending field so the user knows where to look", () => {
    const parsed = z.object({ path: z.string() }).safeParse({ path: 7 });
    const error = requestInvalid(parsed.error as z.ZodError);
    expect(error).toBeInstanceOf(DaemonError);
    expect(error.code).toBe("request-invalid");
    expect(error.message).toContain("path:");
    expect(errorBody(error).status).toBe(400);
  });
});
