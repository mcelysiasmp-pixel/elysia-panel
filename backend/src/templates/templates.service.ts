import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.serverTemplate.findMany({
      where: { isPublic: true },
      orderBy: { name: 'asc' },
    });
  }

  create(data: Record<string, unknown>, actorId: string) {
    return this.prisma.serverTemplate
      .create({ data: data as any })
      .then((t) => {
        this.audit.log({
          actorId,
          action: 'template.create',
          targetType: 'ServerTemplate',
          targetId: t.id,
        });
        return t;
      });
  }
}
