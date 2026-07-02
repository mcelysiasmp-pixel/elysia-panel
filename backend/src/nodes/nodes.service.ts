import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NodeClientService } from '../grpc-client/node-client.service';
import { CreateNodeDto } from './dto/create-node.dto';

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly nodeClient: NodeClientService,
  ) {}

  list() {
    return this.prisma.node.findMany({
      include: { _count: { select: { servers: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findByIdOrThrow(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('Node introuvable');
    return node;
  }

  create(dto: CreateNodeDto, actorId: string) {
    return this.prisma.node
      .create({
        data: {
          name: dto.name,
          fqdn: dto.fqdn,
          region: dto.region,
          grpcHost: dto.grpcHost,
          grpcPort: dto.grpcPort ?? 9501,
          cpuCores: dto.cpuCores,
          memoryMb: dto.memoryMb,
          diskMb: dto.diskMb,
          dockerNetworkSubnet: dto.dockerNetworkSubnet,
        },
      })
      .then((node) => {
        this.audit.log({
          actorId,
          action: 'node.create',
          targetType: 'Node',
          targetId: node.id,
        });
        return node;
      });
  }

  async setMaintenance(id: string, enabled: boolean, actorId: string) {
    const node = await this.prisma.node.update({
      where: { id },
      data: {
        maintenanceMode: enabled,
        status: enabled ? 'MAINTENANCE' : 'ONLINE',
      },
    });
    await this.audit.log({
      actorId,
      action: enabled ? 'node.maintenance.enable' : 'node.maintenance.disable',
      targetType: 'Node',
      targetId: id,
      severity: 'WARNING',
    });
    return node;
  }

  async delete(id: string, actorId: string) {
    const remaining = await this.prisma.server.count({ where: { nodeId: id } });
    if (remaining > 0) {
      throw new BadRequestException(
        `Impossible de supprimer ce node : ${remaining} serveur(s) y sont encore hébergés`,
      );
    }
    this.nodeClient.disconnect(id);
    await this.prisma.node.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'node.delete',
      targetType: 'Node',
      targetId: id,
      severity: 'WARNING',
    });
  }

  async healthCheck(id: string) {
    const node = await this.findByIdOrThrow(id);
    try {
      const res = await this.nodeClient.ping(node.id, {
        host: node.grpcHost,
        port: node.grpcPort,
      });
      await this.prisma.node.update({
        where: { id },
        data: { status: 'ONLINE', lastHeartbeatAt: new Date() },
      });
      return { online: true, ...res };
    } catch (err) {
      await this.prisma.node.update({
        where: { id },
        data: { status: 'OFFLINE' },
      });
      return { online: false, error: (err as Error).message };
    }
  }

  // Sélectionne le node avec le plus de capacité disponible pour un profil
  // de ressources donné (utilisé par ServersService à la création).
  async findEligibleNode(requirements: {
    cpuPct: number;
    memoryMb: number;
    diskMb: number;
  }) {
    const nodes = await this.prisma.node.findMany({
      where: { status: 'ONLINE', maintenanceMode: false },
    });

    const eligible = nodes.filter((n) => {
      const cpuCapacityPct =
        n.cpuCores * 100 * (1 + n.overallocateCpuPct / 100);
      const memCapacity = n.memoryMb * (1 + n.overallocateMemPct / 100);
      const diskCapacity = n.diskMb * (1 + n.overallocateDiskPct / 100);
      return (
        n.cpuAllocatedPct + requirements.cpuPct <= cpuCapacityPct &&
        n.memoryAllocatedMb + requirements.memoryMb <= memCapacity &&
        n.diskAllocatedMb + requirements.diskMb <= diskCapacity
      );
    });

    if (eligible.length === 0) {
      throw new BadRequestException(
        'Aucun node disponible avec suffisamment de capacité',
      );
    }

    // Le moins chargé proportionnellement en RAM en premier (bin-packing simple)
    eligible.sort(
      (a, b) =>
        a.memoryAllocatedMb / a.memoryMb - b.memoryAllocatedMb / b.memoryMb,
    );
    return eligible[0];
  }
}
