/** What a thrown value says. A `catch` binds `unknown`, and only an `Error` carries a message. */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export type CoreErrorOptions = {
  code: string;
  hint?: string;
  cause?: unknown;
};

/** The base for every typed error in agnostic: a stable `code` for machines, a `hint` for people. */
export class CoreError extends Error {
  readonly code: string;
  readonly hint?: string;

  constructor(message: string, opts: CoreErrorOptions) {
    super(message, { cause: opts.cause });
    this.name = "CoreError";
    this.code = opts.code;
    this.hint = opts.hint;
  }
}

export type ProcessErrorOptions = CoreErrorOptions & {
  command: string;
  args: string[];
  exitCode: number | null;
  stderr: string;
  /** The child's whole stdout: git answers some questions there and still exits non-zero. */
  stdout?: string;
};

export class ProcessError extends CoreError {
  readonly command: string;
  readonly args: string[];
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(message: string, opts: ProcessErrorOptions) {
    super(message, opts);
    this.name = "ProcessError";
    this.command = opts.command;
    this.args = opts.args;
    this.exitCode = opts.exitCode;
    this.stderr = opts.stderr;
    this.stdout = opts.stdout ?? "";
  }
}

export type ConfigErrorOptions = CoreErrorOptions & {
  file: string;
};

/** A file under `.ag/` exists but cannot be used; `file` is the absolute path the user must fix. */
export class ConfigError extends CoreError {
  readonly file: string;

  constructor(message: string, opts: ConfigErrorOptions) {
    super(message, opts);
    this.name = "ConfigError";
    this.file = opts.file;
  }
}

export type DaemonApiErrorOptions = CoreErrorOptions & {
  /** The HTTP status the daemon answered with; null when the request never got an answer. */
  status: number | null;
};

/** What a client throws: the daemon's own error body, or the reason it could not be reached. */
export class DaemonApiError extends CoreError {
  readonly status: number | null;

  constructor(message: string, opts: DaemonApiErrorOptions) {
    super(message, opts);
    this.name = "DaemonApiError";
    this.status = opts.status;
  }
}
