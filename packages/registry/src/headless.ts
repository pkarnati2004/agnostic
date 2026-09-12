import { basename } from "node:path";
import type { HarnessId } from "@agnostic/core";
import { harnessDefinition } from "./harness-list.js";

/**
 * A harness asked to answer once and exit: a script's `claude -p`, not a session anyone works in.
 * `agn adopt` drops these, because adopting one would register a task that is already over.
 * Harness knowledge belongs in the registry, so this is a function over argv rather than a field
 * on `HarnessDefinition` that every tier-2 entry would have to carry.
 */
export function isHeadlessInvocation(harness: HarnessId, args: string[]): boolean {
  const rest = argsAfterBinary(harness, args);
  switch (harness) {
    case "claude-code":
      return beforeSeparator(rest).some(
        (arg) => arg === "-p" || arg === "--print" || flag(arg) === "--output-format",
      );
    case "codex":
      return firstOperand(rest) === "exec";
    case "pi":
      return rest.some((arg) => arg === "-p" || arg === "--print");
    case "opencode":
      return firstOperand(rest) === "run";
    default:
      // A tier-2 harness is launch and attach only: agn knows no headless form to recognise.
      return false;
  }
}

/**
 * `ps` reports the whole command line, and a harness installed as a script runs under its
 * interpreter, so the harness's own token is the first one named after it.
 */
function argsAfterBinary(harness: HarnessId, args: string[]): string[] {
  const { processNames } = harnessDefinition(harness);
  const index = args.findIndex((arg) => {
    const name = basename(arg);
    return processNames.some((wanted) =>
      wanted.endsWith("-") ? name.startsWith(wanted) : name === wanted,
    );
  });
  return args.slice(index === -1 ? 1 : index + 1);
}

/** Everything after `--` is the prompt, where a `-p` is text and not a flag. */
function beforeSeparator(args: string[]): string[] {
  const end = args.indexOf("--");
  return end === -1 ? args : args.slice(0, end);
}

function firstOperand(args: string[]): string | null {
  return args.find((arg) => !arg.startsWith("-")) ?? null;
}

/** `--output-format=json` and `--output-format json` are the same flag. */
function flag(arg: string): string {
  return arg.split("=")[0] ?? arg;
}
