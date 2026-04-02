import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, configureAuth } from "@vugraph/ui";
import { App } from "./App.tsx";
import "./styles.css";

configureAuth({ loginPath: "/spectator/login" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/spectator">
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
