import { basename } from "node:path";
import type { HarnessId } from "@agnostic/core";
import { harnessDefinition } from "./harness-list.js";

/**
 * A harness asked to answer once and exit: a script's one-shot run, not a session anyone works in.
 * `agn adopt` drops these, because adopting one would register a task that is already over. The
 * row says what the form looks like, so a harness agn knows no headless form for is never one.
 */
export function isHeadlessInvocation(harness: HarnessId, args: string[]): boolean {
  const detect = harnessDefinition(harness).headlessDetect;
  if (detect === null) {
    return false;
  }
  const rest = argsAfterBinary(harness, args);
  if (detect.kind === "subcommand") {
    return firstOperand(rest) === detect.name;
  }
  const searched = detect.beforeSeparator ? beforeSeparator(rest) : rest;
  return searched.some((arg) => detect.flags.includes(flag(arg)));
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
