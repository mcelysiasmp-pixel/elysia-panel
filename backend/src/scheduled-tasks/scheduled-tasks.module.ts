import { Module } from '@nestjs/common';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { ScheduledTasksController } from './scheduled-tasks.controller';
import { AuditModule } from '../audit/audit.module';
import { ServersModule } from '../servers/servers.module';
import { BackupsModule } from '../backups/backups.module';

@Module({
  imports: [AuditModule, ServersModule, BackupsModule],
  controllers: [ScheduledTasksController],
  providers: [ScheduledTasksService],
})
export class ScheduledTasksModule {}
