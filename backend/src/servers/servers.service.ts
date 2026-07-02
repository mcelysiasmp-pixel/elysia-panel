import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NodesService } from '../nodes/nodes.service';
import { NodeClientService } from '../grpc-client/node-client.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';

const PORT_RANGE_START = 25565;
const PORT_RANGE_END = 25665;

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly nodes: NodesService,
    private readonly nodeClient: NodeClientService,
  ) {}

  listForUser(user: AuthenticatedUser) {
    const isAdmin =
      user.permissions.includes('*') ||
      user.permissions.includes('servers.read.any');
    return this.prisma.server.findMany({
      where: isAdmin ? undefined : { ownerId: user.id },
      include: {
        node: { select: { id: true, name: true } },
        template: true,
        allocations: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAccessibleOrThrow(id: string, user: AuthenticatedUser) {
    const server = await this.prisma.server.findUnique({
      where: { id },
      include: {
        node: true,
        template: true,
        allocations: true,
        subUsers: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });
    if (!server) throw new NotFoundException('Serveur introuvable');

    const isAdmin =
      user.permissions.includes('*') ||
      user.permissions.includes('servers.read.any');
    const isOwner = server.ownerId === user.id;
    const isSubUser = server.subUsers.some((su) => su.userId === user.id);
    if (!isAdmin && !isOwner && !isSubUser) {
      throw new ForbiddenException("Vous n'avez pas accès à ce serveur");
    }
    return server;
  }

  async create(dto: CreateServerDto, actor: AuthenticatedUser) {
    // dto.ownerId ne peut être utilisé que par un admin (wildcard '*') pour
    // provisionner un serveur au nom d'un client ; sinon un utilisateur
    // pourrait créer des serveurs facturés/attribués à un autre compte.
    // Vérifié avant tout travail (lookup template/node) par principe de
    // fail-fast sur l'autorisation.
    if (
      dto.ownerId &&
      dto.ownerId !== actor.id &&
      !actor.permissions.includes('*')
    ) {
      throw new ForbiddenException(
        'Seul un administrateur peut créer un serveur pour un autre utilisateur',
      );
    }
    const ownerId = dto.ownerId ?? actor.id;

    const template = await this.prisma.serverTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template)
      throw new BadRequestException('Template de serveur introuvable');

    const node = await this.nodes.findEligibleNode({
      cpuPct: dto.cpuLimitPct,
      memoryMb: dto.memoryLimitMb,
      diskMb: dto.diskLimitMb,
    });

    const server = await this.prisma.$transaction(async (tx) => {
      const created = await tx.server.create({
        data: {
          name: dto.name,
          description: dto.description,
          ownerId,
          nodeId: node.id,
          templateId: template.id,
          gameType: template.gameType,
          dockerImage: template.dockerImage,
          startupCommand: template.startupCommand,
          cpuLimitPct: dto.cpuLimitPct,
          memoryLimitMb: dto.memoryLimitMb,
          diskLimitMb: dto.diskLimitMb,
          environment: dto.environment ?? {},
          dataPath: '', // rempli ci-dessous une fois l'uuid connu
          status: 'INSTALLING',
        },
      });

      const dataPath = `/srv/elysia/servers/${created.uuid}`;
      await tx.server.update({ where: { id: created.id }, data: { dataPath } });

      await tx.node.update({
        where: { id: node.id },
        data: {
          cpuAllocatedPct: { increment: dto.cpuLimitPct },
          memoryAllocatedMb: { increment: dto.memoryLimitMb },
          diskAllocatedMb: { increment: dto.diskLimitMb },
        },
      });

      const port = await this.allocatePort(tx, node.id);
      await tx.networkAllocation.create({
        data: {
          nodeId: node.id,
          ip: '0.0.0.0',
          port,
          serverId: created.id,
          isPrimary: true,
        },
      });

      return { ...created, dataPath, port };
    });

    await this.audit.log({
      actorId: actor.id,
      action: 'server.create',
      targetType: 'Server',
      targetId: server.id,
      metadata: { name: dto.name, nodeId: node.id },
    });

    // Appel gRPC best-effort : le daemon peut ne pas être joignable en dev,
    // le serveur reste en base en statut INSTALL_FAILED le cas échéant, pour
    // reprise manuelle (bouton "réinstaller").
    this.provisionOnNode(
      server.id,
      node.id,
      node.grpcHost,
      node.grpcPort,
    ).catch((err) => {
      this.logger.warn(
        `Provisioning gRPC pour ${server.id} a échoué: ${err.message}`,
      );
    });

    return server;
  }

  private async provisionOnNode(
    serverId: string,
    nodeId: string,
    host: string,
    port: number,
  ) {
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      include: { allocations: true, template: true },
    });
    try {
      await this.nodeClient.call(nodeId, { host, port }, 'CreateServer', {
        server_uuid: server.uuid,
        docker_image: server.dockerImage,
        startup_command: server.startupCommand,
        cpu_limit_pct: server.cpuLimitPct,
        memory_limit_mb: server.memoryLimitMb,
        disk_limit_mb: server.diskLimitMb,
        swap_limit_mb: server.swapLimitMb,
        io_weight: server.ioWeight,
        environment: server.environment as Record<string, string>,
        ports: server.allocations.map((a) => ({
          ip: a.ip,
          port: a.port,
          protocol: 'tcp',
        })),
        install_script: server.template.installScript ?? '',
      });
      await this.prisma.server.update({
        where: { id: serverId },
        data: { status: 'OFFLINE' },
      });
    } catch (err) {
      await this.prisma.server.update({
        where: { id: serverId },
        data: { status: 'INSTALL_FAILED' },
      });
      throw err;
    }
  }

  async powerAction(
    id: string,
    action: 'start' | 'stop' | 'restart' | 'kill',
    actor: AuthenticatedUser,
  ) {
    const server = await this.findAccessibleOrThrow(id, actor);
    if (server.suspended) throw new BadRequestException('Serveur suspendu');

    const grpcMethod = {
      start: 'StartServer',
      stop: 'StopServer',
      restart: 'RestartServer',
      kill: 'KillServer',
    }[action];

    const optimisticStatus = {
      start: 'STARTING',
      stop: 'STOPPING',
      restart: 'STARTING',
      kill: 'OFFLINE',
    }[action] as 'STARTING' | 'STOPPING' | 'OFFLINE';

    await this.prisma.server.update({
      where: { id },
      data: { status: optimisticStatus },
    });

    await this.nodeClient.call(
      server.nodeId,
      { host: server.node.grpcHost, port: server.node.grpcPort },
      grpcMethod,
      { server_uuid: server.uuid },
    );

    await this.audit.log({
      actorId: actor.id,
      action: `server.power.${action}`,
      targetType: 'Server',
      targetId: id,
    });

    return { success: true };
  }

  async sendCommand(id: string, command: string, actor: AuthenticatedUser) {
    const server = await this.findAccessibleOrThrow(id, actor);
    return this.nodeClient.call(
      server.nodeId,
      { host: server.node.grpcHost, port: server.node.grpcPort },
      'SendCommand',
      { server_uuid: server.uuid, command },
    );
  }

  async suspend(id: string, reason: string, actorId: string) {
    const server = await this.prisma.server.update({
      where: { id },
      data: { suspended: true, suspendedReason: reason, status: 'SUSPENDED' },
    });
    await this.audit.log({
      actorId,
      action: 'server.suspend',
      targetType: 'Server',
      targetId: id,
      severity: 'WARNING',
      metadata: { reason },
    });
    return server;
  }

  async unsuspend(id: string, actorId: string) {
    const server = await this.prisma.server.update({
      where: { id },
      data: { suspended: false, suspendedReason: null, status: 'OFFLINE' },
    });
    await this.audit.log({
      actorId,
      action: 'server.unsuspend',
      targetType: 'Server',
      targetId: id,
    });
    return server;
  }

  async delete(id: string, actor: AuthenticatedUser) {
    const server = await this.findAccessibleOrThrow(id, actor);

    try {
      await this.nodeClient.call(
        server.nodeId,
        { host: server.node.grpcHost, port: server.node.grpcPort },
        'DeleteServer',
        { server_uuid: server.uuid },
      );
    } catch (err) {
      this.logger.warn(
        `Suppression distante a échoué pour ${id}: ${(err as Error).message}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.node.update({
        where: { id: server.nodeId },
        data: {
          cpuAllocatedPct: { decrement: server.cpuLimitPct },
          memoryAllocatedMb: { decrement: server.memoryLimitMb },
          diskAllocatedMb: { decrement: server.diskLimitMb },
        },
      }),
      this.prisma.server.delete({ where: { id } }),
    ]);

    await this.audit.log({
      actorId: actor.id,
      action: 'server.delete',
      targetType: 'Server',
      targetId: id,
      severity: 'WARNING',
    });
  }

  async update(id: string, dto: UpdateServerDto, actor: AuthenticatedUser) {
    await this.findAccessibleOrThrow(id, actor);
    const server = await this.prisma.server.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        dockerImage: dto.dockerImage,
        startupCommand: dto.startupCommand,
        environment: dto.environment,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'server.update',
      targetType: 'Server',
      targetId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return server;
  }

  // Recrée le conteneur avec la configuration actuelle (image/startup/env en
  // base) : nécessaire pour qu'un changement de variables ou d'image Docker
  // prenne effet, le simple redémarrage ne relit pas cette configuration.
  async reinstall(id: string, actor: AuthenticatedUser) {
    const server = await this.findAccessibleOrThrow(id, actor);
    await this.nodeClient.call(
      server.nodeId,
      { host: server.node.grpcHost, port: server.node.grpcPort },
      'ReinstallServer',
      {
        server_uuid: server.uuid,
        docker_image: server.dockerImage,
        startup_command: server.startupCommand,
        cpu_limit_pct: server.cpuLimitPct,
        memory_limit_mb: server.memoryLimitMb,
        disk_limit_mb: server.diskLimitMb,
        swap_limit_mb: server.swapLimitMb,
        io_weight: server.ioWeight,
        environment: server.environment as Record<string, string>,
        ports: server.allocations.map((a) => ({
          ip: a.ip,
          port: a.port,
          protocol: 'tcp',
        })),
        install_script: server.template.installScript ?? '',
      },
    );
    await this.prisma.server.update({
      where: { id },
      data: { status: 'OFFLINE' },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'server.reinstall',
      targetType: 'Server',
      targetId: id,
    });
    return { success: true };
  }

  async addAllocation(serverId: string, actor: AuthenticatedUser) {
    const server = await this.findAccessibleOrThrow(serverId, actor);
    const allocation = await this.prisma.$transaction(async (tx) => {
      const port = await this.allocatePort(tx, server.nodeId);
      return tx.networkAllocation.create({
        data: {
          nodeId: server.nodeId,
          ip: '0.0.0.0',
          port,
          serverId,
          isPrimary: false,
        },
      });
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'server.allocation.add',
      targetType: 'Server',
      targetId: serverId,
      metadata: { port: allocation.port },
    });
    return allocation;
  }

  async removeAllocation(
    serverId: string,
    allocationId: string,
    actor: AuthenticatedUser,
  ) {
    await this.findAccessibleOrThrow(serverId, actor);
    const allocation = await this.prisma.networkAllocation.findUnique({
      where: { id: allocationId },
    });
    if (!allocation || allocation.serverId !== serverId)
      throw new NotFoundException('Allocation introuvable');
    if (allocation.isPrimary)
      throw new BadRequestException(
        "Impossible de supprimer l'allocation primaire",
      );
    await this.prisma.networkAllocation.delete({ where: { id: allocationId } });
    await this.audit.log({
      actorId: actor.id,
      action: 'server.allocation.remove',
      targetType: 'Server',
      targetId: serverId,
      metadata: { port: allocation.port },
    });
  }

  async addSubUser(
    serverId: string,
    userId: string,
    permissions: string[],
    actor: AuthenticatedUser,
  ) {
    const server = await this.findAccessibleOrThrow(serverId, actor);
    if (server.ownerId !== actor.id && !actor.permissions.includes('*')) {
      throw new ForbiddenException(
        'Seul le propriétaire peut gérer les sous-utilisateurs',
      );
    }
    return this.prisma.serverSubUser.upsert({
      where: { serverId_userId: { serverId, userId } },
      update: { permissions },
      create: { serverId, userId, permissions },
    });
  }

  async removeSubUser(
    serverId: string,
    userId: string,
    actor: AuthenticatedUser,
  ) {
    const server = await this.findAccessibleOrThrow(serverId, actor);
    if (server.ownerId !== actor.id && !actor.permissions.includes('*')) {
      throw new ForbiddenException(
        'Seul le propriétaire peut gérer les sous-utilisateurs',
      );
    }
    await this.prisma.serverSubUser.delete({
      where: { serverId_userId: { serverId, userId } },
    });
  }

  private async allocatePort(tx: Prisma.TransactionClient, nodeId: string) {
    const used = await tx.networkAllocation.findMany({
      where: {
        nodeId,
        ip: '0.0.0.0',
        port: { gte: PORT_RANGE_START, lte: PORT_RANGE_END },
      },
      select: { port: true },
    });
    const usedPorts = new Set(used.map((u) => u.port));
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (!usedPorts.has(port)) return port;
    }
    throw new BadRequestException('Plus de port disponible sur ce node');
  }
}
