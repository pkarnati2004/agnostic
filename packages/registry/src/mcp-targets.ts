import type { McpTargetFile } from "@agnostic/core";
import { harnesses } from "./harness-list.js";

/** Every file `agn sync` compiles `.ag/mcp.yaml` into, in registry order. */
export function mcpTargets(): McpTargetFile[] {
  return harnesses.flatMap((definition) =>
    definition.mcp === null ? [] : [{ harness: definition.id, ...definition.mcp }],
  );
}
