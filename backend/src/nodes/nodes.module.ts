import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
