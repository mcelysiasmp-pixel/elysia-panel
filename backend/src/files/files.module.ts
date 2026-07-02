import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { ServersModule } from '../servers/servers.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ServersModule, AuditModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
