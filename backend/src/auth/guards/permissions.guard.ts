import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

// L'admin système (rôle "admin", flag isSystem) passe toujours : voir RolesService.
const WILDCARD = '*';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) throw new ForbiddenException('Utilisateur non authentifié');

    if (user.permissions.includes(WILDCARD)) return true;

    const hasAll = required.every((perm) => user.permissions.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException(
        `Permissions manquantes: ${required.filter((p) => !user.permissions.includes(p)).join(', ')}`,
      );
    }
    return true;
  }
}
