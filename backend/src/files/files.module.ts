import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { SftpAuthService } from './sftp-auth.service';
import { SftpAuthController } from './sftp-auth.controller';
import { ServersModule } from '../servers/servers.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ServersModule, AuditModule, AuthModule],
  controllers: [FilesController, SftpAuthController],
  providers: [FilesService, SftpAuthService],
})
export class FilesModule {}
