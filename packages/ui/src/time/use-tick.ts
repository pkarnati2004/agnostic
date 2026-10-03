import { useEffect, useState } from "react";

/** A render on a timer, not a fetch: nothing in the workspace polls the daemon (brief §5). */
export function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
