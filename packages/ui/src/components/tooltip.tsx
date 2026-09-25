// Copied from shadcn/ui `tooltip`, MIT (c) shadcn. shadcn wraps every Tooltip in its own Provider;
// here the app mounts one Provider at the root, so its delay is the delay everywhere. The design
// draws no arrow: the tooltip is a small floating card, not a speech bubble.
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";
import { cn } from "../class-names";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit rounded-md border border-input bg-secondary px-2.5 py-1.5 text-foreground",
          "type-meta shadow-floating",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
