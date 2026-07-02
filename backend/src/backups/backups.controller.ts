import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BackupsService } from './backups.service';

@Controller('servers/:serverId/backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @RequirePermissions('backups.create')
  list(
    @Param('serverId') serverId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.backups.listForServer(serverId, user);
  }

  @Post()
  @RequirePermissions('backups.create')
  create(
    @Param('serverId') serverId: string,
    @Body('name') name: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.backups.create(serverId, name ?? `backup-${Date.now()}`, user);
  }

  @Post(':backupId/restore')
  @RequirePermissions('backups.restore')
  restore(
    @Param('backupId') backupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.backups.restore(backupId, user);
  }

  @Delete(':backupId')
  @RequirePermissions('backups.delete')
  delete(
    @Param('backupId') backupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.backups.delete(backupId, user);
  }
}
