import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServersService } from '../servers/servers.service';
import { NodeClientService } from '../grpc-client/node-client.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly servers: ServersService,
    private readonly nodeClient: NodeClientService,
  ) {}

  listForServer(serverId: string, user: AuthenticatedUser) {
    return this.servers.findAccessibleOrThrow(serverId, user).then(() =>
      this.prisma.backup.findMany({ where: { serverId }, orderBy: { createdAt: 'desc' } }),
    );
  }

  async create(serverId: string, name: string, user: AuthenticatedUser) {
    const server = await this.servers.findAccessibleOrThrow(serverId, user);

    const backup = await this.prisma.backup.create({
      data: { serverId, name, driver: 'LOCAL', status: 'PENDING' },
    });

    this.runBackup(backup.id, server.id, server.nodeId, server.uuid, server.node.grpcHost, server.node.grpcPort).catch(
      (err) => this.logger.error(`Backup ${backup.id} a échoué: ${err.message}`),
    );

    await this.audit.log({ actorId: user.id, action: 'backup.create', targetType: 'Server', targetId: serverId });
    return backup;
  }

  private async runBackup(
    backupId: string,
    _serverId: string,
    nodeId: string,
    serverUuid: string,
    grpcHost: string,
    grpcPort: number,
  ) {
    await this.prisma.backup.update({ where: { id: backupId }, data: { status: 'IN_PROGRESS' } });
    try {
      const res = await this.nodeClient.call<any, { success: boolean; size_bytes: string; checksum: string }>(
        nodeId,
        { host: grpcHost, port: grpcPort },
        'CreateBackup',
        { server_uuid: serverUuid, backup_id: backupId, driver: 'LOCAL', driver_config: {} },
      );
      await this.prisma.backup.update({
        where: { id: backupId },
        data: {
          status: res.success ? 'COMPLETED' : 'FAILED',
          sizeBytes: res.size_bytes ? BigInt(res.size_bytes) : undefined,
          checksum: res.checksum,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      await this.prisma.backup.update({
        where: { id: backupId },
        data: { status: 'FAILED', failReason: (err as Error).message },
      });
    }
  }

  async restore(backupId: string, user: AuthenticatedUser) {
    const backup = await this.prisma.backup.findUniqueOrThrow({
      where: { id: backupId },
      include: { server: { include: { node: true } } },
    });
    await this.servers.findAccessibleOrThrow(backup.serverId, user);

    await this.prisma.server.update({ where: { id: backup.serverId }, data: { status: 'RESTORING' } });
    await this.prisma.backup.update({ where: { id: backupId }, data: { status: 'RESTORING' } });

    await this.nodeClient.call(
      backup.server.nodeId,
      { host: backup.server.node.grpcHost, port: backup.server.node.grpcPort },
      'RestoreBackup',
      {
        server_uuid: backup.server.uuid,
        backup_id: backup.id,
        remote_path: backup.remotePath ?? '',
        driver: backup.driver,
        driver_config: {},
      },
    );

    await this.prisma.server.update({ where: { id: backup.serverId }, data: { status: 'OFFLINE' } });
    await this.audit.log({
      actorId: user.id,
      action: 'backup.restore',
      targetType: 'Server',
      targetId: backup.serverId,
      severity: 'WARNING',
    });
    return { success: true };
  }

  async delete(backupId: string, user: AuthenticatedUser) {
    const backup = await this.prisma.backup.findUniqueOrThrow({
      where: { id: backupId },
      include: { server: { include: { node: true } } },
    });
    await this.servers.findAccessibleOrThrow(backup.serverId, user);

    await this.nodeClient.call(
      backup.server.nodeId,
      { host: backup.server.node.grpcHost, port: backup.server.node.grpcPort },
      'DeleteBackup',
      { server_uuid: backup.server.uuid, backup_id: backup.id, remote_path: backup.remotePath ?? '', driver: backup.driver, driver_config: {} },
    );

    await this.prisma.backup.delete({ where: { id: backupId } });
    await this.audit.log({ actorId: user.id, action: 'backup.delete', targetType: 'Server', targetId: backup.serverId });
  }

  generateBackupId() {
    return uuidv4();
  }
}
