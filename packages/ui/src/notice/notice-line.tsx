import { CircleX, Info, MessageCircleQuestion, TriangleAlert } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { cn } from "../class-names";

/** Why the line is there: the agent asked something, something may go wrong, something failed, or
 * this is how the task now stands. */
export type NoticeTone = "question" | "warning" | "error" | "info";

type IconProps = { className?: string; style?: CSSProperties };

const ICONS: Record<NoticeTone, ComponentType<IconProps>> = {
  question: MessageCircleQuestion,
  warning: TriangleAlert,
  error: CircleX,
  info: Info,
};

const TOKENS: Record<NoticeTone, string> = {
  question: "--status-waiting",
  warning: "--warning",
  error: "--destructive",
  info: "--muted-foreground",
};

/** Info is the state of things rather than news about it, so it takes no tint. */
const TINT: Record<NoticeTone, number> = { question: 6, warning: 6, error: 8, info: 0 };

/**
 * One line across the top of a pane: an icon in the tone's colour, the sentence, and whatever the
 * caller offers to do about it. Every notice on the page is drawn here, so a failure and a question
 * differ in colour and in nothing else.
 */
export function NoticeLine({
  tone,
  children,
  action,
  role,
  icon,
  className,
}: {
  tone: NoticeTone;
  children: ReactNode;
  /** Right-aligned: Retry, Update now. */
  action?: ReactNode;
  role?: "alert" | "status";
  /** Named when the line is about one thing in particular, as the daemon banner's plug is. */
  icon?: ComponentType<IconProps>;
  /** The sidebar's rows are narrower than a pane: the padding and the hairline give way there. */
  className?: string;
}) {
  const Icon = icon ?? ICONS[tone];
  const colour = `var(${TOKENS[tone]})`;
  const tint = TINT[tone];
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      data-tone={tone}
      className={cn(
        "flex shrink-0 items-start gap-2 border-border border-b px-4 py-2 text-[12.5px]",
        tone === "info" && "text-muted-foreground",
        className,
      )}
      style={{
        backgroundColor:
          tint === 0 ? undefined : `color-mix(in srgb, ${colour} ${tint}%, transparent)`,
        color: tone === "info" ? undefined : `color-mix(in srgb, ${colour} 55%, var(--foreground))`,
      }}
    >
      <Icon className="mt-[2px] size-3.5 shrink-0" style={{ color: colour }} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
