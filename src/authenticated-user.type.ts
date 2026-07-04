import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;       // primary role — determines dashboard & nav
  roles: UserRole[];    // all roles including additional ones — used by RolesGuard
  fullName: string;
}
