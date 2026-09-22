import { CoreError, type CoreErrorOptions } from "@agnostic/core";

export class HooksError extends CoreError {
  constructor(message: string, opts: CoreErrorOptions) {
    super(message, opts);
    this.name = "HooksError";
  }
}

export function configUnreadable(file: string, cause: unknown): HooksError {
  return new HooksError(`${file} is not a hook config agn can read`, {
    code: "hook-config-unreadable",
    hint: `Fix the syntax in ${file}, or move it aside, then run \`agn hooks install\` again.`,
    cause,
  });
}

/** A config in a dialect agn does not write - Devin's JSONC - so the user pastes the entries in. */
export function configUnsupported(file: string, entries: string): HooksError {
  return new HooksError(`${file} is not JSON agn can edit`, {
    code: "hook-config-unsupported",
    hint: `agn writes JSON and will not drop the comments in ${file}. Add these hooks by hand:\n${entries}`,
  });
}

export function configUnwritable(file: string, cause: unknown): HooksError {
  return new HooksError(`agn could not write ${file}`, {
    code: "hook-config-unwritable",
    hint: `Check that ${file} and the directory holding it are writable.`,
    cause,
  });
}
