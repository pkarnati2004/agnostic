import { X } from "lucide-react";
import { cn } from "../class-names";
import { Button } from "../components/button";
import type { ToastState } from "./use-toast";

/** What the page says after an action that moved something out of sight. It takes itself away. */
export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  if (toast === null) {
    return null;
  }
  return (
    <div
      role="status"
      data-tone={toast.tone}
      className={cn(
        "-translate-x-1/2 fixed bottom-10 left-1/2 z-50 flex items-center gap-3 rounded-[9px]",
        "border border-border bg-popover py-2 pr-2.5 pl-3 text-[12.5px] shadow-floating",
        toast.tone === "error" && "text-destructive",
      )}
    >
      <span className="text-popover-foreground">{toast.message}</span>
      {toast.action !== null && (
        <Button variant="secondary" size="sm" onClick={toast.action.run}>
          {toast.action.label}
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
        <X />
      </Button>
    </div>
  );
}
