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
};

export class ProcessError extends CoreError {
  readonly command: string;
  readonly args: string[];
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(message: string, opts: ProcessErrorOptions) {
    super(message, opts);
    this.name = "ProcessError";
    this.command = opts.command;
    this.args = opts.args;
    this.exitCode = opts.exitCode;
    this.stderr = opts.stderr;
  }
}
