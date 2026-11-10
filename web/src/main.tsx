import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/public-sans";
import "./estilos.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
