import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

// Permissions granulaires façon "servers.power.start", "nodes.create", ...
// Vérifiées par PermissionsGuard contre les permissions du rôle de l'utilisateur.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
