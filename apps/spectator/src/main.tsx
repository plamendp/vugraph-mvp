import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, CentrifugoProvider, NotificationBar, configureAuth } from "@vugraph/ui";
import { App } from "./App.tsx";
import "./styles.css";

configureAuth({ loginPath: "/spectator/login" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/spectator">
      <AuthProvider>
        <CentrifugoProvider>
          <NotificationBar />
          <App />
        </CentrifugoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
