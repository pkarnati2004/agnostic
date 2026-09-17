import type { ReactNode } from "react";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";

type IconActionProps = {
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

/** An icon on its own, because the sidebar header and the repo headings have no room for a word. */
export function IconAction({ label, tooltip, children, ...rest }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={rest.onClick}
          disabled={rest.disabled}
          aria-label={label}
          className={rest.className}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
