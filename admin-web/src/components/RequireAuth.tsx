import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../lib/auth-store';
import type { UserRole } from '../lib/types';

interface RequireAuthProps {
  children: ReactNode;
  roles?: UserRole[];
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles) {
    const userRoles = user.roles ?? [user.role];
    if (!roles.some((r) => userRoles.includes(r))) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
