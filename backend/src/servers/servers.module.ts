import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { AuditModule } from '../audit/audit.module';
import { NodesModule } from '../nodes/nodes.module';

@Module({
  imports: [AuditModule, NodesModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
