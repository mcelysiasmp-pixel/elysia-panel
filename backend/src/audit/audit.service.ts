import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

interface AuditEntry {
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  severity?: Severity;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        severity: entry.severity ?? 'INFO',
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  }

  async list(params: { skip?: number; take?: number; actorId?: string; targetType?: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        actorId: params.actorId,
        targetType: params.targetType,
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      include: { actor: { select: { id: true, username: true, email: true } } },
    });
  }
}
