import {
  HarnessIdSchema,
  type HookInstallResult,
  type HookResponse,
  HooksInstallRequestSchema,
  type HooksInstallResponse,
} from "@agnostic/core";
import { hookInstaller } from "@agnostic/hooks";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { DaemonError, requestInvalid } from "../error.js";
import { receiveHook } from "../hook-receiver.js";
import { installHooks } from "../hooks-install.js";
import { resolveRepoId } from "../resolve-id.js";

/** A hook payload is a harness's own JSON; a megabyte is more transcript than any of them send. */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

export function hookRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .post("/hooks/:harness", async (c) => {
      // The body is the harness's stdin, verbatim: it is parsed here and nowhere else.
      const text = await c.req.text();
      if (Buffer.byteLength(text, "utf8") > MAX_PAYLOAD_BYTES) {
        throw new DaemonError("that hook payload is too large to be a status event", {
          code: "hook-payload-too-large",
          hint: "Only the harness sends this endpoint; check what is writing to it.",
        });
      }
      const body: HookResponse = await receiveHook(
        ctx,
        c.req.param("harness"),
        c.req.header("x-agn-task-id") ?? "",
        hookPayload(text),
        c.req.header("x-agn-hook-event"),
      );
      return c.json(body);
    })
    .post("/repos/:id/hooks", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const parsed = HooksInstallRequestSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const installs: HookInstallResult[] = [];
      for (const harness of await wanted(ctx, parsed.data.harness)) {
        installs.push(...(await installHooks(ctx, repo, harness)));
      }
      const body: HooksInstallResponse = { installs };
      return c.json(body);
    });
}

/** The harness the caller named, or every installed harness that has a hook to install. */
async function wanted(ctx: DaemonContext, harness: string | undefined) {
  if (harness !== undefined) {
    const parsed = HarnessIdSchema.safeParse(harness);
    if (!parsed.success) {
      throw new DaemonError(`${harness} has no hook agn can install`, {
        code: "hook-unsupported",
        hint: "Name a harness `agn doctor` lists with full support.",
      });
    }
    return [parsed.data];
  }
  const { harnesses } = await ctx.detection.current();
  return harnesses
    .filter((report) => report.path !== null && hookInstaller(report.harness) !== null)
    .map((report) => report.harness);
}

function hookPayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new DaemonError("that hook payload is not JSON", {
      code: "hook-payload-invalid",
      hint: "A hook payload is the JSON object the harness writes to its hook's stdin.",
      cause,
    });
  }
}
