import type { McpTool } from "./tool.js";
import { readTools } from "./tools-read.js";
import { writeTools } from "./tools-write.js";

// Read first: an agent scanning the list meets the tools that cannot cost anything before the four
// that start and stop work (ADR 036 Q11 settled which nine there are).
export const tools: McpTool<unknown>[] = [...readTools, ...writeTools];

export function findTool(name: string): McpTool<unknown> | null {
  return tools.find((tool) => tool.name === name) ?? null;
}
