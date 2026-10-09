import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { createAppearanceRoot, readMirror } from "./styles/appearance-root";
import "./styles/index.css";

// Before React renders, so the page is drawn in the theme this browser chose last rather than
// flashing the base one. `useAppearanceSync` replaces it with config.yaml's when that answers.
const appearance = createAppearanceRoot(
  document.documentElement,
  matchMedia("(prefers-color-scheme: dark)"),
  localStorage,
);
appearance.apply(readMirror(localStorage));

const container = document.getElementById("root");
if (container === null) {
  throw new Error("index.html has no #root element");
}

createRoot(container).render(
  <StrictMode>
    <App root={appearance} />
  </StrictMode>,
);
