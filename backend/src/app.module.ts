import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { GrpcClientModule } from './grpc-client/grpc-client.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { NodesModule } from './nodes/nodes.module';
import { ServersModule } from './servers/servers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    GrpcClientModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    NodesModule,
    ServersModule,
  ],
})
export class AppModule {}
