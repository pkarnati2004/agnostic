// Copied from shadcn/ui `badge`, MIT (c) shadcn. The variant table is a plain record.
import type { ComponentProps } from "react";
import { cn } from "../class-names";

type BadgeVariant = "default" | "secondary" | "outline";

const BASE =
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md " +
  "border px-2 py-0.5 font-medium text-xs [&>svg]:size-3 [&>svg]:pointer-events-none";

const VARIANTS: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "border-border text-foreground",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return <span data-slot="badge" className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}
