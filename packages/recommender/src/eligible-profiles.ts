import type { Preferences, Profile } from "@agnostic/core";

/**
 * The profiles this repo allows a task to run on. Everything here is a hard filter: a profile that
 * fails one is never the pick, the alternative, or a tiebreak, whatever the evidence says.
 */
export function eligibleProfiles(profiles: Profile[], prefs: Preferences): Profile[] {
  return profiles.filter((profile) => {
    if (!profile.available || profile.tier !== 1) {
      return false;
    }
    // `unknown` billing may well be an API key, so subscriptions_only drops it with the rest.
    if (prefs.subscriptionsOnly && profile.billing !== "subscription") {
      return false;
    }
    return prefs.allowLocal || profile.route !== "local";
  });
}
