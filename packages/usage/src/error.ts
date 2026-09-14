import { CoreError, type CoreErrorOptions } from "@agnostic/core";

export class UsageError extends CoreError {
  constructor(message: string, opts: CoreErrorOptions) {
    super(message, opts);
    this.name = "UsageError";
  }
}
