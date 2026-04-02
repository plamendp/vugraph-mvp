import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@vugraph/ui";
import { LoginPage } from "./pages/LoginPage.tsx";
import { MatchListPage } from "./pages/MatchListPage.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/matches"
        element={
          <ProtectedRoute>
            <MatchListPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/matches" replace />} />
    </Routes>
  );
}
