import { CoreError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { LedgerError, rowInvalid, writeFailure } from "./error.js";

function sqliteError(code: string): Error {
  return Object.assign(new Error(`${code}: constraint failed`), { code });
}

describe("LedgerError", () => {
  it("is a CoreError with its own name and keeps code, hint and cause", () => {
    const cause = new Error("underneath");
    const error = new LedgerError("no repo with id r7k2m4pqrs", {
      code: "repo-not-found",
      hint: "Run agn repos.",
      cause,
    });
    expect(error).toBeInstanceOf(CoreError);
    expect(error.name).toBe("LedgerError");
    expect(error.code).toBe("repo-not-found");
    expect(error.hint).toBe("Run agn repos.");
    expect(error.cause).toBe(cause);
  });
});

describe("writeFailure", () => {
  const expected = {
    unique: () => new LedgerError("taken", { code: "repo-exists" }),
    "foreign-key": () => new LedgerError("missing", { code: "repo-not-found" }),
  };

  it("maps the constraint codes a caller expects", () => {
    expect(writeFailure(sqliteError("SQLITE_CONSTRAINT_UNIQUE"), expected).code).toBe(
      "repo-exists",
    );
    expect(writeFailure(sqliteError("SQLITE_CONSTRAINT_PRIMARYKEY"), expected).code).toBe(
      "repo-exists",
    );
    expect(writeFailure(sqliteError("SQLITE_CONSTRAINT_FOREIGNKEY"), expected).code).toBe(
      "repo-not-found",
    );
  });

  it("falls back to ledger-sqlite for a constraint the caller did not expect", () => {
    const cause = sqliteError("SQLITE_CONSTRAINT_CHECK");
    const error = writeFailure(cause, expected);
    expect(error.code).toBe("ledger-sqlite");
    expect(error.cause).toBe(cause);
  });

  it("falls back to ledger-sqlite for anything that is not a constraint", () => {
    expect(writeFailure(sqliteError("SQLITE_IOERR"), expected).code).toBe("ledger-sqlite");
    expect(writeFailure("disk melted", expected).message).toContain("disk melted");
  });
});

describe("rowInvalid", () => {
  it("names the table and keeps the parse failure as the cause", () => {
    const cause = new Error("expected a 10-character agnostic id");
    const error = rowInvalid("tasks", cause);
    expect(error.code).toBe("ledger-row-invalid");
    expect(error.message).toContain("tasks");
    expect(error.hint).toContain("Upgrade agn");
    expect(error.cause).toBe(cause);
  });
});
