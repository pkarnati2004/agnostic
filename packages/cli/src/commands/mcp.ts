import { Command } from "commander";
import type { CliContext } from "../context.js";
import { serveMcp } from "../mcp/serve.js";

/**
 * The one command whose stdout is not for a person: every byte on it is a protocol line, so it is
 * written directly rather than through `ctx.io`, which a test and `--json` both read as lines.
 */
export function mcpCommand(ctx: CliContext, version: string): Command {
  return new Command("mcp")
    .description("serve agn's commands to an agent over MCP on stdin and stdout")
    .action(async () => {
      await serveMcp(ctx, version, { input: ctx.stdin, output: process.stdout });
    });
}
