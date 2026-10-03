import type { Billing } from "@agnostic/core";
import { cn } from "../class-names";
import { Badge } from "../components/badge";
import { billingLabel } from "./billing-label";
import { HarnessMark } from "./harness-mark";
import { profileParts } from "./profile-parts";

/** Where the chip is drawn: beside a row, in the task header, in a select, over a compare column. */
export type ChipVariant = "mark" | "inline" | "option" | "column";

const TEXT: Record<Exclude<ChipVariant, "mark">, string> = {
  inline: "type-mono",
  option: "type-mono-lg",
  column: "type-mono-lg",
};

/**
 * Which agent is running, in the space the place allows: the harness mark, then the model as a live
 * string, then one badge. The route says something the mark does not only when it is not the
 * harness's own, so `native` gives the billing the badge instead (design §2, brief §6).
 */
export function ProfileChip({
  profileId,
  billing,
  variant = "inline",
  dim = false,
}: {
  profileId: string;
  billing?: Billing | null;
  variant?: ChipVariant;
  /** A finished task's chip sits behind the live ones. */
  dim?: boolean;
}) {
  const { harness, model, route } = profileParts(profileId);
  const size = variant === "column" ? "column" : "row";
  if (variant === "mark") {
    return <HarnessMark harness={harness} dim={dim} />;
  }
  const label = billing == null ? null : billingLabel(billing);
  const badges = variant === "column" ? [route, label] : [route === "native" ? label : route];
  return (
    <span
      title={profileId}
      className={cn(
        "inline-flex min-w-0 items-center gap-[7px]",
        variant === "column" && "flex-wrap",
      )}
    >
      <HarnessMark harness={harness} size={size} dim={dim} />
      <span className={cn("min-w-0 truncate", TEXT[variant])}>
        {model === null ? harness : `${harness} · ${model}`}
      </span>
      {badges.map((badge) =>
        badge === null ? null : (
          <Badge key={badge} variant="outline">
            {badge}
          </Badge>
        ),
      )}
    </span>
  );
}
