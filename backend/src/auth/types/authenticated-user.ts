export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  roleId: string | null;
  permissions: string[];
  impersonatedBy?: string;
}
