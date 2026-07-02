import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(params: { skip?: number; take?: number }) {
    return this.prisma.user.findMany({
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  // Résolution email -> id accessible à tout utilisateur authentifié (pas
  // besoin de users.read) : sert à l'ajout de sub-users par un propriétaire
  // de serveur qui n'a pas accès à la liste complète des comptes. Champs
  // volontairement minimaux, et correspondance exacte uniquement (pas de
  // recherche partielle) pour limiter l'énumération de comptes.
  async lookupByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true, email: true },
    });
    if (!user) throw new NotFoundException('Aucun utilisateur avec cet email');
    return user;
  }

  async create(dto: CreateUserDto, actorId: string) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        roleId: dto.roleId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'user.create',
      targetType: 'User',
      targetId: user.id,
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    await this.audit.log({
      actorId,
      action: 'user.update',
      targetType: 'User',
      targetId: id,
      metadata: { ...dto },
    });
    return user;
  }

  async resetPassword(id: string, newPassword: string, actorId: string) {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { revoked: true },
    });
    await this.audit.log({
      actorId,
      action: 'user.reset_password',
      targetType: 'User',
      targetId: id,
      severity: 'WARNING',
    });
  }

  async suspend(id: string, reason: string, actorId: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'SUSPENDED', suspendedReason: reason },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { revoked: true },
    });
    await this.audit.log({
      actorId,
      action: 'user.suspend',
      targetType: 'User',
      targetId: id,
      severity: 'WARNING',
      metadata: { reason },
    });
    return user;
  }

  async ban(id: string, reason: string, actorId: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'BANNED', bannedReason: reason },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { revoked: true },
    });
    await this.audit.log({
      actorId,
      action: 'user.ban',
      targetType: 'User',
      targetId: id,
      severity: 'CRITICAL',
      metadata: { reason },
    });
    return user;
  }

  async reactivate(id: string, actorId: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', suspendedReason: null, bannedReason: null },
    });
    await this.audit.log({
      actorId,
      action: 'user.reactivate',
      targetType: 'User',
      targetId: id,
    });
    return user;
  }

  async delete(id: string, actorId: string) {
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'user.delete',
      targetType: 'User',
      targetId: id,
      severity: 'CRITICAL',
    });
  }
}
