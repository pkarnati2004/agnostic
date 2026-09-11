const GUTTER = " ";

/** `key: value` lines with the values aligned, for a command that shows one thing in detail. */
export function renderFields(fields: [string, string][]): string[] {
  const width = Math.max(0, ...fields.map(([key]) => [...key].length));
  return fields.map(
    ([key, value]) => `${key}:${" ".repeat(width - [...key].length)}${GUTTER}${value}`,
  );
}
