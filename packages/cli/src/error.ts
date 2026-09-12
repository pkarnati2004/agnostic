import { CoreError, type CoreErrorOptions } from "@agnostic/core";

/** What the CLI decides on its own, before or instead of a request: resolution, mostly. */
export class CliError extends CoreError {
  constructor(message: string, opts: CoreErrorOptions) {
    super(message, opts);
    this.name = "CliError";
  }
}
