import { useCallback, useEffect, useRef, useState } from "react";

/** One line the page says about something that already happened, with at most one thing to do
 * about it. An archive offers Resume; a failure offers nothing. */
export type ToastState = {
  message: string;
  tone: "info" | "error";
  action: { label: string; run(): void } | null;
};

/** Long enough to read the line and reach its button, short enough to stay out of the way. */
const TOAST_TTL_MS = 8000;

/** One toast at a time: a second one replaces the first, and its own clock starts over. */
export function useToast(ttlMs: number = TOAST_TTL_MS): {
  toast: ToastState | null;
  show(toast: ToastState): void;
  dismiss(): void;
} {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const show = useCallback(
    (next: ToastState) => {
      cancel();
      setToast(next);
      timer.current = setTimeout(() => {
        timer.current = null;
        setToast(null);
      }, ttlMs);
    },
    [cancel, ttlMs],
  );

  const dismiss = useCallback(() => {
    cancel();
    setToast(null);
  }, [cancel]);

  return { toast, show, dismiss };
}
