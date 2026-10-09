import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../class-names";

const SHOWN_MS = 1_500;

type CopyButtonProps = {
  /** Null disables the button: the nav footer has no path until `GET /config` answers. */
  text: string | null;
  label: string;
  className?: string;
};

/**
 * Copies one line and says so for a moment. A browser that refuses the clipboard - no permission,
 * no secure context - is silent: there is nothing the reader could do about it from here.
 */
export function CopyButton({ text, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  // The check goes back to a copy icon on its own, and the timer dies with the button: a row that
  // is gone - the dialog closed, the section switched - must not be written to afterwards.
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    if (text === null) {
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  return (
    <button
      type="button"
      aria-label={label}
      disabled={text === null}
      onClick={copy}
      className={cn(
        "rounded text-muted-foreground outline-none hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50",
        className,
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
