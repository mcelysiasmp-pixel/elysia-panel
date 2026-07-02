import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { GrpcClientModule } from './grpc-client/grpc-client.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { NodesModule } from './nodes/nodes.module';
import { ServersModule } from './servers/servers.module';
import { TemplatesModule } from './templates/templates.module';
import { FilesModule } from './files/files.module';
import { WebsocketModule } from './websocket/websocket.module';
import { BackupsModule } from './backups/backups.module';
import { ScheduledTasksModule } from './scheduled-tasks/scheduled-tasks.module';
import { ModsModule } from './mods/mods.module';
import { BillingModule } from './billing/billing.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { SupportModule } from './support/support.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
        },
      }),
    }),
    PrismaModule,
    GrpcClientModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    NodesModule,
    ServersModule,
    TemplatesModule,
    FilesModule,
    WebsocketModule,
    BackupsModule,
    ScheduledTasksModule,
    ModsModule,
    BillingModule,
    MarketplaceModule,
    SupportModule,
    MonitoringModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
