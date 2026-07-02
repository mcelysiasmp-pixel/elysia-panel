import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

interface OAuthProfile {
  provider: 'discord' | 'google' | 'github';
  providerId: string;
  email: string;
  username: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('Email ou nom d\'utilisateur déjà utilisé');
    }

    const clientRole = await this.prisma.role.findUnique({ where: { name: 'client' } });
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        roleId: clientRole?.id,
      },
    });

    await this.audit.log({
      actorId: user.id,
      action: 'auth.register',
      targetType: 'User',
      targetId: user.id,
      ip,
    });

    return this.issueTokenPair(user.id, ip);
  }

  async validateLocalUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(userId: string, totpCode: string | undefined, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.twoFactorEnabled) {
      if (!totpCode) {
        return { requiresTwoFactor: true };
      }
      const valid = this.verifyTotp(user.twoFactorSecret!, totpCode);
      const recoveryUsed = !valid && user.twoFactorRecoveryCodes.includes(totpCode);
      if (!valid && !recoveryUsed) {
        throw new UnauthorizedException('Code 2FA invalide');
      }
      if (recoveryUsed) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            twoFactorRecoveryCodes: user.twoFactorRecoveryCodes.filter((c) => c !== totpCode),
          },
        });
      }
    }

    await this.audit.log({ actorId: user.id, action: 'auth.login', ip });
    return this.issueTokenPair(user.id, ip, userAgent);
  }

  async refresh(refreshTokenPlain: string, ip?: string) {
    const tokenHash = this.hashToken(refreshTokenPlain);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // Rotation : on révoque l'ancien et on en émet un nouveau
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.issueTokenPair(stored.userId, ip);
  }

  async logout(refreshTokenPlain: string) {
    const tokenHash = this.hashToken(refreshTokenPlain);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  // Utilisé par le WebSocket Gateway (handshake non-HTTP, pas de passe par
  // JwtAuthGuard) pour authentifier une connexion socket avec le même
  // access token que l'API REST.
  async resolveUserFromAccessToken(token: string): Promise<AuthenticatedUser> {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(token, { secret: this.config.get<string>('jwt.accessSecret') });
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Compte invalide');
    }

    const permissions = user.role
      ? user.role.isSystem && user.role.name === 'admin'
        ? ['*']
        : user.role.permissions.map((rp) => rp.permission.key)
      : [];

    return { id: user.id, email: user.email, username: user.username, roleId: user.roleId, permissions };
  }

  async validateOAuthLogin(profile: OAuthProfile) {
    const providerField = `${profile.provider}Id` as 'discordId' | 'googleId' | 'githubId';

    let user = await this.prisma.user.findFirst({
      where: { [providerField]: profile.providerId },
    });

    if (!user) {
      const clientRole = await this.prisma.role.findUnique({ where: { name: 'client' } });
      user = await this.prisma.user.upsert({
        where: { email: profile.email },
        update: { [providerField]: profile.providerId },
        create: {
          email: profile.email,
          username: `${profile.username}_${profile.providerId}`.slice(0, 32),
          roleId: clientRole?.id,
          [providerField]: profile.providerId,
        },
      });
    }

    return user;
  }

  // ---------------------------------------------------------------------
  // 2FA (TOTP)
  // ---------------------------------------------------------------------

  async generateTwoFactorSecret(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = speakeasy.generateSecret({
      name: `Elysia Panel (${user.email})`,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url!);
    return { secret: secret.base32, qrCodeDataUrl };
  }

  async enableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret) {
      throw new UnauthorizedException('Aucun secret 2FA en attente de confirmation');
    }
    if (!this.verifyTotp(user.twoFactorSecret, code)) {
      throw new UnauthorizedException('Code 2FA invalide');
    }

    const recoveryCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex'),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorRecoveryCodes: recoveryCodes },
    });

    return { recoveryCodes };
  }

  async disableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret || !this.verifyTotp(user.twoFactorSecret, code)) {
      throw new UnauthorizedException('Code 2FA invalide');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] },
    });
  }

  private verifyTotp(secret: string, code: string): boolean {
    return speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
  }

  // ---------------------------------------------------------------------
  // Impersonation (admin uniquement, vérifié au niveau du controller via
  // RequirePermissions('users.impersonate'))
  // ---------------------------------------------------------------------

  async impersonate(adminId: string, targetUserId: string, ip?: string) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
    await this.audit.log({
      actorId: adminId,
      action: 'auth.impersonate',
      targetType: 'User',
      targetId: target.id,
      severity: 'WARNING',
      ip,
    });

    const accessToken = this.jwt.sign(
      { sub: target.id, impersonatedBy: adminId },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl') as any,
      },
    );
    return { accessToken };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async issueTokenPair(userId: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: userId },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl') as any,
      },
    );

    const refreshTokenPlain = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(refreshTokenPlain);
    const ttlMs = this.parseTtlToMs(this.config.get<string>('jwt.refreshTtl') ?? '30d');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        ip,
        userAgent,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return { accessToken, refreshToken: refreshTokenPlain };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
    return value * unitMs;
  }
}
