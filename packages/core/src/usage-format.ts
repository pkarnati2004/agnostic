import type { UsageWindow } from "./usage.js";

/** The scales a token count is read at; anything smaller is printed as it is. */
const UNITS = [
  { scale: 1_000_000_000, suffix: "B" },
  { scale: 1_000_000, suffix: "M" },
  { scale: 1_000, suffix: "k" },
];

const SIGNIFICANT = 3;

// Named in English rather than by locale, so `agn usage` and the page read the same wherever agn runs.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** How old a figure is, in the one unit the reader needs: minutes, then hours, then days. */
export function formatAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

/** The clock time on its own while the reset is today, and the weekday too once it is not. */
export function formatReset(iso: string, now: Date): string {
  const at = new Date(iso);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === now.toDateString() ? time : `${DAYS[at.getDay()]} ${time}`;
}

/** The day the window starts, in the zone the daemon computed it in. */
export function windowHeading(window: UsageWindow): string {
  const since = new Date(window.since);
  const date = [
    since.getFullYear(),
    String(since.getMonth() + 1).padStart(2, "0"),
    String(since.getDate()).padStart(2, "0"),
  ].join("-");
  return window.kind === "day" ? date : `from ${DAYS[since.getDay()]} ${date}`;
}

/**
 * A token count to three significant figures: 999, 1k, 1.23k, 12.1M, 274M. Three figures is
 * enough to compare two plans and short enough to sit in a line of prose.
 */
export function formatTokens3(tokens: number | null): string {
  if (tokens === null) {
    return "-";
  }
  const rounded = significant(tokens);
  for (const { scale, suffix } of UNITS) {
    if (Math.abs(rounded) >= scale) {
      return `${decimal(rounded / scale)}${suffix}`;
    }
  }
  return decimal(rounded);
}

/** Rounded before it is scaled, so 999,999 reads 1M rather than 1000k. */
function significant(value: number): number {
  if (value === 0) {
    return 0;
  }
  const factor = 10 ** (Math.floor(Math.log10(Math.abs(value))) - (SIGNIFICANT - 1));
  return Math.round(value / factor) * factor;
}

/** The decimals left after three figures, with the zeros that carry no information dropped. */
function decimal(value: number): string {
  const magnitude = Math.abs(value);
  const places = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  const text = value.toFixed(places);
  return places === 0 ? text : text.replace(/\.?0+$/, "");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
