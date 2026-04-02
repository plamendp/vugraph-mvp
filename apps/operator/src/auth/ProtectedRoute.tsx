import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext.tsx";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  requiredRole?: string;
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && !user.roles.includes(requiredRole as any)) {
    return <div className="error-page">Access denied. You need the <strong>{requiredRole}</strong> role.</div>;
  }

  return <>{children}</>;
}
