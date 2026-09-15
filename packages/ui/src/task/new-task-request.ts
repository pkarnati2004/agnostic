import type { Profile, Recommendation, RecommendRequest, RunTaskRequest } from "@agnostic/core";
import type { IntentOption } from "./intent-options";

export type NewTaskForm = {
  repoId: string;
  prompt: string;
  intent: IntentOption;
  /** What the Profile select shows: the pick until the user picks for themselves. */
  profileId: string | null;
};

/** Null while there is nothing to ask about; the daemon rejects an empty prompt anyway. */
export function recommendRequest(form: NewTaskForm): RecommendRequest | null {
  const prompt = form.prompt.trim();
  if (prompt === "" || form.repoId === "") {
    return null;
  }
  return {
    repoId: form.repoId,
    prompt,
    ...(form.intent === "automatic" ? {} : { intent: form.intent }),
  };
}

/**
 * The run the dialog would make. `profile` is always sent, even when it equals the pick, so the
 * task starts on what the user saw rather than on whatever the repo's default resolves to.
 */
export function runRequest(form: NewTaskForm): RunTaskRequest | null {
  const prompt = form.prompt.trim();
  if (prompt === "" || form.profileId === null) {
    return null;
  }
  return {
    prompt,
    profile: form.profileId,
    ...(form.intent === "automatic" ? {} : { intent: form.intent }),
  };
}

/** The select follows the pick until the user chooses for themselves, and then stops. */
export function followRecommendation(
  current: string | null,
  touched: boolean,
  recommendation: Recommendation | null,
  profiles: Profile[],
): string | null {
  if (touched || recommendation === null) {
    return current;
  }
  const picked = recommendation.recommended.profileId;
  return profiles.some((profile) => profile.id === picked) ? picked : current;
}
