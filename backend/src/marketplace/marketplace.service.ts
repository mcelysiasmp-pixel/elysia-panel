import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(type?: string) {
    return this.prisma.marketplaceItem.findMany({
      where: type ? { type: type as any } : undefined,
      orderBy: { downloads: 'desc' },
    });
  }

  get(slug: string) {
    return this.prisma.marketplaceItem.findUniqueOrThrow({ where: { slug } });
  }

  publish(
    data: {
      type: string;
      name: string;
      slug: string;
      description?: string;
      authorName: string;
      priceCents?: number;
      version: string;
      downloadUrl?: string;
      repoUrl?: string;
    },
    actorId: string,
  ) {
    return this.prisma.marketplaceItem
      .create({ data: { ...data, type: data.type as any } })
      .then((item) => {
        this.audit.log({ actorId, action: 'marketplace.publish', targetType: 'MarketplaceItem', targetId: item.id });
        return item;
      });
  }

  async incrementDownloads(slug: string) {
    return this.prisma.marketplaceItem.update({ where: { slug }, data: { downloads: { increment: 1 } } });
  }

  async verify(id: string, actorId: string) {
    const item = await this.prisma.marketplaceItem.update({ where: { id }, data: { verified: true } });
    await this.audit.log({ actorId, action: 'marketplace.verify', targetType: 'MarketplaceItem', targetId: id });
    return item;
  }
}
