import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServersService } from '../servers/servers.service';
import { BackupsService } from '../backups/backups.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { SYSTEM_USER_ID } from '../common/constants';

// Pseudo-utilisateur système (voir prisma/seed.ts) utilisé pour les actions
// déclenchées par le scheduler ; les logs d'audit restent traçables via
// actorId = SYSTEM_USER_ID et action="scheduled_task.*"/"server.power.*".
const SYSTEM_ACTOR: AuthenticatedUser = {
  id: SYSTEM_USER_ID,
  email: 'system@elysia.local',
  username: 'system',
  roleId: null,
  permissions: ['*'],
};

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly servers: ServersService,
    private readonly backups: BackupsService,
  ) {}

  create(serverId: string, name: string, cronExpr: string, action: string, payload: Record<string, unknown> | undefined, actorId: string) {
    const nextRunAt = this.computeNextRun(cronExpr);
    return this.prisma.scheduledTask
      .create({
        data: { serverId, name, cronExpr, action: action as any, payload: payload as any, nextRunAt },
      })
      .then((task) => {
        this.audit.log({ actorId, action: 'scheduled_task.create', targetType: 'Server', targetId: serverId });
        return task;
      });
  }

  listForServer(serverId: string) {
    return this.prisma.scheduledTask.findMany({ where: { serverId }, orderBy: { createdAt: 'desc' } });
  }

  async setEnabled(id: string, enabled: boolean, actorId: string) {
    const task = await this.prisma.scheduledTask.update({ where: { id }, data: { enabled } });
    await this.audit.log({ actorId, action: enabled ? 'scheduled_task.enable' : 'scheduled_task.disable', targetType: 'ScheduledTask', targetId: id });
    return task;
  }

  async delete(id: string, actorId: string) {
    await this.prisma.scheduledTask.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'scheduled_task.delete', targetType: 'ScheduledTask', targetId: id });
  }

  // Vérifie chaque minute les tâches planifiées arrivées à échéance et les
  // exécute. Approche "poll" simple : suffisant tant que le nombre de
  // tâches reste dans un ordre de grandeur raisonnable (dizaines de milliers).
  @Cron(CronExpression.EVERY_MINUTE)
  async runDueTasks() {
    const due = await this.prisma.scheduledTask.findMany({
      where: { enabled: true, nextRunAt: { lte: new Date() } },
    });

    for (const task of due) {
      try {
        await this.execute(task.serverId, task.action, task.payload as Record<string, unknown> | null);
      } catch (err) {
        this.logger.error(`Tâche planifiée ${task.id} a échoué: ${(err as Error).message}`);
      } finally {
        await this.prisma.scheduledTask.update({
          where: { id: task.id },
          data: { lastRunAt: new Date(), nextRunAt: this.computeNextRun(task.cronExpr) },
        });
      }
    }
  }

  private async execute(serverId: string, action: string, payload: Record<string, unknown> | null) {
    switch (action) {
      case 'POWER_START':
        return this.servers.powerAction(serverId, 'start', SYSTEM_ACTOR);
      case 'POWER_STOP':
        return this.servers.powerAction(serverId, 'stop', SYSTEM_ACTOR);
      case 'POWER_RESTART':
        return this.servers.powerAction(serverId, 'restart', SYSTEM_ACTOR);
      case 'BACKUP_CREATE':
        return this.backups.create(serverId, `scheduled-${Date.now()}`, SYSTEM_ACTOR);
      case 'COMMAND_SEND':
        return this.servers.sendCommand(serverId, (payload?.command as string) ?? '', SYSTEM_ACTOR);
      default:
        this.logger.warn(`Action de tâche planifiée inconnue: ${action}`);
    }
  }

  private computeNextRun(cronExpr: string): Date {
    return CronExpressionParser.parse(cronExpr).next().toDate();
  }
}
