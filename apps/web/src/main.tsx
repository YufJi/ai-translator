import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@ai-translator/ui/styles.css";
import "./app.css";
import { TranslatorApp } from "./App.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("#root container is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <TranslatorApp />
  </StrictMode>,
);

