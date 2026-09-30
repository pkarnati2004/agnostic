import type { Recommendation, RecommendationLine, RunTaskRequest } from "@agnostic/core";
import type { PaletteCommand } from "./palette-command";

/**
 * What the palette shows once agn has answered: the recommended profile, the alternative when
 * there is one, and a way back to the commands. Running from here starts the prompt as it was
 * typed, with no title and no spec; "Run: <prompt>" opens the dialog for those.
 */
export function recommendRows(
  prompt: string,
  recommendation: Recommendation,
  on: { runOn: (body: RunTaskRequest) => void; back: () => void },
): PaletteCommand[] {
  const lines: RecommendationLine[] = [recommendation.recommended];
  if (recommendation.alternative !== null) {
    lines.push(recommendation.alternative);
  }
  const rows = lines.map((line) => ({
    id: `run-on:${line.profileId}`,
    label: `Run on ${line.profileId}`,
    hint: line.reason,
    fromQuery: false,
    run: () => on.runOn({ prompt, profile: line.profileId }),
  }));
  return [...rows, { id: "back", label: "Back", hint: null, fromQuery: false, run: on.back }];
}
