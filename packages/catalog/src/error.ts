import { CoreError, type CoreErrorOptions } from "@agnostic/core";

export class CatalogError extends CoreError {
  constructor(message: string, opts: CoreErrorOptions) {
    super(message, opts);
    this.name = "CatalogError";
  }
}
