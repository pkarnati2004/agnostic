import { createInterface } from "node:readline/promises";
import {
  type DoctorResponse,
  type HarnessReport,
  type PlanOption,
  type Plans,
  type PlanVendor,
  PlanVendorSchema,
} from "@agnostic/core";
import type { Command } from "commander";
import type { CliContext } from "../context.js";

const VENDORS: readonly PlanVendor[] = PlanVendorSchema.options;

/** `--plan claude=max20`, repeatable. The plan itself is not checked here: the catalog knows. */
export function parsePlanFlags(command: Command, flags: string[]): Plans {
  const plans: Plans = {};
  for (const flag of flags) {
    const [vendor, ...rest] = flag.split("=");
    const plan = rest.join("=");
    if (vendor === undefined || !isVendor(vendor) || plan === "") {
      return command.error(
        `error: --plan takes <vendor>=<plan>, where vendor is one of ${VENDORS.join(", ")}`,
        { exitCode: 2, code: "commander.invalidArgument" },
      );
    }
    plans[vendor] = plan;
  }
  return plans;
}

function isVendor(value: string): value is PlanVendor {
  return (VENDORS as readonly string[]).includes(value);
}

/** The cell in doctor's plan column: what agn knows, and how sure it is of it. */
export function planCell(row: HarnessReport): string {
  if (row.planVendor === null || row.path === null) {
    return "-";
  }
  if (row.plan === null) {
    return "unknown";
  }
  if (row.plan.overridden !== null) {
    return `${row.plan.value} (detected ${row.plan.overridden} not in catalog)`;
  }
  if (!row.plan.known) {
    return `${row.plan.value} (not in catalog)`;
  }
  return row.plan.source === "config" ? `${row.plan.value} (config)` : row.plan.value;
}

/** Installed, logged in, billed by plan, and either agn cannot say which one or it doubts it. */
export function unknownPlans(response: DoctorResponse): HarnessReport[] {
  return response.harnesses.filter(
    (row) =>
      row.path !== null &&
      row.login === "logged-in" &&
      row.planVendor !== null &&
      (row.plan === null || !row.plan.confirmed),
  );
}

/** What a pipe gets instead of the prompt: the flag, and the plans the catalog knows. */
export function planHint(row: HarnessReport, options: PlanOption[]): string {
  const names = options
    .filter((option) => option.vendor === row.planVendor)
    .map((option) => option.id)
    .join("|");
  const flag = `agn doctor --plan ${row.planVendor}=<${names}>`;
  if (row.plan === null) {
    return `plan unknown for ${row.harness}: ${flag}`;
  }
  return `${row.harness} lists models that plan ${row.plan.value} does not include: ${flag}`;
}

/**
 * Asks, once, for a plan agn could not detect. This is the one place the CLI behaves differently
 * on a terminal than in a pipe (ADR 012, amended by ADR 018): a pipe gets the same fact as a line
 * naming the flag, because there is nobody there to answer.
 */
export async function askForPlans(
  ctx: CliContext,
  response: DoctorResponse,
): Promise<Plans | null> {
  const asked: Plans = {};
  const reader = lineReader(ctx);
  try {
    for (const row of unknownPlans(response)) {
      const vendor = row.planVendor;
      if (vendor === null || asked[vendor] !== undefined) {
        continue;
      }
      const options = response.planOptions.filter((option) => option.vendor === vendor);
      if (options.length === 0) {
        continue;
      }
      const answer = await ask(ctx, row, options, reader.next);
      if (answer !== null) {
        asked[vendor] = answer;
      }
    }
  } finally {
    reader.close();
  }
  return Object.keys(asked).length === 0 ? null : asked;
}

async function ask(
  ctx: CliContext,
  row: HarnessReport,
  options: PlanOption[],
  next: (prompt: string) => Promise<string | null>,
): Promise<string | null> {
  const doubt =
    row.plan === null ? "" : ` (config says ${row.plan.value}, and its models say otherwise)`;
  ctx.io.out(`which plan are you on for ${row.name}?${doubt}`);
  for (const [index, option] of options.entries()) {
    ctx.io.out(`  ${index + 1}) ${option.displayName}`);
  }
  // "other" carries a plan the catalog has not learned yet through untouched, rather than forcing
  // a wrong answer; billing stays unknown until the catalog has a row for it.
  ctx.io.out(`  ${options.length + 1}) other`);
  const reply = (await next("plan: "))?.trim() ?? "";
  const chosen =
    options[Number(reply) - 1] ??
    options.find((option) => option.id.toLowerCase() === reply.toLowerCase());
  if (chosen) {
    return chosen.id;
  }
  if (reply === String(options.length + 1)) {
    const other = (await next("plan name: "))?.trim() ?? "";
    return other === "" ? null : other;
  }
  // Nothing recognisable, including an empty line, leaves the plan unknown rather than guessed.
  if (reply !== "") {
    ctx.io.out(`"${reply}" is not one of those, so no plan was recorded`);
  }
  return null;
}

/**
 * One reader for the whole conversation: a second `createInterface` over the same stream would
 * find the lines the first one had already buffered gone.
 */
function lineReader(ctx: CliContext): {
  next: (prompt: string) => Promise<string | null>;
  close: () => void;
} {
  const rl = createInterface({ input: ctx.stdin, terminal: false });
  const iterator = rl[Symbol.asyncIterator]();
  return {
    next: async (prompt) => {
      ctx.io.out(prompt);
      const line = await iterator.next();
      return line.done ? null : line.value;
    },
    close: () => {
      rl.close();
    },
  };
}
