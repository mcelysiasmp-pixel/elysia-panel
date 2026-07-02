import { Module } from '@nestjs/common';
import { ConsoleGateway } from './console.gateway';
import { AuthModule } from '../auth/auth.module';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [AuthModule, ServersModule],
  providers: [ConsoleGateway],
})
export class WebsocketModule {}
