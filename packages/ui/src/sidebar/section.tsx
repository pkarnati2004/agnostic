import type { ReactNode } from "react";
import { cn } from "../class-names";
import { Badge } from "../components/badge";

/** A label, what it counts, and the rows under it. */
export function Section({
  title,
  count,
  tone = "default",
  children,
}: {
  title: string;
  count?: number;
  /** Waiting turns the label and its count orange: this is the one section that asks for something. */
  tone?: "default" | "waiting";
  children: ReactNode;
}) {
  const waiting = tone === "waiting";
  return (
    <section className="px-2 pt-3">
      <div className="flex items-center gap-2 px-2 pb-1">
        <h2
          className={cn("min-w-0 truncate type-label", !waiting && "text-muted-foreground")}
          style={waiting ? { color: "var(--status-waiting)" } : undefined}
        >
          {title}
        </h2>
        {count !== undefined && <Badge variant={waiting ? "alert" : "count"}>{count}</Badge>}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}
