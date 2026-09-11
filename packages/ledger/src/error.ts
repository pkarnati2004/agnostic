import { CoreError, type CoreErrorOptions } from "@agnostic/core";

export class LedgerError extends CoreError {
  constructor(message: string, opts: CoreErrorOptions) {
    super(message, opts);
    this.name = "LedgerError";
  }
}

/** Which constraint SQLite refused on; the codes it reports are the only place this is decided. */
type ConstraintFailure = "unique" | "foreign-key" | "check";

const constraintCodes: Record<string, ConstraintFailure> = {
  SQLITE_CONSTRAINT_PRIMARYKEY: "unique",
  SQLITE_CONSTRAINT_UNIQUE: "unique",
  SQLITE_CONSTRAINT_FOREIGNKEY: "foreign-key",
  SQLITE_CONSTRAINT_CHECK: "check",
  SQLITE_CONSTRAINT_NOTNULL: "check",
};

/**
 * Turns a failed write into the ledger's own error: a caller names the constraints it expects,
 * anything else becomes `ledger-sqlite` so a real database fault is never mistaken for a conflict.
 */
export function writeFailure(
  cause: unknown,
  expected: Partial<Record<ConstraintFailure, () => LedgerError>>,
): LedgerError {
  const failure = constraintFailure(cause);
  const known = failure === null ? undefined : expected[failure];
  if (known) {
    return known();
  }
  return new LedgerError(`the ledger refused a write: ${message(cause)}`, {
    code: "ledger-sqlite",
    hint: "This is a database fault, not a conflict. Check ~/.agnostic/agnostic.db is readable.",
    cause,
  });
}

export function rowInvalid(table: string, cause: unknown): LedgerError {
  return new LedgerError(`a row in ${table} does not match its type`, {
    code: "ledger-row-invalid",
    hint: "The database was written by a different version of agn. Upgrade agn, or move ~/.agnostic/agnostic.db aside to start clean.",
    cause,
  });
}

function constraintFailure(cause: unknown): ConstraintFailure | null {
  if (!(cause instanceof Error) || !("code" in cause) || typeof cause.code !== "string") {
    return null;
  }
  return constraintCodes[cause.code] ?? null;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
