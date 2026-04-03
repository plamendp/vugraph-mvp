import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, CentrifugoProvider, NotificationBar, configureAuth } from "@vugraph/ui";
import { App } from "./App.tsx";
import "./styles.css";

configureAuth({ loginPath: "/operator/login" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/operator">
      <AuthProvider>
        <CentrifugoProvider>
          <NotificationBar />
          <App />
        </CentrifugoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
