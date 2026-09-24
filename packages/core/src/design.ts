import { z } from "zod";
import { formatProfileId, parseProfileId } from "./profile.js";

/** The design tools a task can be handed to. One id per tool, as the user writes it in config. */
export const DesignToolIdSchema = z.enum(["claude-design", "figma"]);
export type DesignToolId = z.infer<typeof DesignToolIdSchema>;

/** `via: "url"` is a tool with no local install: the system opener takes the address. */
export type DesignTool = { id: DesignToolId; name: string; via: "app" | "url"; path: string };

const OTHER = "other:";

/**
 * A design task has no agent, so where every other task records the profile that ran it, it
 * records the tool the human worked in. The tool is a harness agn knows nothing else about,
 * which is what `other:` means, and it has no model.
 */
export function designProfileId(tool: DesignToolId): string {
  return formatProfileId(`${OTHER}${tool}`, null, "native");
}

/** The tool a design task's profile names, or null for every other task. */
export function designToolOf(profileId: string): DesignToolId | null {
  let harness: string;
  let model: string | null;
  try {
    ({ harness, model } = parseProfileId(profileId));
  } catch {
    // Not a profile id at all, so not a design task's either.
    return null;
  }
  if (model !== null || !harness.startsWith(OTHER)) {
    return null;
  }
  const parsed = DesignToolIdSchema.safeParse(harness.slice(OTHER.length));
  return parsed.success ? parsed.data : null;
}
