// From shadcn/ui (MIT © shadcn).
// The variant table is a plain record. `outline` is the design's route and billing badge, `tag` a
// source, `count` a number beside a heading or a tab, and `alert` that same count when what it
// counts is waiting for you.
import type { ComponentProps } from "react";
import { cn } from "../class-names";

type BadgeVariant = "default" | "secondary" | "outline" | "tag" | "count" | "alert";

const BASE =
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap " +
  "[&>svg]:size-3 [&>svg]:pointer-events-none";

const VARIANTS: Record<BadgeVariant, string> = {
  default:
    "rounded-md border border-transparent bg-primary px-2 py-0.5 font-medium text-primary-foreground text-xs",
  secondary:
    "rounded-md border border-transparent bg-secondary px-2 py-0.5 font-medium text-secondary-foreground text-xs",
  outline: "rounded border border-input px-1.5 text-[10.5px] text-muted-foreground",
  tag: "rounded bg-muted px-1.5 font-mono text-[10.5px] text-muted-foreground",
  count: "rounded-lg bg-secondary px-1.5 text-[10.5px] text-muted-foreground",
  alert:
    "rounded-lg bg-[color-mix(in_srgb,var(--status-waiting)_16%,transparent)] px-1.5 " +
    "font-semibold text-[10.5px] text-[var(--status-waiting)]",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return <span data-slot="badge" className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}
