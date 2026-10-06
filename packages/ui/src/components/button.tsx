// From shadcn/ui (MIT © shadcn).
// The variant tables are plain records merged through cn(), so this file needs no
// class-variance-authority. The values are the design's: 30 px tall, 26 px in a header or a row,
// radius 7, and a ring that sits off the surface.
import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "../class-names";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "icon" | "icon-sm";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] " +
  "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input text-foreground hover:bg-accent",
  ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  // Tinted rather than filled: the one destructive button on the page is a confirmation, not a
  // thing to reach for by accident.
  destructive:
    "bg-[color-mix(in_srgb,var(--destructive)_16%,transparent)] " +
    "text-[color-mix(in_srgb,var(--destructive)_70%,var(--foreground))] " +
    "hover:bg-[color-mix(in_srgb,var(--destructive)_24%,transparent)]",
};

const SIZES: Record<ButtonSize, string> = {
  default: "h-[30px] px-3 text-[13px]",
  sm: "h-[26px] px-[9px] text-[12.5px]",
  icon: "size-[30px]",
  "icon-sm": "size-[26px]",
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
