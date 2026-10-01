import { type DesignToolId, DesignToolIdSchema } from "@agnostic/core";

/**
 * One row per design tool a design task can run in. `apps` are the bundle names, most common
 * first; `url` is the address the system opener takes when no bundle is installed, and null for
 * a tool that has no web address at all.
 */
export type DesignToolEntry = {
  id: DesignToolId;
  name: string;
  apps: string[];
  url: string | null;
};

// Neither row is confirmed against a live install: see docs/design-tasks.md.
export const designToolList: DesignToolEntry[] = [
  {
    id: "claude-design",
    name: "Claude Design",
    apps: ["Claude.app"],
    url: "https://claude.ai/design",
  },
  { id: "figma", name: "Figma", apps: ["Figma.app"], url: "https://www.figma.com" },
];

/** The row for an id, for a caller that needs the tool's name without detecting the machine. */
export function designToolEntry(id: DesignToolId): DesignToolEntry {
  const found = designToolList.find((entry) => entry.id === id);
  if (found === undefined) {
    // Unreachable while the list covers the enum, which its test pins.
    throw new Error(`no design tool row for ${DesignToolIdSchema.parse(id)}`);
  }
  return found;
}
