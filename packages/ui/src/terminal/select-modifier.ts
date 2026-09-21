/** tmux runs with `mouse on` and takes a plain drag, so selecting text needs a modifier. */
export function selectModifier(): "Option" | "Shift" {
  // The same check xterm.js makes, and it decides the same thing: whether Option selects.
  return navigator.platform.startsWith("Mac") ? "Option" : "Shift";
}
