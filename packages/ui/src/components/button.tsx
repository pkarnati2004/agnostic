// Copied from shadcn/ui `button`, MIT (c) shadcn. The variant tables are plain records merged
// through cn(), so the copy needs no class-variance-authority.
import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "../class-names";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm " +
  "font-medium outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] " +
  "focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
  outline:
    "border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
};

const SIZES: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
  icon: "size-8",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}
