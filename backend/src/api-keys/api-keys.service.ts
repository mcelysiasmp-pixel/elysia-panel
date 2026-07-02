import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

const KEY_PREFIX = 'elysia_';
const KEY_BYTES = 32;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // scopes doit être un sous-ensemble des permissions actuelles de l'acteur
  // (sauf wildcard '*' admin, qui peut sélectionner n'importe quelle
  // permission réelle) : une clé API ne doit jamais accorder plus qu'un
  // utilisateur n'a lui-même, sous peine de servir d'échappatoire au RBAC.
  async create(
    actor: AuthenticatedUser,
    name: string,
    scopes: string[],
    expiresAt: Date | undefined,
  ) {
    if (scopes.length === 0) {
      throw new BadRequestException('Sélectionnez au moins une permission');
    }
    if (!actor.permissions.includes('*')) {
      const invalid = scopes.filter((s) => !actor.permissions.includes(s));
      if (invalid.length > 0) {
        throw new ForbiddenException(
          `Vous ne pouvez pas créer une clé avec des permissions que vous n'avez pas: ${invalid.join(', ')}`,
        );
      }
    }

    const raw = `${KEY_PREFIX}${crypto.randomBytes(KEY_BYTES).toString('hex')}`;
    const keyHash = this.hash(raw);
    const keyPrefix = raw.slice(0, KEY_PREFIX.length + 8);

    const record = await this.prisma.apiKey.create({
      data: {
        userId: actor.id,
        name,
        keyPrefix,
        keyHash,
        scopes,
        expiresAt,
      },
    });

    await this.audit.log({
      actorId: actor.id,
      action: 'api_key.create',
      targetType: 'ApiKey',
      targetId: record.id,
      severity: 'WARNING',
      metadata: { name, scopes },
    });

    // La clé en clair n'est renvoyée qu'ici, une seule fois — jamais
    // récupérable ensuite (seul keyPrefix est stocké en clair côté liste).
    return { id: record.id, name: record.name, key: raw, keyPrefix };
  }

  async revoke(id: string, actor: AuthenticatedUser) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Clé API introuvable');
    if (key.userId !== actor.id && !actor.permissions.includes('*')) {
      throw new ForbiddenException("Vous n'avez pas accès à cette clé");
    }
    await this.prisma.apiKey.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      action: 'api_key.revoke',
      targetType: 'ApiKey',
      targetId: id,
      severity: 'WARNING',
    });
  }

  // Appelé par JwtAuthGuard pour les requêtes authentifiées par clé API
  // plutôt que par JWT. Les scopes de la clé sont re-filtrés par les
  // permissions courantes de l'utilisateur à chaque requête (pas figées à
  // la création) : si son rôle perd une permission, les clés qu'il a
  // émises perdent immédiatement cette capacité aussi.
  async validateAndGetUser(rawKey: string): Promise<AuthenticatedUser> {
    const keyHash = this.hash(rawKey);
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!key) throw new UnauthorizedException('Clé API invalide');
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('Clé API expirée');
    }
    const user = key.user;
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Compte invalide');
    }

    const userPermissions = user.role
      ? user.role.isSystem && user.role.name === 'admin'
        ? ['*']
        : user.role.permissions.map((rp) => rp.permission.key)
      : [];
    const permissions = userPermissions.includes('*')
      ? key.scopes
      : key.scopes.filter((s) => userPermissions.includes(s));

    // Fire-and-forget : ne bloque pas la requête pour une mise à jour non
    // critique.
    this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      roleId: user.roleId,
      twoFactorEnabled: user.twoFactorEnabled,
      permissions,
    };
  }

  private hash(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
