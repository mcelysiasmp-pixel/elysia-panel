import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { group: 'asc' } });
  }

  create(name: string, description: string | undefined, actorId: string) {
    return this.prisma.role.create({ data: { name, description } }).then((role) => {
      this.audit.log({ actorId, action: 'role.create', targetType: 'Role', targetId: role.id });
      return role;
    });
  }

  async setPermissions(roleId: string, permissionKeys: string[], actorId: string) {
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);

    await this.audit.log({
      actorId,
      action: 'role.set_permissions',
      targetType: 'Role',
      targetId: roleId,
      metadata: { permissions: permissionKeys },
    });

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async delete(roleId: string, actorId: string) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id: roleId } });
    if (role.isSystem) {
      throw new BadRequestException('Impossible de supprimer un rôle système');
    }
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.log({ actorId, action: 'role.delete', targetType: 'Role', targetId: roleId });
  }
}
