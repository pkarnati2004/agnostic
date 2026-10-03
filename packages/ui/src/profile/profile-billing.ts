import type { Billing, Profile } from "@agnostic/core";

/** A recommendation and a task row carry profile ids; what one costs is the profile list's to say. */
export function profileBilling(profiles: Profile[], profileId: string): Billing | null {
  return profiles.find((profile) => profile.id === profileId)?.billing ?? null;
}
