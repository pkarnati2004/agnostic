import type { Recommendation, RecommendationLine, RunTaskRequest } from "@agnostic/core";
import { ArrowLeft } from "lucide-react";
import { profileParts } from "../profile/profile-parts";
import type { PaletteCommand } from "./palette-command";

/**
 * What the palette shows once agn has answered: the recommended profile, the alternative when
 * there is one, and a way back to the commands. Running from here starts the prompt as it was
 * typed, with no title and no spec; "Run: <prompt>" opens the New task tab for those.
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
  const rows: PaletteCommand[] = lines.map((line) => {
    const { harness, model } = profileParts(line.profileId);
    return {
      id: `run-on:${line.profileId}`,
      label: `Run on ${harness}${model === null ? "" : ` · ${model}`}`,
      hint: line.reason,
      fromQuery: false,
      group: "answer",
      icon: null,
      profileId: line.profileId,
      run: () => on.runOn({ prompt, profile: line.profileId }),
    };
  });
  return [
    ...rows,
    {
      id: "back",
      label: "Back",
      hint: null,
      fromQuery: false,
      // The answer's own group, so the list carries one "Recommend" label and no second heading.
      group: "answer",
      icon: ArrowLeft,
      profileId: null,
      run: on.back,
    },
  ];
}
