import { type HarnessId, parseProfileId, type Route } from "@agnostic/core/browser";

export type ProfileParts = { harness: HarnessId; model: string | null; route: Route };

/**
 * The three parts of a profile id, for a row that has to draw one. An id the daemon never wrote
 * cannot be taken apart, and a blank page is the wrong answer to it: the whole string stands in for
 * the harness, so the row still reads and the mark still has a letter.
 */
export function profileParts(id: string): ProfileParts {
  try {
    return parseProfileId(id);
  } catch {
    return { harness: id, model: null, route: "native" };
  }
}
