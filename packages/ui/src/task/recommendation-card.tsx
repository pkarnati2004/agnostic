import type { Profile, Recommendation } from "@agnostic/core";
import { ShieldAlert } from "lucide-react";
import { Badge } from "../components/badge";
import { FailureNotice } from "../notice/failure-notice";
import { profileBilling } from "../profile/profile-billing";
import { ProfileChip } from "../profile/profile-chip";
import { EvidenceBadge } from "./evidence-badge";
import type { RecommendationState } from "./use-recommendation";

export type RecommendationCardProps = {
  state: RecommendationState;
  /** Where the billing of a named profile comes from: a recommendation carries ids only. */
  profiles: Profile[];
  /** The handoff dialog and the palette have no room for the sources row. */
  compact?: boolean;
};

/**
 * agn's pick for the prompt: who would run it, why, and how much that rests on. With no evidence at
 * all the card says so rather than dressing a default up as a finding (brief §6).
 */
export function RecommendationCard(props: RecommendationCardProps) {
  const { state } = props;
  return (
    <section
      data-evidence={state.recommendation?.recommended.evidence}
      aria-busy={state.status === "pending"}
      className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-3.5 type-body"
    >
      <Body {...props} />
    </section>
  );
}

function Body({ state, profiles, compact = false }: RecommendationCardProps) {
  if (state.status === "error" && state.error !== null) {
    return <FailureNotice error={state.error} className="border-b-0 p-0" />;
  }
  const recommendation = state.recommendation;
  if (recommendation === null) {
    return (
      <p className="text-muted-foreground">
        {state.status === "pending" ? "Asking agn…" : "Type a prompt to see agn's pick."}
      </p>
    );
  }
  return (
    <>
      <Pick recommendation={recommendation} profiles={profiles} compact={compact} />
      {recommendation.recommended.evidence !== "none" && (
        <Others recommendation={recommendation} profiles={profiles} />
      )}
      {recommendation.riskNote !== null && <Risk note={recommendation.riskNote} />}
    </>
  );
}

type PartProps = { recommendation: Recommendation; profiles: Profile[] };

/** The pick itself: what it is called, what it costs, why it won, and what the reason was read from. */
function Pick({ recommendation, profiles, compact }: PartProps & { compact: boolean }) {
  const { recommended } = recommendation;
  const bare = recommended.evidence === "none";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground type-label">
          {bare ? "Your default" : "Recommended"}
        </span>
        <EvidenceBadge level={recommended.evidence} />
      </div>
      <ProfileChip
        profileId={recommended.profileId}
        billing={profileBilling(profiles, recommended.profileId)}
        variant="column"
      />
      <p className="text-muted-foreground">
        {bare ? "No evidence; using your default." : recommended.reason}
      </p>
      {!compact && recommended.sources.length > 0 && (
        <div className="flex flex-wrap gap-[5px]">
          {recommended.sources.map((source) => (
            <Badge key={source} variant="tag">
              {source}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** What else agn considered: the runner-up, and the one that would need setting up first. */
function Others({ recommendation, profiles }: PartProps) {
  const { alternative, worthTrying } = recommendation;
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 border-border border-t pt-2.5 type-meta">
      <span className="text-muted-foreground">Alternative</span>
      <div className="flex min-w-0 flex-wrap items-center gap-[7px]">
        {alternative === null ? (
          <span className="text-muted-foreground">none</span>
        ) : (
          <>
            <ProfileChip
              profileId={alternative.profileId}
              billing={profileBilling(profiles, alternative.profileId)}
            />
            <span className="text-muted-foreground">{alternative.reason}</span>
          </>
        )}
      </div>
      {worthTrying !== null && (
        <>
          <span className="text-muted-foreground">Worth trying</span>
          <div className="flex min-w-0 flex-wrap items-center gap-[7px]">
            <ProfileChip
              profileId={worthTrying.profileId}
              billing={profileBilling(profiles, worthTrying.profileId)}
              dim
            />
            <span className="text-muted-foreground">{worthTrying.reason}</span>
            <Badge variant="tag">{worthTrying.enable}</Badge>
          </div>
        </>
      )}
    </div>
  );
}

/** A matched `risk_rules` area. The tint is the budget's, which is the page's one "look at this". */
function Risk({ note }: { note: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-[7px] px-2.5 py-2.5"
      style={{ backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}
    >
      <ShieldAlert
        aria-hidden
        className="mt-[3px] size-3.5 shrink-0"
        style={{ color: "var(--warning)" }}
      />
      <p style={{ color: "color-mix(in srgb, var(--warning) 45%, var(--foreground))" }}>
        Risk: {note}
      </p>
    </div>
  );
}
