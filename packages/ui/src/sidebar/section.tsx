import type { ReactNode } from "react";
import { cn } from "../class-names";
import { Badge } from "../components/badge";

type HeadingProps = {
  title: string;
  count?: number;
  /** Waiting turns the label and its count orange: this is the one section that asks for something. */
  tone?: "default" | "waiting";
  /** Icon buttons at the right end of the heading, as the Repos heading has. */
  actions?: ReactNode;
};

/** The label over a group of rows: what it is, how many, and anything you can do to the group. */
export function SectionHeading({ title, count, tone = "default", actions }: HeadingProps) {
  const waiting = tone === "waiting";
  return (
    <div className="flex items-center gap-2 px-2 pb-1">
      <h2
        className={cn("min-w-0 truncate type-label", !waiting && "text-muted-foreground")}
        style={waiting ? { color: "var(--status-waiting)" } : undefined}
      >
        {title}
      </h2>
      {count !== undefined && <Badge variant={waiting ? "alert" : "count"}>{count}</Badge>}
      {actions !== undefined && <span className="ml-auto flex items-center gap-1">{actions}</span>}
    </div>
  );
}

/** A label, what it counts, and the rows under it. */
export function Section({
  title,
  count,
  tone = "default",
  children,
}: HeadingProps & { children: ReactNode }) {
  return (
    <section className="px-2 pt-3">
      <SectionHeading title={title} count={count} tone={tone} />
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}
