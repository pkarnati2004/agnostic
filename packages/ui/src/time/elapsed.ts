const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago something happened, to two units at most: "4m", "1h 12m", "2d 3h". The header and
 * the status pill read in one glance, so seconds are noise and anything under a minute is "0m".
 * `agn outcomes` counts a finished run to the second; this counts a clock that is still running.
 */
export function formatElapsed(fromIso: string, now: number): string {
  const since = Math.max(0, now - Date.parse(fromIso));
  if (since < HOUR) {
    return `${Math.floor(since / MINUTE)}m`;
  }
  if (since < DAY) {
    return `${Math.floor(since / HOUR)}h ${Math.floor((since % HOUR) / MINUTE)}m`;
  }
  return `${Math.floor(since / DAY)}d ${Math.floor((since % DAY) / HOUR)}h`;
}
