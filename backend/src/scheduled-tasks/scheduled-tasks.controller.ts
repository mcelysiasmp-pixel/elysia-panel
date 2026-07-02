import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Controller('servers/:serverId/scheduled-tasks')
export class ScheduledTasksController {
  constructor(private readonly tasks: ScheduledTasksService) {}

  @Get()
  @RequirePermissions('servers.update')
  list(@Param('serverId') serverId: string) {
    return this.tasks.listForServer(serverId);
  }

  @Post()
  @RequirePermissions('servers.update')
  create(
    @Param('serverId') serverId: string,
    @Body('name') name: string,
    @Body('cronExpr') cronExpr: string,
    @Body('action') action: string,
    @Body('payload') payload: Record<string, unknown> | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.create(serverId, name, cronExpr, action, payload, actor.id);
  }

  @Post(':id/enable')
  @RequirePermissions('servers.update')
  enable(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.setEnabled(id, true, actor.id);
  }

  @Post(':id/disable')
  @RequirePermissions('servers.update')
  disable(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.setEnabled(id, false, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('servers.update')
  delete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.delete(id, actor.id);
  }
}
