import { Module } from '@nestjs/common';
import { ModrinthService } from './modrinth.service';
import { CurseforgeService } from './curseforge.service';
import { ModsService } from './mods.service';
import { ModsController } from './mods.controller';
import { AuditModule } from '../audit/audit.module';
import { ServersModule } from '../servers/servers.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';

@Module({
  imports: [AuditModule, ServersModule, MarketplaceModule],
  controllers: [ModsController],
  providers: [ModrinthService, CurseforgeService, ModsService],
  exports: [ModrinthService, CurseforgeService, ModsService],
})
export class ModsModule {}
