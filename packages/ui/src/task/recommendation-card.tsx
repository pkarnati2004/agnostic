import { HintText } from "../hint-text";
import { recommendationLines } from "./recommendation-lines";
import type { RecommendationState } from "./use-recommendation";

/** agn's pick in the same five lines `agn recommend` prints, with the labels in their own column. */
export function RecommendationCard({ state }: { state: RecommendationState }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 text-sm">
      <Body state={state} />
    </div>
  );
}

function Body({ state }: { state: RecommendationState }) {
  if (state.status === "error" && state.error !== null) {
    return (
      <div>
        <p className="text-destructive">{state.error.message}</p>
        {state.error.hint !== null && (
          <p className="mt-1 text-muted-foreground text-xs">
            <HintText hint={state.error.hint} />
          </p>
        )}
      </div>
    );
  }
  if (state.recommendation === null) {
    return (
      <p className="text-muted-foreground">
        {state.status === "pending" ? "Thinking…" : "Type a prompt to see agn's pick."}
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
      {recommendationLines(state.recommendation).map((line) => (
        <div key={line.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{line.label}</dt>
          <dd className="min-w-0 break-words">{line.text}</dd>
        </div>
      ))}
    </dl>
  );
}
