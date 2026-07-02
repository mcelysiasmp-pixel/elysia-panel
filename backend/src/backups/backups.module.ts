import { Module } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { AuditModule } from '../audit/audit.module';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [AuditModule, ServersModule],
  controllers: [BackupsController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
