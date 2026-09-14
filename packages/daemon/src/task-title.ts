const TITLE_MAX_CHARS = 80;

/** The first line of the prompt, cut at a width a task list can print. */
export function titleFromPrompt(prompt: string): string {
  const first = prompt.split("\n")[0]?.trim() ?? "";
  const title = first.length > TITLE_MAX_CHARS ? first.slice(0, TITLE_MAX_CHARS).trimEnd() : first;
  return title === "" ? "untitled task" : title;
}
