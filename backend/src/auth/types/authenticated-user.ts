export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  roleId: string | null;
  permissions: string[];
  twoFactorEnabled: boolean;
  impersonatedBy?: string;
}
