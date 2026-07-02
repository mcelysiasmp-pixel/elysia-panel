import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Gauge } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectMetric('elysia_nodes_online') private readonly nodesOnlineGauge: Gauge<string>,
    @InjectMetric('elysia_servers_running') private readonly serversRunningGauge: Gauge<string>,
    @InjectMetric('elysia_servers_total') private readonly serversTotalGauge: Gauge<string>,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async refreshGauges() {
    const [nodesOnline, serversRunning, serversTotal] = await Promise.all([
      this.prisma.node.count({ where: { status: 'ONLINE' } }),
      this.prisma.server.count({ where: { status: 'RUNNING' } }),
      this.prisma.server.count(),
    ]);
    this.nodesOnlineGauge.set(nodesOnline);
    this.serversRunningGauge.set(serversRunning);
    this.serversTotalGauge.set(serversTotal);
  }

  // Résumé JSON consommé par les widgets du panel admin (étape 11).
  async summary() {
    const [nodes, servers, users, invoicesUnpaid] = await Promise.all([
      this.prisma.node.findMany({ select: { status: true, cpuCores: true, cpuAllocatedPct: true, memoryMb: true, memoryAllocatedMb: true, diskMb: true, diskAllocatedMb: true } }),
      this.prisma.server.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.count(),
      this.prisma.invoice.count({ where: { status: 'OPEN' } }),
    ]);

    return {
      nodes: {
        total: nodes.length,
        online: nodes.filter((n) => n.status === 'ONLINE').length,
        cpuAllocatedPct: nodes.reduce((sum, n) => sum + n.cpuAllocatedPct, 0),
        cpuCapacityPct: nodes.reduce((sum, n) => sum + n.cpuCores * 100, 0),
        memoryAllocatedMb: nodes.reduce((sum, n) => sum + n.memoryAllocatedMb, 0),
        memoryCapacityMb: nodes.reduce((sum, n) => sum + n.memoryMb, 0),
        diskAllocatedMb: nodes.reduce((sum, n) => sum + n.diskAllocatedMb, 0),
        diskCapacityMb: nodes.reduce((sum, n) => sum + n.diskMb, 0),
      },
      servers: servers.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count;
        return acc;
      }, {}),
      users,
      invoicesUnpaid,
    };
  }
}
