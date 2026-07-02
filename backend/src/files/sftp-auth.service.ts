import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

export interface SftpAuthResult {
  allowed: boolean;
  serverUuid?: string;
  readOnly?: boolean;
}

// Authentifie les connexions SFTP du daemon (Elysia Node) : le client SFTP
// se connecte avec le username "<compte>.<uuidServeurCourt>" (8 premiers
// caractères de l'UUID, comme Pterodactyl Wings) et le mot de passe du
// compte panel. Appelé uniquement par le daemon via NodeSecretGuard, jamais
// depuis le dashboard.
@Injectable()
export class SftpAuthService {
  private readonly logger = new Logger(SftpAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async authenticate(username: string, password: string): Promise<SftpAuthResult> {
    const separatorIndex = username.lastIndexOf('.');
    if (separatorIndex <= 0) return { allowed: false };

    const accountUsername = username.slice(0, separatorIndex);
    const serverShort = username.slice(separatorIndex + 1);
    if (serverShort.length < 4) return { allowed: false };

    const user = await this.auth.validateLocalUserByUsername(accountUsername, password);
    if (!user) return { allowed: false };

    const candidates = await this.prisma.server.findMany({
      where: { uuid: { startsWith: serverShort } },
      include: { subUsers: { where: { userId: user.id } } },
    });
    if (candidates.length !== 1) {
      if (candidates.length > 1) {
        this.logger.warn(`Préfixe d'UUID SFTP ambigu: ${serverShort}`);
      }
      return { allowed: false };
    }
    const server = candidates[0];

    const isAdmin = user.permissions.includes('*');
    const isOwner = server.ownerId === user.id;
    const subUser = server.subUsers[0];

    if (isAdmin || isOwner) {
      return { allowed: true, serverUuid: server.uuid, readOnly: false };
    }
    if (subUser?.permissions.includes('files.read')) {
      return { allowed: true, serverUuid: server.uuid, readOnly: !subUser.permissions.includes('files.write') };
    }
    return { allowed: false };
  }
}
