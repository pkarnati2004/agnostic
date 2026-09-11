import { CoreError, type CoreErrorOptions } from "@agnostic/core";

export class RegistryError extends CoreError {
  constructor(message: string, opts: CoreErrorOptions) {
    super(message, opts);
    this.name = "RegistryError";
  }
}
