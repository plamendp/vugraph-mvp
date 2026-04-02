import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { UsersPage } from "./pages/UsersPage.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/users"
        element={
          <ProtectedRoute requiredRole="admin">
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
