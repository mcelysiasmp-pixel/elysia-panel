import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../types/authenticated-user';

interface JwtPayload {
  sub: string;
  impersonatedBy?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!user || user.status === 'BANNED') {
      throw new UnauthorizedException('Compte invalide ou banni');
    }
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Compte suspendu');
    }

    const permissions = user.role
      ? user.role.isSystem && user.role.name === 'admin'
        ? ['*']
        : user.role.permissions.map((rp) => rp.permission.key)
      : [];

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      roleId: user.roleId,
      permissions,
      impersonatedBy: payload.impersonatedBy,
    };
  }
}
