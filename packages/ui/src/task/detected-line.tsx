import type { Profile } from "@agnostic/core";
import { HarnessMark } from "../profile/harness-mark";

/**
 * Which coding agents this machine has, as their marks, in the order the registry reported them.
 * An agent that is not installed is left out: the card's "Worth trying" is where one of those is
 * named, with the step that enables it.
 */
export function DetectedLine({ profiles }: { profiles: Profile[] }) {
  const harnesses = available(profiles);
  if (harnesses.length === 0) {
    return null;
  }
  return (
    <span className="flex items-center gap-1.5">
      Detected
      <span className="flex items-center gap-1">
        {harnesses.map((harness) => (
          <HarnessMark key={harness} harness={harness} />
        ))}
      </span>
    </span>
  );
}

/** One mark per harness, however many profiles it has: the line is about the agents, not the models. */
function available(profiles: Profile[]): string[] {
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (profile.available) {
      seen.add(profile.harness);
    }
  }
  return [...seen];
}
